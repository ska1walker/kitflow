"use server";

/**
 * Die Server Actions der Spartenübersicht: Stufe von Hand setzen, abmelden.
 *
 * **Warum es den Stufenwechsel gibt.** Seit dem Umzug leben die Vorgänge in der
 * eigenen Datenbank, und der Deal in HubSpot ist nur noch ein dünner Spiegel,
 * der nie zurückgelesen wird (`spiegel.ts`). Eine Stufe, die jemand in HubSpot
 * von Hand verschiebt, kommt also nicht mehr bei kitflow an — vorher ging das.
 * Diese Karte ist der Ausgleich dafür; ohne sie hätte der Umzug eine Fähigkeit
 * gekostet.
 *
 * **Jede Action prüft selbst.** Eine Server Action ist eine eigene Adresse und
 * lässt sich ohne die Seite aufrufen; der `proxy` schützt nur den Seitenaufruf
 * und tut das ausdrücklich optimistisch.
 */

import { redirect } from "next/navigation";
import { authClient, spartenLeitung } from "@/lib/anmeldung";
import { dbAktiv } from "@/lib/db";
import { aendereVorgang, setzeStufe, vermerke, vorgangPerNummer } from "@/lib/vorgaenge-db";
import { gibFrei, lehneAb } from "@/lib/vorgaenge";
import { spiegele } from "@/lib/spiegel";
import { stufe as stufeVon } from "@/lib/stufen";
import type { StufeNr } from "@/lib/typen";

export type StufenStand =
  | { stand: "leer" }
  | { stand: "fertig"; nummer: string; titel: string }
  | { stand: "fehler"; text: string };

/** Eine Zahl aus dem Formular, nur wenn sie wirklich eine Stufe benennt. */
function alsStufe(wert: string): StufeNr | null {
  if (!/^[0-9]$/.test(wert)) return null;
  const nr = Number(wert) as StufeNr;
  try {
    stufeVon(nr);
    return nr;
  } catch {
    return null;
  }
}

export async function stufeSetzen(_bisher: StufenStand, formular: FormData): Promise<StufenStand> {
  const wer = await spartenLeitung();
  if (!wer) return { stand: "fehler", text: "Dafür musst du angemeldet sein." };

  const nummer = String(formular.get("vorgang") ?? "").trim();
  const ziel = alsStufe(String(formular.get("stufe") ?? "").trim());
  if (!nummer) return { stand: "fehler", text: "Bitte einen Vorgang wählen." };
  if (ziel === null) return { stand: "fehler", text: "Bitte eine Stufe wählen." };

  if (!dbAktiv()) {
    return { stand: "fehler", text: "Das hat gerade nicht geklappt. Bitte versuch es später." };
  }

  const abruf = await vorgangPerNummer(nummer);
  if (abruf.stand === "gestoert") {
    return {
      stand: "fehler",
      text: "kitflow kommt gerade nicht an die Daten. Bitte versuch es in einer Minute noch einmal.",
    };
  }
  if (abruf.stand !== "da") return { stand: "fehler", text: `Vorgang ${nummer} gibt es nicht.` };
  const vorgang = abruf.vorgang;

  if (vorgang.stufe === ziel) {
    return { stand: "fehler", text: `${nummer} steht schon auf „${stufeVon(ziel).intern}“.` };
  }

  // Beim Abbruch festhalten, wo der Vorgang stand – sonst lässt er sich später
  // nicht wieder aufnehmen (dieselbe Regel wie beim Abbruch einer Voranfrage).
  const gesetzt = await setzeStufe(vorgang.id, ziel, ziel === 9 ? vorgang.stufe : undefined);
  if (!gesetzt) {
    return { stand: "fehler", text: "Das hat gerade nicht geklappt. Bitte versuch es später." };
  }

  // Wer es war, gehört in den Verlauf: der Sinn des Logins ist, dass das nicht
  // mehr anonym passiert. `intern`, weil es Spieler und Eltern nichts angeht.
  await vermerke(vorgang.id, {
    art: "stufe-gesetzt",
    text: `Stufe von Hand auf „${stufeVon(ziel).intern}“ gesetzt`,
    sub: wer,
    intern: true,
    abStufe: 0,
  });

  // Der Spiegel ist nur Sicht: scheitert er, bleibt der Vorgang gültig.
  const frisch = await vorgangPerNummer(nummer);
  if (frisch.stand === "da") await spiegele(frisch.vorgang);

  return { stand: "fertig", nummer, titel: stufeVon(ziel).intern };
}

