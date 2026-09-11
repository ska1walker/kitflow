import "server-only";

/**
 * F1 · Bedarf melden (docs/formulare.md).
 *
 * Legt aus der Meldung eines Trainers einen vollständigen Vorgang an: Deal auf
 * Stufe 1, Produkte für die Artikel, je Artikel eine Position ohne Person, und
 * die Kontakte der Mannschaft daran.
 *
 * Die Positionen ohne `spieler_hsid` sind die Artikelliste des Vorgangs. F2
 * liest daraus, welche Größen zu fragen sind; F3 klappt sie später zu Person
 * mal Artikel auf. So bleibt alles in HubSpot sichtbar und bearbeitbar, statt
 * in einem Textfeld zu verschwinden.
 */

import {
  hubspot,
  hubspotAktiv,
  pipelineStufen,
  PIPELINE_NAME,
  type HsListe,
  type HsObjekt,
} from "./hubspot";
import { groessenLink, statusLink, bestaetigenLink } from "./links";
import { TEAMS } from "./mannschaften";
import type { ArtikelFuer, Groessenart } from "./typen";

export type ArtikelEingabe = {
  hersteller: string;
  bezeichnung: string;
  herstellernummer: string;
  farbe: string;
  groessenart: Groessenart;
  stueck: number;
  fuer: ArtikelFuer;
  beflockung: string;
  beflockungAbweichend: string;
};

export type BedarfEingabe = {
  vorname: string;
  nachname: string;
  email: string;
  telefon: string;
  teams: string[];
  mannschaftscode: string;
  ausstattungsart: string;
  artikel: ArtikelEingabe[];
  groessenFrist: string;
  lieferadresse: string;
  sponsor: string;
  hinweise: string;
};

export type PersonLink = { name: string; groessen: string; status: string };

export type BedarfErgebnis = {
  vorgang: string;
  /** Leer, wenn zur Mannschaft niemand gefunden wurde. */
  personen: PersonLink[];
  trainerStatus: string;
  bestaetigen: string;
  /** Kein Kontakt mit dieser Mannschaft: der Vorgang steht auf Abgebrochen. */
  ohnePersonen: boolean;
};

/** Nur die Werte, die HubSpot kennt. Alles andere waere ein Tippfehler. */
export function gueltigeTeams(werte: string[]): string[] {
  return werte.filter((w) => TEAMS.includes(w));
}

/**
 * Die naechste freie Vorgangsnummer des Jahres.
 *
 * Zwei Meldungen in derselben Sekunde koennten dieselbe Nummer bekommen. Bei
 * einer Handvoll Vorgaengen im Jahr ist das kein reales Risiko; sollte es eins
 * werden, gehoert der Zaehler nach HubSpot statt in eine Suche.
 */
async function naechsteNummer(): Promise<string> {
  const jahr = new Date().getFullYear();
  const praefix = `AUS-${jahr}-`;

  const treffer = await hubspot<HsListe<HsObjekt>>({
    pfad: "/crm/v3/objects/deals/search",
    koerper: {
      filterGroups: [
        {
          filters: [
            { propertyName: "vorgangsnummer", operator: "CONTAINS_TOKEN", value: `${praefix}*` },
          ],
        },
      ],
      properties: ["vorgangsnummer"],
      limit: 100,
    },
  });

  let hoechste = 0;
  for (const deal of treffer?.results ?? []) {
    const nummer = deal.properties.vorgangsnummer ?? "";
    if (!nummer.startsWith(praefix)) continue;
    const zahl = Number(nummer.slice(praefix.length));
    if (Number.isInteger(zahl) && zahl > hoechste) hoechste = zahl;
  }

  return `${praefix}${String(hoechste + 1).padStart(3, "0")}`;
}

/** Ein Produkt zur Herstellernummer, sonst neu angelegt. */
async function produktFinden(artikel: ArtikelEingabe): Promise<string | null> {
  const treffer = await hubspot<HsListe<HsObjekt>>({
    pfad: "/crm/v3/objects/products/search",
    koerper: {
      filterGroups: [
        { filters: [{ propertyName: "hs_sku", operator: "EQ", value: artikel.herstellernummer }] },
      ],
      properties: ["hs_sku"],
      limit: 1,
    },
  });
  const vorhanden = treffer?.results[0];
  if (vorhanden) return vorhanden.id;

  const angelegt = await hubspot<HsObjekt>({
    pfad: "/crm/v3/objects/products",
    koerper: {
      properties: {
        name: `${artikel.hersteller} ${artikel.bezeichnung}`.trim(),
        hs_sku: artikel.herstellernummer,
        hersteller: artikel.hersteller,
        farbe: artikel.farbe,
        groessenart: artikel.groessenart,
        fuer: artikel.fuer,
        beflockung_standard:
          artikel.beflockung === "Abweichend"
            ? artikel.beflockungAbweichend
            : artikel.beflockung === "Ohne"
              ? "ohne Beflockung"
              : "Standard",
        aktiv: "true",
      },
    },
  });
  return angelegt?.id ?? null;
}

