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
import { setzeStufe, vermerke, vorgangPerNummer } from "@/lib/vorgaenge-db";
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
