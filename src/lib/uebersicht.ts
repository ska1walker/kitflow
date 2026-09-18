import "server-only";

/**
 * Die Spartenübersicht: alle Vorgänge als Zeilen (docs/formulare.md).
 *
 * Liest seit dem Umzug aus der eigenen Datenbank. Damit fällt auch der Umweg
 * über die HubSpot-Pipeline weg: die Stufe steht als Zahl am Vorgang und muss
 * nicht mehr über den Namen einer Stufe zurückübersetzt werden.
 *
 * Angezeigt wird das auf `/sparte`, hinter der Anmeldung (`anmeldung.ts`).
 * Jede Zeile trägt ihren signierten Link auf die Statusseite: auch die
 * Spartenleitung kommt dort nur mit gültigem Token hinein.
 */

import { alleVorgaenge, type VorgangSatz } from "./vorgaenge-db";
import { ausgeschlossene } from "./ansicht";
import { statusLink } from "./links";
import type { StufeNr, VorgangsZeile } from "./typen";

/** Ganze Tage seit einem Zeitpunkt. `null`, wenn es keinen gibt. */
function tageSeit(wert: string | undefined): number | null {
  if (!wert) return null;
  const zeitpunkt = new Date(wert);
  if (Number.isNaN(zeitpunkt.getTime())) return null;
  return Math.floor((Date.now() - zeitpunkt.getTime()) / 86_400_000);
}

/** Wer ist als Nächstes dran? Eine Zeile je Stufe (docs/konzept.md). */
function wartetAuf(satz: VorgangSatz): string {
  switch (satz.stufe) {
    case 0:
      return "Sponsor";
    case 1:
      return "Mannschaft";
    case 2:
      return "Händler";
    case 3:
    case 5:
      return "dich";
    case 4:
      return (satz.finanzen.zusageSponsor ?? 0) > 0 ? "Sponsor" : "Finanzierung";
    case 6:
      return satz.lieferantGewaehlt ?? "Händler";
    case 7:
      return "Trainer";
    default:
      return "–";
  }
}

/** Die Frist, die auf dieser Stufe zählt. Auf Stufe 1 ist es die Größenfrist. */
function fristVon(satz: VorgangSatz): string | undefined {
  return satz.stufe === 1 ? satz.groessenFrist : satz.stufeFrist;
}

/** „2026-09-30“ wird zu „30.09.“. */
function kurz(wert: string | undefined): string | undefined {
  if (!wert) return undefined;
  const treffer = /^(\d{4})-(\d{2})-(\d{2})/.exec(wert);
  return treffer ? `${treffer[3]}.${treffer[2]}.` : undefined;
}

/** Ein Vorgang wird zur Zeile in der Übersicht. */
function zurZeile(satz: VorgangSatz): VorgangsZeile {
  const fristRoh = fristVon(satz);
  const datum = kurz(fristRoh);
  const frist = datum ? `Frist ${datum}` : undefined;
  const ueberfaellig = (tageSeit(fristRoh) ?? -1) > 0;

  // „Wartet seit“ fragt nach der Stufe, nicht nach der letzten Änderung: eine
  // korrigierte Lieferadresse soll die Wartezeit nicht zurücksetzen. Dafür
  // führt die Datenbank `stufe_seit` mit.
  const tage = tageSeit(satz.stufeSeit);

  return {
    nummer: satz.nummer,
    mannschaft: satz.mannschaften.join(", ") || satz.mannschaftscode || "Ohne Mannschaft",
    gegenstand: satz.ausstattungsart,
    stufe: satz.stufe as StufeNr,
    wartetAuf: wartetAuf(satz),
    seit: tage === null ? "" : tage === 0 ? "heute" : `${tage} Tage`,
    frist,
    warnung: ueberfaellig && frist ? `${frist} überschritten` : undefined,
    du: satz.stufe === 3 || satz.stufe === 5,
    // Auch die Spartenleitung kommt an eine Statusseite nur mit gültigem Token.
    // Es gibt keinen zweiten Weg hinein, und das soll so bleiben: dann gibt es
    // auch nur eine Stelle, die falsch sein kann.
    href: statusLink(satz.nummer) ?? undefined,
    id: satz.id,
  };
}

/**
 * Alle Vorgänge der Sparte.
 *
 * Eine leere Liste heißt hier wirklich „keine Vorgänge“, und `null` heißt
 * „konnte nicht fragen“. Auf einer Seite hinter Login wären erfundene oder
 * stillschweigend verschwundene Vorgänge beides schlimmer als eine ehrliche
 * Antwort.
 */
export async function ladeZeilen(): Promise<VorgangsZeile[] | null> {
  const vorgaenge = await alleVorgaenge();
  if (vorgaenge === null) return null;
  return vorgaenge.map(zurZeile);
}

/**
 * Wie viele Personen an einem Vorgang hängen, ohne die Ausgeschlossenen.
 * Steht hier, weil die Übersicht die einzige Stelle ist, die es ohne die
 * Namen aus HubSpot braucht.
 */
export function personenZahl(satz: VorgangSatz): number {
  const raus = ausgeschlossene(satz);
  return satz.personen.filter((p) => !raus.has(p.kontaktId)).length;
}
