import "server-only";

/**
 * F1b · Angaben vervollständigen (docs/formulare.md).
 *
 * Der Gegenpart zum einfachen Modus von F1. Dort meldet der Trainer grob, um
 * einen Richtpreis für einen Sponsor zu bekommen; hier kommt nach, was ein
 * Händler für ein verbindliches Angebot braucht: Artikelnummer, Farbe, Für wen,
 * Beflockung, Frist, Lieferadresse und die Zahlungsregel.
 *
 * Danach hebt der Vorgang von Stufe 0 auf Stufe 1, die Kontakte der Mannschaft
 * kommen dazu und die Größenabfrage läuft wie bei jedem anderen Vorgang.
 */

import {
  hubspot,
  hubspotAktiv,
  pipelineStufen,
  PIPELINE_NAME,
  assoziierteIds,
  batchLesen,
  type HsListe,
  type HsObjekt,
} from "./hubspot";
import {
  beflockungText,
  kontakteDerMannschaft,
  verknuepfen,
  type BedarfErgebnis,
} from "./bedarf";
import { GROESSEN_LABEL } from "./groessen";
import { groessenLink, statusLink, bestaetigenLink } from "./links";
import type { ArtikelFuer, Groessenart } from "./typen";

/** Ein Artikel der Voranfrage, so wie ihn das Formular anzeigt. */
export type VoranfrageArtikel = {
  positionId: string;
  produktId: string;
  hersteller: string;
  bezeichnung: string;
  groessenart: Groessenart;
  groessenartLabel: string;
  /** Der SKU, wie er am Produkt steht – echte Nummer oder Platzhalter. */
  sku: string;
  /** Der SKU ist nur ein Platzhalter, die echte Artikelnummer fehlt noch. */
  platzhalter: boolean;
  herstellernummer: string;
  farbe: string;
  stueck: number;
  groesseVon: string;
  groesseBis: string;
};

export type Voranfrage = {
  vorgang: string;
  dealId: string;
  trainerEmail: string;
  mannschaft: string;
  teams: string[];
  ausstattungsart: string;
  personenGeschaetzt: number;
  sponsor: string;
  hinweise: string;
  artikel: VoranfrageArtikel[];
};

export type ErgaenzungArtikel = {
  positionId: string;
  produktId: string;
  herstellernummer: string;
  farbe: string;
  fuer: ArtikelFuer;
  beflockung: string;
  beflockungAbweichend: string;
};

export type ErgaenzungEingabe = {
  groessenFrist: string;
  lieferadresse: string;
  /** Wie in F1: schaltet die Initialen-Abfrage in F2 frei. */
  initialenNoetig: boolean;
  sponsor: string;
  hinweise: string;
  artikel: ErgaenzungArtikel[];
};

const DEAL_FELDER = [
  "vorgangsnummer",
  "dealstage",
  "mannschaft",
  "mannschaftscode",
  "ausstattungsart",
  "personen_geschaetzt",
  "trainer_email",
  "hinweis_haendler",
  "hs_lastmodifieddate",
];

const POSITION_FELDER = ["hs_product_id", "quantity", "sponsor", "groesse_von", "groesse_bis"];

const PRODUKT_FELDER = ["name", "hs_sku", "hersteller", "farbe", "groessenart", "fuer", "aktiv"];

/** Ob ein SKU nur der Platzhalter aus dem einfachen Modus ist. */
export function istPlatzhalter(sku: string): boolean {
  return sku.startsWith("VOR-");
}

/**
 * Die Nummer, die im Platzhalter-SKU steckt – die Reihenfolge, in der der
 * Trainer die Artikel gemeldet hat.
 *
 * HubSpot gibt Positionen in beliebiger Reihenfolge zurueck. Ohne das stuenden
 * die Artikel im Formular anders als in F1, und der Trainer traegt die
 * Artikelnummer beim falschen Artikel ein.
 */
function meldeRang(sku: string): number {
  const treffer = /-(\d+)$/.exec(sku);
  return istPlatzhalter(sku) && treffer ? Number(treffer[1]) : Number.MAX_SAFE_INTEGER;
}

function text(o: HsObjekt, feld: string): string {
  return o.properties[feld] ?? "";
}

async function dealDerNummer(nummer: string): Promise<HsObjekt | null> {
  const treffer = await hubspot<HsListe<HsObjekt>>({
    pfad: "/crm/v3/objects/deals/search",
    koerper: {
      filterGroups: [
        { filters: [{ propertyName: "vorgangsnummer", operator: "EQ", value: nummer }] },
      ],
      properties: DEAL_FELDER,
      limit: 1,
    },
  });
  const deal = treffer?.results[0];
  if (!deal || text(deal, "vorgangsnummer") !== nummer) return null;
  return deal;
}