/** Die Kontakte, deren `team` eine der gewaehlten Mannschaften ist. */
async function kontakteDerMannschaft(teams: string[]): Promise<HsObjekt[]> {
  const treffer = await hubspot<HsListe<HsObjekt>>({
    pfad: "/crm/v3/objects/contacts/search",
    koerper: {
      filterGroups: teams.map((team) => ({
        filters: [{ propertyName: "team", operator: "EQ", value: team }],
      })),
      properties: ["firstname", "lastname", "team"],
      limit: 200,
    },
  });
  return treffer?.results ?? [];
}

async function verknuepfen(vonTyp: string, vonId: string, zuTyp: string, zuId: string) {
  await hubspot({
    pfad: `/crm/v4/objects/${vonTyp}/${vonId}/associations/default/${zuTyp}/${zuId}`,
    methode: "PUT",
  });
}

/**
 * Legt den Vorgang an. `null` heisst: HubSpot war nicht erreichbar oder die
 * Pipeline fehlt – dann ist nichts entstanden, was aufgeraeumt werden muesste.
 */
export async function meldeBedarf(eingabe: BedarfEingabe): Promise<BedarfErgebnis | null> {
  if (!hubspotAktiv()) return null;

  const stufen = await pipelineStufen();
  if (!stufen) return null;

  const pipelines = await hubspot<HsListe<{ id: string; label: string; stages: { id: string; label: string }[] }>>({
    pfad: "/crm/v3/pipelines/deals",
  });
  const pipeline = pipelines?.results.find((p) => p.label === PIPELINE_NAME);
  const stufe1 = pipeline?.stages.find((s) => s.label === "Größen laufen");
  const stufe9 = pipeline?.stages.find((s) => s.label === "Abgebrochen");
  if (!pipeline || !stufe1 || !stufe9) return null;

  const nummer = await naechsteNummer();
  const kontakte = await kontakteDerMannschaft(eingabe.teams);
  const ohnePersonen = kontakte.length === 0;

  const deal = await hubspot<HsObjekt>({
    pfad: "/crm/v3/objects/deals",
    koerper: {
      properties: {
        dealname: `${eingabe.teams.join(", ")} · ${eingabe.ausstattungsart}`,
        pipeline: pipeline.id,
        // Ohne Spieler gibt es nichts anzufragen: der Vorgang endet sofort
        // (docs/formulare.md, M7).
        dealstage: ohnePersonen ? stufe9.id : stufe1.id,
        vorgangsnummer: nummer,
        ausstattungsart: eingabe.ausstattungsart,
        mannschaft: eingabe.teams.join(";"),
        mannschaftscode: eingabe.mannschaftscode,
        trainer_email: eingabe.email,
        groessen_frist: eingabe.groessenFrist,
        lieferadresse: eingabe.lieferadresse,
        hinweis_haendler: eingabe.hinweise,
      },
    },
  });
  if (!deal) return null;

  // Artikel als Positionen ohne Person: das ist die Artikelliste des Vorgangs.
  for (const artikel of eingabe.artikel) {
    const produktId = await produktFinden(artikel);
    if (!produktId) continue;

    const position = await hubspot<HsObjekt>({
      pfad: "/crm/v3/objects/line_items",
      koerper: {
        properties: {
          hs_product_id: produktId,
          quantity: String(artikel.stueck),
          sponsor: eingabe.sponsor,
        },
      },
    });
    if (position) await verknuepfen("deals", deal.id, "line_items", position.id);
  }

  for (const kontakt of kontakte) {
    await verknuepfen("deals", deal.id, "contacts", kontakt.id);
  }

  return {
    vorgang: nummer,
    ohnePersonen,
    trainerStatus: statusLink(nummer) ?? "",
    bestaetigen: bestaetigenLink(nummer) ?? "",
    personen: kontakte.map((k) => ({
      name: `${k.properties.firstname ?? ""} ${k.properties.lastname ?? ""}`.trim() || k.id,
      groessen: groessenLink(nummer, k.id) ?? "",
      status: statusLink(nummer, k.id) ?? "",
    })),
  };
}
