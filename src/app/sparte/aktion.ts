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
import {
  aendereVorgang,
  setzeAngebot,
  setzeFreigabe,
  setzeStufe,
  vermerke,
  vorgangPerNummer,
  type HaendlerSpalte,
} from "@/lib/vorgaenge-db";
import { GRENZE_BYTES, lade, ladeFehlerText } from "@/lib/ablage";
import { gibFrei, lehneAb, type FreigabeGrund } from "@/lib/vorgaenge";
import { istGedeckt } from "@/lib/ansicht";
import { spiegele } from "@/lib/spiegel";
import { stufe as stufeVon } from "@/lib/stufen";
import type { StufeNr } from "@/lib/typen";

/**
 * Zwei Sätze, die auf dieser Seite sechsmal beziehungsweise dreimal standen.
 *
 * Sie sagen verschiedene Dinge und dürfen nicht verschmelzen: das eine heißt
 * „kitflow konnte nicht fragen“, das andere „der Schreibversuch ging schief“.
 * Getrennt benannt, damit das beim Umformulieren so bleibt.
 */
const NICHT_GEKLAPPT = "Das hat gerade nicht geklappt. Bitte versuch es später.";
const NICHT_ERREICHBAR =
  "kitflow kommt gerade nicht an die Daten. Bitte versuch es in einer Minute noch einmal.";

export type StufenStand =
  | { stand: "leer" }
  | { stand: "fertig"; nummer: string; titel: string }
  /**
   * Der Sprung auf „Bestellt“ oder weiter, ohne dass das Geld da ist. Kein
   * Fehler — eine Rückfrage. Bestätigt der Mensch, wird es gesetzt und steht
   * mit seinem Namen im Verlauf.
   */
  | { stand: "deckung"; nummer: string; titel: string; ziel: StufeNr }
  | { stand: "fehler"; text: string };

/**
 * Ab hier ist bestellt, und bestellt heißt: es kostet Geld.
 *
 * Kais Regel lautet „bestellt wird erst, wenn das Geld da ist; eine Zusage
 * allein macht nie bestellbar“. Sie stand bis zum 20.09.2026 nur in der Doku —
 * `gedeckt` wurde berechnet und ausschließlich angezeigt.
 *
 * **Warum eine Rückfrage und keine Sperre.** Die Zahlen, aus denen sich die
 * Deckung ergibt (Angebotsbeträge, gewählter Händler, Geldeingang), schreibt
 * heute keine einzige Stelle der Anwendung — `istGedeckt` ist damit immer
 * `false`. Eine harte Sperre machte „Bestellt“ für immer unerreichbar: eine
 * Mauer vor einer Tür, die niemand öffnen kann. Sobald die Finanzfelder
 * pflegbar sind, kann aus der Rückfrage eine Sperre werden.
 */