/** Abmelden. Danach greift der `proxy` und schickt zur Anmeldung. */
export async function abmelden(): Promise<void> {
  const client = await authClient();
  if (client) await client.auth.signOut();
  redirect("/anmelden");
}

export type FristStand =
  | { stand: "leer" }
  | { stand: "fertig"; nummer: string; frist: string; vergangen: boolean }
  | { stand: "fehler"; text: string };

/** „2026-09-30“ wird „30.09.2026“ — die Rückmeldung liest ein Mensch. */
function deutsch(iso: string): string {
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return t ? `${t[3]}.${t[2]}.${t[1]}` : iso;
}

/**
 * Die Größenfrist eines laufenden Vorgangs ändern.
 *
 * Bis hierher gab es dafür keine Stelle: F1 setzt sie beim Anlegen, F1b beim
 * Vervollständigen einer Voranfrage — danach stand sie fest. Aufgefallen ist
 * das an einem echten Vorgang, dessen Frist so knapp lag, dass der
 * Erinnerungslauf nie zum Zug gekommen wäre: er verlangt drei Tage Abstand zur
 * letzten Mail, und die Frist lag zwei Tage voraus.
 *
 * Genau deshalb ist das Verlängern mehr als Kosmetik — es entscheidet, ob
 * überhaupt noch jemand erinnert wird.
 */
export async function fristSetzen(_bisher: FristStand, formular: FormData): Promise<FristStand> {
  const wer = await spartenLeitung();
  if (!wer) return { stand: "fehler", text: "Dafür musst du angemeldet sein." };

  const nummer = String(formular.get("vorgang") ?? "").trim();
  const frist = String(formular.get("frist") ?? "").trim();
  if (!nummer) return { stand: "fehler", text: "Bitte einen Vorgang wählen." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(frist)) {
    return { stand: "fehler", text: "Bitte ein Datum wählen." };
  }

  // Tippfehler-Riegel: „2206“ statt „2026“ schöbe die Frist um 180 Jahre und
  // liefe nie ab. Ein Datum, das gar keines ist, fängt der Test davor nicht.
  const tag = new Date(`${frist}T12:00:00Z`);
  if (Number.isNaN(tag.getTime())) return { stand: "fehler", text: "Bitte ein Datum wählen." };
  const jahre = (tag.getTime() - Date.now()) / (365 * 86_400_000);
  if (jahre > 2 || jahre < -5) {
    return { stand: "fehler", text: "Dieses Datum liegt zu weit weg. Bitte noch einmal prüfen." };
  }

  if (!dbAktiv()) {
    return { stand: "fehler", text: "Das hat gerade nicht geklappt. Bitte versuch es später." };
  }

  const abruf = await vorgangPerNummer(nummer);
  if (abruf.stand === "gestoert") {
    return {
      stand: "fehler",
      text: "kitflow kommt gerade nicht an die Daten. Bitte versuch es in einer Minute noch einmal.",
    };
  }
  if (abruf.stand !== "da") return { stand: "fehler", text: `Vorgang ${nummer} gibt es nicht.` };
  const vorgang = abruf.vorgang;

  // Nur solange Größen gesammelt werden. Danach ist die Frist Geschichte, und
  // sie zu ändern sähe aus, als ließe sich noch etwas eintragen.
  if (vorgang.stufe !== 1) {
    return { stand: "fehler", text: `Für ${nummer} werden keine Größen mehr gesammelt.` };
  }
  if (vorgang.groessenFrist === frist) {
    return { stand: "fehler", text: `${nummer} steht schon auf dem ${deutsch(frist)}.` };
  }

  const gesetzt = await aendereVorgang(vorgang.id, { groessenFrist: frist });
  if (!gesetzt) {
    return { stand: "fehler", text: "Das hat gerade nicht geklappt. Bitte versuch es später." };
  }

  await vermerke(vorgang.id, {
    art: "frist-gesetzt",
    text: `Größenfrist von Hand auf den ${deutsch(frist)} gesetzt`,
    sub: wer,
    intern: true,
    abStufe: 1,
  });

  const frisch = await vorgangPerNummer(nummer);
  if (frisch.stand === "da") await spiegele(frisch.vorgang);

  // Eine Frist in der Vergangenheit ist erlaubt – man korrigiert damit einen
  // Tippfehler. Verschwiegen wird sie nicht: der Erinnerungslauf rührt sich
  // danach nie wieder.
  return { stand: "fertig", nummer, frist: deutsch(frist), vergangen: tag.getTime() < Date.now() };
}