/**
 * Die Voranfrage zum Formular. `null` heisst: es gibt sie nicht, oder der
 * Vorgang ist über die Voranfrage hinaus – dann ist hier nichts mehr zu tun.
 */
export async function ladeVoranfrage(nummer: string): Promise<Voranfrage | null> {
  if (!hubspotAktiv()) return null;

  const stufen = await pipelineStufen();
  if (!stufen) return null;

  const deal = await dealDerNummer(nummer);
  if (!deal) return null;
  if (stufen.get(text(deal, "dealstage")) !== "Voranfrage") return null;

  const positionsIds = await assoziierteIds("deals", deal.id, "line_items");
  const positionen = await batchLesen("line_items", positionsIds, POSITION_FELDER);
  const produktIds = [...new Set(positionen.map((p) => text(p, "hs_product_id")).filter(Boolean))];
  const produkte = new Map(
    (await batchLesen("products", produktIds, PRODUKT_FELDER)).map((p) => [p.id, p]),
  );

  const artikel: VoranfrageArtikel[] = [];
  for (const position of positionen) {
    const produkt = produkte.get(text(position, "hs_product_id"));
    if (!produkt) continue;

    const sku = text(produkt, "hs_sku");
    const art = (text(produkt, "groessenart") || "ohne") as Groessenart;
    const hersteller = text(produkt, "hersteller");
    const name = text(produkt, "name");

    artikel.push({
      positionId: position.id,
      produktId: produkt.id,
      hersteller,
      // Der Produktname ist „Hersteller Bezeichnung“; der Hersteller steht
      // zusaetzlich in einem eigenen Feld und wird hier wieder abgeschnitten.
      bezeichnung: hersteller && name.startsWith(`${hersteller} `)
        ? name.slice(hersteller.length + 1)
        : name,
      groessenart: art,
      groessenartLabel: GROESSEN_LABEL[art] ?? art,
      sku,
      platzhalter: istPlatzhalter(sku),
      herstellernummer: istPlatzhalter(sku) ? "" : sku,
      farbe: text(produkt, "farbe"),
      stueck: Number(text(position, "quantity")) || 1,
      groesseVon: text(position, "groesse_von"),
      groesseBis: text(position, "groesse_bis"),
    });
  }

  artikel.sort((a, b) => meldeRang(a.sku) - meldeRang(b.sku));

  return {
    vorgang: nummer,
    dealId: deal.id,
    trainerEmail: text(deal, "trainer_email"),
    mannschaft: text(deal, "mannschaft").split(";").filter(Boolean).join(", "),
    teams: text(deal, "mannschaft").split(";").filter(Boolean),
    ausstattungsart: text(deal, "ausstattungsart"),
    personenGeschaetzt: Number(text(deal, "personen_geschaetzt")) || 0,
    // Der Sponsor steht an jeder Position; eine reicht zum Anzeigen.
    sponsor: positionen.length > 0 ? text(positionen[0], "sponsor") : "",
    hinweise: text(deal, "hinweis_haendler"),
    artikel,
  };
}

/**
 * Setzt die echte Artikelnummer am Produkt.
 *
 * Gibt es zu der Nummer schon ein Produkt, wird auf dieses umgehängt und das
 * Platzhalter-Produkt stillgelegt: sonst stünden zwei Produkte mit derselben
 * Nummer im Stamm. Zurück kommt die ID des Produkts, das jetzt gilt.
 */