const BESTELLT: StufeNr = 6;

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

  if (!dbAktiv()) return { stand: "fehler", text: NICHT_GEKLAPPT };

  const abruf = await vorgangPerNummer(nummer);
  if (abruf.stand === "gestoert") {
    return { stand: "fehler", text: NICHT_ERREICHBAR };
  }
  if (abruf.stand !== "da") return { stand: "fehler", text: `Vorgang ${nummer} gibt es nicht.` };
  const vorgang = abruf.vorgang;

  if (vorgang.stufe === ziel) {
    return { stand: "fehler", text: `${nummer} steht schon auf „${stufeVon(ziel).intern}“.` };
  }

  // Beim Abbruch festhalten, wo der Vorgang stand – sonst lässt er sich später
  // nicht wieder aufnehmen (dieselbe Regel wie beim Abbruch einer Voranfrage).
  const gesetzt = await setzeStufe(vorgang.id, ziel, ziel === 9 ? vorgang.stufe : undefined);
  if (!gesetzt) return { stand: "fehler", text: NICHT_GEKLAPPT };

  // Stufe 9 ist der Abbruch, nicht der Fortschritt — der kostet nichts.
  if (ziel >= BESTELLT && ziel !== 9 && !istGedeckt(vorgang)) {
    if (formular.get("trotzdem") !== "ja") {
      return { stand: "deckung", nummer, titel: stufeVon(ziel).intern, ziel };
    }
    await vermerke(vorgang.id, {
      art: "stufe-gesetzt",
      text: `Auf „${stufeVon(ziel).intern}“ gesetzt, OHNE dass die Deckung nachgewiesen ist`,
      sub: wer,
      intern: true,
      abStufe: 0,
    });
  }

  // Eine Freigabe, die auf Stufe 1 gewartet hat, ist mit dem Stufenwechsel
  // gegenstandslos. Sie muss weg, sonst bliebe die Karte auf /sparte stehen und
  // lüde zu einem Klick ein, der einen abgebrochenen Vorgang wiederbelebte.
  //
  // `keine` und nicht `abgelehnt`: abgelehnt heißt bei uns „die Spartenleitung
  // hat gestoppt“ und schickt M4b mit Begründung an den Trainer. Ein
  // Stufenwechsel ist keine Entscheidung über die Anfrage, und eine Mail, die
  // niemand ausgelöst hat, wäre hier falsch. Was passiert ist, steht im Verlauf.
  //
  // Scheitert es, ist das kein Abbruch: `gibFrei` prüft die Stufe selbst und
  // weist die Freigabe auch dann ab. Diese Zeile räumt auf, sie sichert nicht.
  if (vorgang.stufe === 1 && ziel !== 1 && vorgang.freigabe.stand === "offen") {
    const weg = await setzeFreigabe(vorgang.id, "keine", wer);
    await vermerke(vorgang.id, {
      art: "freigabe",
      text: weg
        ? `Die offene Freigabe ist mit dem Stufenwechsel hinfällig geworden`
        : `Die offene Freigabe konnte nicht zurückgenommen werden – sie greift trotzdem nicht mehr`,
      sub: wer,
      intern: true,
      abStufe: 1,
    });
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

  if (!dbAktiv()) return { stand: "fehler", text: NICHT_GEKLAPPT };

  const abruf = await vorgangPerNummer(nummer);
  if (abruf.stand === "gestoert") {
    return { stand: "fehler", text: NICHT_ERREICHBAR };
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
  if (!gesetzt) return { stand: "fehler", text: NICHT_GEKLAPPT };

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

/**
 * Die Antwort der beiden Freigabe-Aktionen.
 *
 * Heißt `FreigabeAntwort` und nicht `FreigabeStand`: so hieß sie zuerst, und
 * `FreigabeStand` gibt es in `vorgaenge-db.ts` schon — dort ist es der Wert der
 * Spalte (`keine`/`offen`/…). Zwei Namen, zwei Bedeutungen, ein Wort.
 */
export type FreigabeAntwort =
  | { stand: "leer" }
  | { stand: "raus"; nummer: string; anHaendler: number }
  | { stand: "gestoppt"; nummer: string }
  | { stand: "fehler"; text: string };

/**
 * Was schiefgehen kann, in Worten für einen Menschen.
 *
 * Nimmt `FreigabeGrund` statt `string`: als der Grund noch ein freier String
 * war, fehlte für `"versand"` ein Fall, und niemand merkte es — der Benutzer
 * bekam den Auffangsatz. Jetzt deckt der `switch` die Union ab, und ein neuer
 * Grund macht den Baum rot statt die Meldung stumpf.
 */
function freigabeFehler(grund: FreigabeGrund, nummer: string): string {
  switch (grund) {
    case "gestoert":
      return NICHT_ERREICHBAR;
    case "unbekannt":
      return `Vorgang ${nummer} gibt es nicht.`;
    case "nicht_offen":
      return `Für ${nummer} steht gerade keine Freigabe aus. Lade die Seite neu.`;
    case "nicht_stufe1":
      return `${nummer} sammelt keine Größen mehr – abgebrochen oder schon weiter. Es geht nichts an die Händler raus. Lade die Seite neu.`;
    case "ohne_haendler":
      return "Es ist kein Händler hinterlegt (HAENDLER). Die Anfrage kann nicht rausgehen.";
    case "ohne_zeilen":
      return "In der Liste steht keine einzige Größe. Ein Händler hätte nichts zu bepreisen.";
    case "versand":
      return "Die Anfrage ging nicht raus. Am Vorgang steht, woran es lag.";
  }
}

/** Angemeldet und ein Vorgang gewählt — vor jeder Entscheidung dasselbe. */
async function werUndNummer(
  formular: FormData,
): Promise<{ wer: string; nummer: string } | { text: string }> {
  const wer = await spartenLeitung();
  if (!wer) return { text: "Dafür musst du angemeldet sein." };
  const nummer = String(formular.get("vorgang") ?? "").trim();
  if (!nummer) return { text: "Bitte einen Vorgang wählen." };
  return { wer, nummer };
}

/**
 * Die Anfrage an die Händler freigeben.
 *
 * Das ist die einzige Stelle, an der ein Mensch eine Mail nach draußen auslöst.
 * Sie prüft die Anmeldung selbst — der `proxy` prüft ausdrücklich optimistisch,
 * und eine Server Action ist eine eigene Adresse.
 */
export async function freigeben(
  _bisher: FreigabeAntwort,
  formular: FormData,
): Promise<FreigabeAntwort> {
  const zugang = await werUndNummer(formular);
  if ("text" in zugang) return { stand: "fehler", text: zugang.text };
  if (!dbAktiv()) return { stand: "fehler", text: NICHT_GEKLAPPT };

  const ergebnis = await gibFrei(zugang.nummer, { art: "mensch", email: zugang.wer });
  if (!ergebnis.ok) {
    return { stand: "fehler", text: freigabeFehler(ergebnis.grund, zugang.nummer) };
  }

  return { stand: "raus", nummer: zugang.nummer, anHaendler: ergebnis.anHaendler };
}

/**
 * Die Anfrage stoppen, mit Grund.
 *
 * Der Grund ist Pflicht: ohne ihn bliebe der Vorgang stumm liegen, und der
 * Trainer wüsste nicht, was er ändern soll. Er geht ihm auch per Mail zu.
 */
export async function ablehnen(
  _bisher: FreigabeAntwort,
  formular: FormData,
): Promise<FreigabeAntwort> {
  const zugang = await werUndNummer(formular);
  if ("text" in zugang) return { stand: "fehler", text: zugang.text };

  const grund = String(formular.get("grund") ?? "").trim();
  if (grund.length < 5) {
    return { stand: "fehler", text: "Bitte schreib dazu, was geändert werden soll." };
  }

  if (!dbAktiv()) return { stand: "fehler", text: NICHT_GEKLAPPT };

  const ergebnis = await lehneAb(zugang.nummer, { art: "mensch", email: zugang.wer }, grund);
  if (!ergebnis.ok) {
    return { stand: "fehler", text: freigabeFehler(ergebnis.grund, zugang.nummer) };
  }

  return { stand: "gestoppt", nummer: zugang.nummer };
}

/* ------------------------------------------------------------------ *
 * Angebote der Händler
 * ------------------------------------------------------------------ */

export type AngebotStand =
  | { stand: "leer" }
  | { stand: "fertig"; nummer: string; haendler: string; beide: boolean }
  | { stand: "gewaehlt"; nummer: string; haendler: string }
  | { stand: "fehler"; text: string };

/** Der Anzeigename der Händler auf die Spalten der Datenbank. */
const SPALTE: Record<string, HaendlerSpalte> = {
  "Intersport Uelzen": "intersport",
  "11teamsports": "11teamsports",
};

/**
 * Ein Angebot eintragen.
 *
 * **Warum von Hand und nicht als Upload-Strecke für die Händler.** Bormann und
 * Hillebrecht schicken seit Jahren PDFs per Mail; ob sie stattdessen einen Link
 * benutzen, entscheidet kein Code, sondern ein Gespräch. Und zwei Angebote ein
 * paar Mal im Jahr abzutippen sind Minuten. Sobald die Frage geklärt ist, kann
 * derselbe Weg auch von außen bedient werden — geschrieben wird dann dasselbe.
 *
 * Das PDF ist freiwillig, aber der eigentliche Gewinn: ohne es lag das Angebot
 * in einem Postfach, und wer später wissen wollte, warum dort 840 Euro stehen,
 * musste im Mailarchiv suchen.
 *
 * **Leer heißt streichen.** Das Formular schickt immer alle Felder; ein
 * geleertes Feld korrigiert einen Tippfehler, statt ihn stehen zu lassen.
 */
export async function angebotSetzen(
  _bisher: AngebotStand,
  formular: FormData,
): Promise<AngebotStand> {
  const zugang = await werUndNummer(formular);
  if ("text" in zugang) return { stand: "fehler", text: zugang.text };

  const haendler = String(formular.get("haendler") ?? "");
  const spalte = SPALTE[haendler];
  if (!spalte) return { stand: "fehler", text: "Bitte einen Händler wählen." };

  const abruf = await vorgangPerNummer(zugang.nummer);
  if (abruf.stand === "gestoert") return { stand: "fehler", text: NICHT_ERREICHBAR };
  if (abruf.stand !== "da") {
    return { stand: "fehler", text: `Vorgang ${zugang.nummer} gibt es nicht.` };
  }
  const vorgang = abruf.vorgang;

  // Vor der Anfrage gibt es nichts anzubieten. Ein Angebot an einem Vorgang auf
  // Stufe 1 waere entweder ein Tippfehler oder ein Angebot, das niemand
  // angefragt hat — beides will man merken, nicht speichern.
  if (vorgang.stufe < 2) {
    return { stand: "fehler", text: `Für ${zugang.nummer} ist noch keine Anfrage raus.` };
  }

  const roh = String(formular.get("betrag") ?? "").trim().replace(",", ".");
  let betrag: number | null = null;
  if (roh) {
    const zahl = Number(roh);
    if (!Number.isFinite(zahl) || zahl <= 0) {
      return { stand: "fehler", text: "Der Betrag sieht nicht wie eine Zahl aus." };
    }
    betrag = Math.round(zahl * 100) / 100;
  }

  // Das PDF zuerst: liegt es nicht, soll auch kein Betrag dastehen, der auf ein
  // Angebot verweist, das niemand nachlesen kann.
  let datei: string | undefined;
  const hochgeladen = formular.get("datei");
  if (hochgeladen instanceof File && hochgeladen.size > 0) {
    if (hochgeladen.size > GRENZE_BYTES) {
      return { stand: "fehler", text: ladeFehlerText("zu_gross") };
    }
    const ergebnis = await lade(
      "angebot",
      `${vorgang.id}-${spalte}`,
      new Uint8Array(await hochgeladen.arrayBuffer()),
      "bild_oder_pdf",
    );
    if (!ergebnis.ok) {
      const text =
        ergebnis.grund === "falscher_typ"
          ? "Nur ein PDF oder ein Bild."
          : ladeFehlerText(ergebnis.grund);
      return { stand: "fehler", text };
    }
    datei = ergebnis.pfad;
  }

  const gesetzt = await setzeAngebot(vorgang.id, spalte, {
    betrag,
    am: String(formular.get("am") ?? ""),
    gueltigBis: String(formular.get("gueltig_bis") ?? ""),
    lieferzeit: String(formular.get("lieferzeit") ?? ""),
    abweichung: String(formular.get("abweichung") ?? ""),
    ...(datei ? { datei } : {}),
  });
  if (!gesetzt) return { stand: "fehler", text: NICHT_GEKLAPPT };

  await vermerke(vorgang.id, {
    art: "angebot",
    text: betrag
      ? `Angebot von ${haendler}: ${betrag.toFixed(2)} €${datei ? " (mit PDF)" : ""}`
      : `Angebot von ${haendler} zurückgenommen`,
    sub: zugang.wer,
    intern: true,
    abStufe: 2,
  });

  // Beide da und der Vorgang noch auf „Anfrage raus“? Dann ist er weiter. Das
  // ist der einzige Stufenwechsel zwischen 2 und 8, der sich aus den Daten
  // ergibt statt aus einer Meinung — alles andere bleibt Handarbeit.
  const frisch = await vorgangPerNummer(zugang.nummer);
  let beide = false;
  if (frisch.stand === "da") {
    const a = frisch.vorgang.angebote;
    beide = Boolean(a.intersport.betrag && a.elfteamsports.betrag);
    if (beide && frisch.vorgang.stufe === 2) {
      await setzeStufe(frisch.vorgang.id, 3);
      await vermerke(frisch.vorgang.id, {
        art: "stufe-gesetzt",
        text: "Beide Angebote sind da",
        sub: zugang.wer,
        intern: true,
        abStufe: 2,
      });
    }
    await spiegele(frisch.vorgang);
  }

  return { stand: "fertig", nummer: zugang.nummer, haendler, beide };
}

/**
 * Den Händler wählen, bei dem bestellt wird.
 *
 * Damit steht erst der Betrag fest, an dem die Deckung gemessen wird
 * (`istGedeckt`). Ohne diese Wahl ist jeder Vorgang ungedeckt — das war bis
 * zum 20.09.2026 der Zustand, weil es die Wahl nirgends gab.
 */
export async function lieferantWaehlen(
  _bisher: AngebotStand,
  formular: FormData,
): Promise<AngebotStand> {
  const zugang = await werUndNummer(formular);
  if ("text" in zugang) return { stand: "fehler", text: zugang.text };

  const haendler = String(formular.get("haendler") ?? "");
  if (!SPALTE[haendler]) return { stand: "fehler", text: "Bitte einen Händler wählen." };

  const abruf = await vorgangPerNummer(zugang.nummer);
  if (abruf.stand === "gestoert") return { stand: "fehler", text: NICHT_ERREICHBAR };
  if (abruf.stand !== "da") {
    return { stand: "fehler", text: `Vorgang ${zugang.nummer} gibt es nicht.` };
  }

  // Ohne Betrag ist die Wahl leer: die Deckung haette nichts zu messen, und der
  // Vorgang saehe gewaehlt aus, ohne es zu sein.
  const satz = abruf.vorgang;
  const betrag =
    SPALTE[haendler] === "intersport"
      ? satz.angebote.intersport.betrag
      : satz.angebote.elfteamsports.betrag;
  if (!betrag) {
    return { stand: "fehler", text: `Für ${haendler} steht noch kein Betrag.` };
  }

  if (!(await aendereVorgang(satz.id, { lieferantGewaehlt: haendler }))) {
    return { stand: "fehler", text: NICHT_GEKLAPPT };
  }
  await vermerke(satz.id, {
    art: "angebot",
    text: `${haendler} gewählt (${betrag.toFixed(2)} €)`,
    sub: zugang.wer,
    intern: true,
    abStufe: 3,
  });

  const frisch = await vorgangPerNummer(zugang.nummer);
  if (frisch.stand === "da") await spiegele(frisch.vorgang);

  return { stand: "gewaehlt", nummer: zugang.nummer, haendler };
}