/* ------------------------------------------------------------------ *
 * Die Freigabe der Händleranfrage
 * ------------------------------------------------------------------ */

export type FreigabeStand =
  | { stand: "leer" }
  | { stand: "raus"; nummer: string; anHaendler: number }
  | { stand: "gestoppt"; nummer: string }
  | { stand: "fehler"; text: string };

/** Was schiefgehen kann, in Worten für einen Menschen. */
function freigabeFehler(grund: string | undefined, nummer: string): string {
  switch (grund) {
    case "gestoert":
      return "kitflow kommt gerade nicht an die Daten. Bitte versuch es in einer Minute noch einmal.";
    case "unbekannt":
      return `Vorgang ${nummer} gibt es nicht.`;
    case "nicht_offen":
      return `Für ${nummer} steht gerade keine Freigabe aus. Lade die Seite neu.`;
    case "ohne_haendler":
      return "Es ist kein Händler hinterlegt (HAENDLER). Die Anfrage kann nicht rausgehen.";
    default:
      return "Die Anfrage ging nicht raus. Am Vorgang steht, woran es lag.";
  }
}

/**
 * Die Anfrage an die Händler freigeben.
 *
 * Das ist die einzige Stelle, an der ein Mensch eine Mail nach draußen auslöst.
 * Sie prüft die Anmeldung selbst — der `proxy` prüft ausdrücklich optimistisch,
 * und eine Server Action ist eine eigene Adresse.
 */
export async function freigeben(
  _bisher: FreigabeStand,
  formular: FormData,
): Promise<FreigabeStand> {
  const wer = await spartenLeitung();
  if (!wer) return { stand: "fehler", text: "Dafür musst du angemeldet sein." };

  const nummer = String(formular.get("vorgang") ?? "").trim();
  if (!nummer) return { stand: "fehler", text: "Bitte einen Vorgang wählen." };

  if (!dbAktiv()) {
    return { stand: "fehler", text: "Das hat gerade nicht geklappt. Bitte versuch es später." };
  }

  const ergebnis = await gibFrei(nummer, { art: "mensch", email: wer });
  if (!ergebnis.ok) return { stand: "fehler", text: freigabeFehler(ergebnis.grund, nummer) };

  return { stand: "raus", nummer, anHaendler: ergebnis.anHaendler };
}

/**
 * Die Anfrage stoppen, mit Grund.
 *
 * Der Grund ist Pflicht: ohne ihn bliebe der Vorgang stumm liegen, und der
 * Trainer wüsste nicht, was er ändern soll. Er geht ihm auch per Mail zu.
 */
export async function ablehnen(
  _bisher: FreigabeStand,
  formular: FormData,
): Promise<FreigabeStand> {
  const wer = await spartenLeitung();
  if (!wer) return { stand: "fehler", text: "Dafür musst du angemeldet sein." };

  const nummer = String(formular.get("vorgang") ?? "").trim();
  const grund = String(formular.get("grund") ?? "").trim();
  if (!nummer) return { stand: "fehler", text: "Bitte einen Vorgang wählen." };
  if (grund.length < 5) {
    return { stand: "fehler", text: "Bitte schreib dazu, was geändert werden soll." };
  }

  if (!dbAktiv()) {
    return { stand: "fehler", text: "Das hat gerade nicht geklappt. Bitte versuch es später." };
  }

  const ergebnis = await lehneAb(nummer, { art: "mensch", email: wer }, grund);
  if (!ergebnis.ok) return { stand: "fehler", text: freigabeFehler(ergebnis.grund, nummer) };

  return { stand: "gestoppt", nummer };
}
