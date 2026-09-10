import "server-only";

/**
 * Laedt Vorgaenge aus HubSpot und faellt auf Beispieldaten zurueck.
 *
 * HubSpot ist die einzige Datenbasis (CLAUDE.md). Solange der Token fehlt oder
 * die Pipeline „Ausstattung“ noch nicht angelegt ist, zeigt die Seite den
 * Beispiel-Vorgang und kennzeichnet ihn als solchen. Die Oberflaeche merkt vom
 * Wechsel nichts: sie bekommt in beiden Faellen denselben Typ.
 *
 * Zuordnung nach docs/datenmodell.md:
 *   Deal        -> Vorgang
 *   Positionen  -> Person x Artikel
 *   Kontakte    -> Groessen
 */

import { BEISPIEL_VORGANG, beispielZeilen } from "./beispieldaten";
import { hubspot, hubspotAktiv, pipelineStufen, type HsListe, type HsObjekt } from "./hubspot";
import { stufeAusName } from "./stufen";
import type { StufeNr, Vorgang, VorgangsZeile } from "./typen";

/** Deal-Eigenschaften der Gruppe „Ausstattung“, die die Statusseite braucht. */
const DEAL_FELDER = [
  "vorgangsnummer",
  "ausstattungsart",
  "mannschaft",
  "mannschaftscode",
  "dealstage",
  "amount",
  "lieferant_gewaehlt",
  "zusage_sponsor",
  "eingang_verein",
  "vorkasse_bestaetigt",
  "spartenbudget_freigegeben",
  "groessen_frist",
  "bestellt_am",
  "geliefert_am",
  "hs_lastmodifieddate",
];

function text(o: HsObjekt, feld: string): string | undefined {
  const wert = o.properties[feld];
  return wert === null || wert === undefined || wert === "" ? undefined : wert;
}

function zahl(o: HsObjekt, feld: string): number {
  const wert = Number(o.properties[feld]);
  return Number.isFinite(wert) ? wert : 0;
}

/**
 * Auf wen der Vorgang gerade wartet. Abgeleitet aus der Stufe, damit die
 * Uebersicht der Spartenleitung ohne zusaetzliche Eigenschaft auskommt.
 */
function wartetAuf(stufe: StufeNr, deal: HsObjekt): string {
  switch (stufe) {
    case 1:
      return "Mannschaft";
    case 2:
      return "Händler";
    case 3:
    case 5:
      return "dich";
    case 4:
      return text(deal, "zusage_sponsor") ? "Sponsor" : "Finanzierung";
    case 6:
      return text(deal, "lieferant_gewaehlt") ?? "Händler";
    case 7:
      return "Trainer";
    default:
      return "–";
  }
}

/** Ein Deal wird zur Zeile in der Uebersicht. */
function zurZeile(deal: HsObjekt, stufe: StufeNr): VorgangsZeile {
  const art = text(deal, "ausstattungsart") ?? "Ausstattung";
  return {
    nummer: text(deal, "vorgangsnummer") ?? deal.id,
    mannschaft: text(deal, "mannschaft") ?? text(deal, "mannschaftscode") ?? "Ohne Mannschaft",
    gegenstand: art,
    stufe,
    wartetAuf: wartetAuf(stufe, deal),
    seit: "",
    verlinkt: true,
  };
}

/**
 * Alle Vorgaenge der Sparte. `entwurfsStufe` steuert im Beispielmodus den
 * ersten Eintrag, damit Uebersicht und Detailansicht zusammenpassen; mit
 * echten Daten hat sie keine Wirkung.
 */
export async function ladeZeilen(entwurfsStufe: StufeNr): Promise<VorgangsZeile[]> {
  if (!hubspotAktiv()) return beispielZeilen(entwurfsStufe);

  const stufen = await pipelineStufen();
  if (!stufen) return beispielZeilen(entwurfsStufe);

  const treffer = await hubspot<HsListe<HsObjekt>>({
    pfad: "/crm/v3/objects/deals/search",
    suche: {
      filterGroups: [
        { filters: [{ propertyName: "vorgangsnummer", operator: "HAS_PROPERTY" }] },
      ],
      properties: DEAL_FELDER,
      sorts: [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
      limit: 100,
    },
  });
  if (!treffer) return beispielZeilen(entwurfsStufe);

  const zeilen = treffer.results
    .map((deal) => {
      const name = stufen.get(deal.properties.dealstage ?? "");
      const stufe = name ? stufeAusName(name) : null;
      return stufe ? zurZeile(deal, stufe) : null;
    })
    .filter((z): z is VorgangsZeile => z !== null);

  // Noch kein einziger Vorgang angelegt: lieber der Beispiel-Vorgang als eine
  // leere Seite, die wie ein Fehler aussieht.
  return zeilen.length > 0 ? zeilen : beispielZeilen(entwurfsStufe);
}

/**
 * Ein einzelner Vorgang mit allem, was die Statusseite zeigt.
 *
 * Solange Pipeline und Eigenschaften in HubSpot fehlen, kommt der
 * Beispiel-Vorgang zurueck. Sobald sie stehen, wird hier zusaetzlich gelesen:
 * Positionen fuer Artikel und Mengen, Kontakte fuer die eigenen Groessen.
 */
export async function ladeVorgang(nummer?: string): Promise<Vorgang> {
  if (!hubspotAktiv()) return BEISPIEL_VORGANG;

  const stufen = await pipelineStufen();
  if (!stufen) return BEISPIEL_VORGANG;

  const treffer = await hubspot<HsListe<HsObjekt>>({
    pfad: "/crm/v3/objects/deals/search",
    suche: {
      filterGroups: [
        {
          filters: nummer
            ? [{ propertyName: "vorgangsnummer", operator: "EQ", value: nummer }]
            : [{ propertyName: "vorgangsnummer", operator: "HAS_PROPERTY" }],
        },
      ],
      properties: DEAL_FELDER,
      sorts: [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
      limit: 1,
    },
  });

  const deal = treffer?.results[0];
  if (!deal) return BEISPIEL_VORGANG;

  const stufenName = stufen.get(deal.properties.dealstage ?? "");
  const stufe = stufenName ? stufeAusName(stufenName) : null;
  if (!stufe) return BEISPIEL_VORGANG;

  const amount = zahl(deal, "amount");
  const gedeckt =
    zahl(deal, "eingang_verein") + zahl(deal, "spartenbudget_freigegeben") >= amount ||
    zahl(deal, "vorkasse_bestaetigt") >= amount;

  return {
    ...BEISPIEL_VORGANG,
    nummer: text(deal, "vorgangsnummer") ?? deal.id,
    titel: `${text(deal, "mannschaft") ?? "Mannschaft"} · ${text(deal, "ausstattungsart") ?? "Ausstattung"}`,
    untertitel: [text(deal, "mannschaftscode"), text(deal, "lieferant_gewaehlt")]
      .filter(Boolean)
      .join(" · "),
    stufe,
    sponsor: text(deal, "zusage_sponsor") ? "Sponsor" : undefined,
    finanzierungZugesagt: zahl(deal, "zusage_sponsor") > 0,
    geldEingangAm: gedeckt ? text(deal, "bestellt_am") : undefined,
    quelle: "hubspot",
    // Artikel, Positionen, Verlauf und eigene Groessen folgen, sobald die
    // Eigenschaften und Positionen in HubSpot angelegt sind.
  };
}