async function produktRichtigstellen(
  artikel: VoranfrageArtikel,
  eingabe: ErgaenzungArtikel,
): Promise<string | null> {
  const nummer = eingabe.herstellernummer.trim();
  const eigenschaften = {
    hs_sku: nummer,
    farbe: eingabe.farbe,
    fuer: eingabe.fuer,
    beflockung_standard: beflockungText(eingabe),
    aktiv: "true",
  };

  const treffer = await hubspot<HsListe<HsObjekt>>({
    pfad: "/crm/v3/objects/products/search",
    koerper: {
      filterGroups: [{ filters: [{ propertyName: "hs_sku", operator: "EQ", value: nummer }] }],
      properties: ["hs_sku"],
      limit: 2,
    },
  });
  const fremd = treffer?.results.find((p) => p.id !== artikel.produktId);

  if (!fremd) {
    const ok = await hubspot<HsObjekt>({
      pfad: `/crm/v3/objects/products/${artikel.produktId}`,
      methode: "PATCH",
      koerper: { properties: eigenschaften },
    });
    return ok ? artikel.produktId : null;
  }

  // Das Produkt gibt es schon. Der Platzhalter wird stillgelegt statt
  // geloescht: was einmal in HubSpot stand, verschwindet hier nicht spurlos.
  if (artikel.platzhalter) {
    await hubspot({
      pfad: `/crm/v3/objects/products/${artikel.produktId}`,
      methode: "PATCH",
      koerper: { properties: { aktiv: "false", name: `${artikel.bezeichnung} (ersetzt)` } },
    });
  }
  await hubspot({
    pfad: `/crm/v3/objects/products/${fremd.id}`,
    methode: "PATCH",
    koerper: { properties: eigenschaften },
  });
  return fremd.id;
}

/**
 * Schreibt die fehlenden Angaben und startet die Größenabfrage.
 *
 * `null` heisst: HubSpot war nicht erreichbar oder der Vorgang passt nicht
 * mehr. Findet sich zur Mannschaft kein Kontakt, endet der Vorgang hier auf
 * Abgebrochen – jetzt ist der Fall aus docs/formulare.md (M7) wirklich da.
 */
export async function ergaenzeVorgang(
  nummer: string,
  eingabe: ErgaenzungEingabe,
): Promise<BedarfErgebnis | null> {
  const voranfrage = await ladeVoranfrage(nummer);
  if (!voranfrage) return null;

  const pipelines = await hubspot<
    HsListe<{ id: string; label: string; stages: { id: string; label: string }[] }>
  >({ pfad: "/crm/v3/pipelines/deals" });
  const pipeline = pipelines?.results.find((p) => p.label === PIPELINE_NAME);
  const stufe1 = pipeline?.stages.find((s) => s.label === "Größen laufen");
  const stufe9 = pipeline?.stages.find((s) => s.label === "Abgebrochen");
  if (!pipeline || !stufe1 || !stufe9) return null;

  for (const artikel of voranfrage.artikel) {
    const dazu = eingabe.artikel.find((a) => a.positionId === artikel.positionId);
    if (!dazu) continue;

    const produktId = await produktRichtigstellen(artikel, dazu);
    if (produktId && produktId !== artikel.produktId) {
      await hubspot({
        pfad: `/crm/v3/objects/line_items/${artikel.positionId}`,
        methode: "PATCH",
        koerper: { properties: { hs_product_id: produktId } },
      });
    }
    if (eingabe.sponsor !== voranfrage.sponsor) {
      await hubspot({
        pfad: `/crm/v3/objects/line_items/${artikel.positionId}`,
        methode: "PATCH",
        koerper: { properties: { sponsor: eingabe.sponsor } },
      });
    }
  }

  const kontakte = await kontakteDerMannschaft(voranfrage.teams);
  const ohnePersonen = kontakte.length === 0;

  const gesetzt = await hubspot<HsObjekt>({
    pfad: `/crm/v3/objects/deals/${voranfrage.dealId}`,
    methode: "PATCH",
    koerper: {
      properties: {
        dealstage: ohnePersonen ? stufe9.id : stufe1.id,
        groessen_frist: eingabe.groessenFrist,
        lieferadresse: eingabe.lieferadresse,
        initialen_noetig: eingabe.initialenNoetig ? "true" : "false",
        hinweis_haendler: eingabe.hinweise,
      },
    },
  });
  if (!gesetzt) return null;

  for (const kontakt of kontakte) {
    await verknuepfen("deals", voranfrage.dealId, "contacts", kontakt.id);
  }

  return {
    vorgang: nummer,
    modus: "vollstaendig",
    ohnePersonen,
    artikelText: voranfrage.artikel.map((a) => ({
      name: [a.hersteller, a.bezeichnung].filter(Boolean).join(" "),
      detail: `${a.groessenartLabel} · ${a.stueck} Stück je Person`,
    })),
    trainerStatus: statusLink(nummer) ?? "",
    bestaetigen: bestaetigenLink(nummer) ?? "",
    ergaenzen: "",
    personen: kontakte.map((k) => ({
      name: `${k.properties.firstname ?? ""} ${k.properties.lastname ?? ""}`.trim() || k.id,
      groessen: groessenLink(nummer, k.id) ?? "",
      status: statusLink(nummer, k.id) ?? "",
    })),
  };
}
