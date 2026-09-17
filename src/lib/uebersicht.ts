import "server-only";

/**
 * Die Spartenübersicht: alle Vorgänge als Zeilen (docs/formulare.md).
 *
 * Lag bis eben in `vorgaenge.ts` und trug dort einen Prototyp-Begriff mit sich
 * herum: `ladeZeilen` nahm eine „Entwurfsstufe“ entgegen, mit der das
 * Schaufenster seinen Regler durchreichte. Ein Server-Zugriff, der die Demo
 * kennt — das ist jetzt getrennt. Die Beispieldaten liefert das Schaufenster
 * selbst (`src/components/schaufenster.tsx`).
 *
 * Die Seite `/sparte`, die das hier anzeigen soll, ist noch nicht gebaut
 * (docs/offen.md). Bis dahin ruft niemand `ladeZeilen` auf.
 */

import {
  hubspot,
  hubspotAktiv,
  kurzDatum,
  pipelineStufen,
  text,
  zahl,
  type HsListe,
  type HsObjekt,
} from "./hubspot";
import { stufeAusName } from "./stufen";
import { dealSuche } from "./vorgaenge";
import type { StufeNr, VorgangsZeile } from "./typen";

/** Ganze Tage seit einem Zeitpunkt. `null`, wenn es keinen gibt. */
function tageSeit(wert: string | undefined): number | null {
  if (!wert) return null;
  const zeitpunkt = new Date(wert);
  if (Number.isNaN(zeitpunkt.getTime())) return null;
  return Math.floor((Date.now() - zeitpunkt.getTime()) / 86_400_000);
}

/** Wer ist als Nächstes dran? Eine Zeile je Stufe (docs/konzept.md). */
function wartetAuf(stufe: StufeNr, deal: HsObjekt): string {
  switch (stufe) {
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
      return zahl(deal, "zusage_sponsor") > 0 ? "Sponsor" : "Finanzierung";
    case 6:
      return text(deal, "lieferant_gewaehlt") ?? "Händler";
    case 7:
      return "Trainer";
    default:
      return "–";
  }
}

/** Die Frist, die auf dieser Stufe zählt. Auf Stufe 1 ist es die Größenfrist. */
function fristVon(stufe: StufeNr, deal: HsObjekt): string | undefined {
  const roh = stufe === 1 ? text(deal, "groessen_frist") : text(deal, "stufe_frist");
  const datum = kurzDatum(roh);
  return datum ? `Frist ${datum}` : undefined;
}

/** Ein Deal wird zur Zeile in der Übersicht. */
function zurZeile(deal: HsObjekt, stufe: StufeNr): VorgangsZeile {
  const art = text(deal, "ausstattungsart") ?? "Ausstattung";
  const tage = tageSeit(text(deal, "hs_lastmodifieddate"));
  const frist = fristVon(stufe, deal);
  const fristRoh = stufe === 1 ? text(deal, "groessen_frist") : text(deal, "stufe_frist");
  const ueberfaellig = (tageSeit(fristRoh) ?? -1) > 0;

  return {
    nummer: text(deal, "vorgangsnummer") ?? deal.id,
    mannschaft: text(deal, "mannschaft") ?? text(deal, "mannschaftscode") ?? "Ohne Mannschaft",
    gegenstand: art,
    stufe,
    wartetAuf: wartetAuf(stufe, deal),
    seit: tage === null ? "" : tage === 0 ? "heute" : `${tage} Tage`,
    frist,
    warnung: ueberfaellig && frist ? `${frist} überschritten` : undefined,
    du: stufe === 3 || stufe === 5,
    verlinkt: true,
  };
}

/**
 * Alle Vorgänge der Sparte.
 *
 * Eine leere Liste heißt hier wirklich „keine Vorgänge“ – ohne HubSpot, ohne
 * Pipeline oder ohne Treffer kommt nichts zurück. Früher fielen alle drei Fälle
 * auf Beispieldaten zurück; auf einer Seite hinter Login wären erfundene
 * Vorgänge schlimmer als eine ehrliche Leere.
 */
export async function ladeZeilen(): Promise<VorgangsZeile[]> {
  if (!hubspotAktiv()) return [];

  const stufen = await pipelineStufen();
  if (!stufen) return [];

  const treffer = await hubspot<HsListe<HsObjekt>>({
    pfad: "/crm/v3/objects/deals/search",
    koerper: dealSuche(undefined, 100),
  });
  if (!treffer) return [];

  return treffer.results
    .map((deal) => {
      const name = stufen.get(deal.properties.dealstage ?? "");
      const stufe = name ? stufeAusName(name) : null;
      // Ausdruecklich gegen null pruefen: Stufe 0 (Voranfrage) ist unwahr.
      return stufe !== null ? zurZeile(deal, stufe) : null;
    })
    .filter((z): z is VorgangsZeile => z !== null);
}
