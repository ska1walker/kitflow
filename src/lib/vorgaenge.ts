import "server-only";

/**
 * Laedt Vorgaenge aus HubSpot und faellt auf Beispieldaten zurueck.
 *
 * HubSpot ist die einzige Datenbasis (CLAUDE.md); kitflow hat keine eigene
 * Datenbank. Solange die Anmeldung fehlt, die Pipeline „Ausstattung“ nicht
 * angelegt ist oder noch kein Vorgang existiert, zeigt die Seite den
 * Beispiel-Vorgang und kennzeichnet ihn als solchen. Die Oberflaeche merkt vom
 * Wechsel nichts: sie bekommt in beiden Faellen denselben Typ.
 *
 * Zuordnung nach docs/datenmodell.md:
 *   Deal        -> Vorgang
 *   Positionen  -> Person x Artikel
 *   Produkte    -> Artikelstamm
 *   Kontakte    -> Groessen
 *
 * Gemischt wird nie: ein Vorgang mit `quelle: "hubspot"` enthaelt kein einziges
 * Feld aus den Beispieldaten. Wo HubSpot nichts hergibt, bleibt das Feld leer
 * und die Oberflaeche laesst den Abschnitt weg.
 */

import { BEISPIEL_VORGANG, beispielZeilen } from "./beispieldaten";
import {
  assoziierteIds,
  batchLesen,
  hubspot,
  hubspotAktiv,
  pipelineStufen,
  type HsListe,
  type HsObjekt,
} from "./hubspot";
import {
  GROESSEN_FELD,
  GROESSEN_FELDER,
  GROESSEN_LABEL,
  groessenWerte,
  istJugend as istJugendMannschaft,
  istVeraltet,
} from "./groessen";
import { stufeAusName } from "./stufen";
import type {
  Artikel,
  ArtikelFuer,
  Ereignis,
  Groessenart,
  Haendler,
  PersonGroesse,
  StufeNr,
  Vorgang,
  VorgangsZeile,
} from "./typen";

/** Deal-Eigenschaften der Gruppe „Ausstattung“, die die Statusseite braucht. */
const DEAL_FELDER = [
  "vorgangsnummer",
  "ausstattungsart",
  "mannschaft",
  "mannschaftscode",
  "dealstage",
  "amount",
  "lieferant_gewaehlt",
  "ausgeschlossene_spieler",
  "angebot_intersport_am",
  "angebot_11teamsports_am",
  "zusage_sponsor",
  "eingang_verein",
  "eingang_am",
  "vorkasse_bestaetigt",
  "spartenbudget_freigegeben",
  "groessen_frist",
  "stufe_frist",
  "bestellt_am",
  "geliefert_am",
  "erstattet_am",
  "hs_lastmodifieddate",
];

/** Positions-Eigenschaften: eine Zeile ist eine Person mal einen Artikel. */
const POSITION_FELDER = [
  "name",
  "hs_sku",
  "quantity",
  "hs_product_id",
  "groesse",
  "rueckennummer",
  "spieler_hsid",
  "spieler_name",
  "sponsor",
];

/** Produkt-Eigenschaften. Die eigenen Felder braucht der Artikelstamm. */
const PRODUKT_FELDER = [
  "name",
  "hs_sku",
  "groessenart",
  "fuer",
  "artikelnr_intersport",
  "artikelnr_11teamsports",
  "beflockung_standard",
];

/** Kontakt-Eigenschaften: Name, Mannschaft und die Groessen aus docs/datenmodell.md. */
const KONTAKT_FELDER = [
  "firstname",
  "lastname",
  "team",
  "trikot",
  "trainingsanzug_oberteil",
  "kurze_sporthose",
  "trainingshose",
  "schuhgroesse",
  "trikotnummer",
  "groesse_zuletzt_bestaetigt_am",
];

/** Die beiden Haendler, an die jede Anfrage geht (docs/konzept.md). */
const HAENDLER_SPALTEN = [
  { name: "11teamsports", feld: "angebot_11teamsports_am" },
  { name: "Intersport Uelzen", feld: "angebot_intersport_am" },
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
 * „2026-09-10“ wird zu „10.09.“. Datums-Eigenschaften stehen bei HubSpot auf
 * Mitternacht UTC; wir zerlegen die Zeichenkette, statt sie in eine lokale Zeit
 * zu rechnen, sonst rutscht der Tag je nach Serverzeitzone.
 */
function kurzDatum(wert: string | undefined): string | undefined {
  if (!wert) return undefined;
  const treffer = /^(\d{4})-(\d{2})-(\d{2})/.exec(wert);
  return treffer ? `${treffer[3]}.${treffer[2]}.` : undefined;
}

const BERLIN = "Europe/Berlin";

/** Zeitstempel wie `hs_lastmodifieddate` in deutscher Ortszeit. */
function standText(wert: string | undefined): string {
  if (!wert) return "";
  const zeitpunkt = new Date(wert);
  if (Number.isNaN(zeitpunkt.getTime())) return "";

  const datum = new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN,
    day: "2-digit",
    month: "2-digit",
  }).format(zeitpunkt);
  const uhr = new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN,
    hour: "2-digit",
    minute: "2-digit",
  }).format(zeitpunkt);

  return `Stand: ${datum}, ${uhr} Uhr`;
}

/** Ganze Tage zwischen einem Zeitpunkt und jetzt. */
function tageSeit(wert: string | undefined): number | null {
  if (!wert) return null;
  const zeitpunkt = new Date(wert);
  if (Number.isNaN(zeitpunkt.getTime())) return null;
  return Math.floor((Date.now() - zeitpunkt.getTime()) / 86_400_000);
}

/** Jugendmannschaft? Entscheidet ueber Namen in der Oberflaeche und ueber die
 * Frist, ab der eine Groesse als veraltet gilt. */
function istJugend(deal: HsObjekt): boolean {
  return istJugendMannschaft(text(deal, "mannschaft"), text(deal, "mannschaftscode"));
}

/** Record-IDs aus dem Freitextfeld `ausgeschlossene_spieler`. */
function ausgeschlossene(deal: HsObjekt): Set<string> {
  const roh = text(deal, "ausgeschlossene_spieler");
  if (!roh) return new Set();
  return new Set(roh.split(/[^0-9]+/).filter(Boolean));
}

function alsGroessenart(wert: string | undefined): Groessenart {
  return wert && wert in GROESSEN_LABEL ? (wert as Groessenart) : "ohne";
}

function alsArtikelFuer(wert: string | undefined): ArtikelFuer {
  return wert === "feldspieler" || wert === "torwart" ? wert : "alle";
}

/**
 * Der Artikelstamm des Vorgangs, aus den Produkten hinter den Positionen.
 *
 * Fehlen die eigenen Produkt-Eigenschaften noch im Portal, bleibt der Artikel
 * mit Name und Herstellernummer stehen und zaehlt als „alle“ – lieber ein
 * ungruppierter Artikel als ein erfundener.
 */
function artikelAus(positionen: HsObjekt[], produkte: Map<string, HsObjekt>): Artikel[] {
  const nachNummer = new Map<string, Artikel>();

  for (const position of positionen) {
    const produkt = produkte.get(text(position, "hs_product_id") ?? "");
    const name = text(produkt ?? position, "name") ?? text(position, "name");
    const nummer = text(produkt ?? position, "hs_sku") ?? text(position, "hs_sku");
    if (!name || !nummer || nachNummer.has(nummer)) continue;

    nachNummer.set(nummer, {
      name,
      herstellernummer: nummer,
      artikelnrElfteamsports: produkt ? text(produkt, "artikelnr_11teamsports") : undefined,
      artikelnrIntersport: produkt ? text(produkt, "artikelnr_intersport") : undefined,
      groessenart: alsGroessenart(produkt ? text(produkt, "groessenart") : undefined),
      fuer: alsArtikelFuer(produkt ? text(produkt, "fuer") : undefined),
    });
  }

  return [...nachNummer.values()];
}

/**
 * Wer ist Feldspieler, wer Torwart? Entschieden wird ueber die Artikel, die
 * eine Person bekommt: wer auch nur eine Torwart-Position hat, ist Torwart.
 */
function rollenZaehlen(
  positionen: HsObjekt[],
  produkte: Map<string, HsObjekt>,
): { feldspieler: number; torwart: number } {
  const torwarte = new Set<string>();
  const alle = new Set<string>();

  for (const position of positionen) {
    const person = text(position, "spieler_hsid");
    if (!person) continue;
    alle.add(person);

    const produkt = produkte.get(text(position, "hs_product_id") ?? "");
    if (produkt && text(produkt, "fuer") === "torwart") torwarte.add(person);
  }

  return { feldspieler: alle.size - torwarte.size, torwart: torwarte.size };
}

/**
 * Die Ausstattung einer Person: je Position eine Groesse, dazu die
 * Rueckennummer. Ohne `personId` bleibt die Liste leer – dann weiss die Seite
 * nicht, wer sie geoeffnet hat, und darf niemandes Groessen zeigen.
 */
function ausstattungVon(
  personId: string | undefined,
  positionen: HsObjekt[],
  produkte: Map<string, HsObjekt>,
): PersonGroesse[] {
  if (!personId) return [];

  const eigene = positionen.filter((p) => text(p, "spieler_hsid") === personId);
  const eintraege: PersonGroesse[] = [];

  for (const position of eigene) {
    const groesse = text(position, "groesse");
    if (!groesse) continue;
    const produkt = produkte.get(text(position, "hs_product_id") ?? "");
    const art = alsGroessenart(produkt ? text(produkt, "groessenart") : undefined);
    const feld = art === "ohne" ? (text(position, "name") ?? "Ausstattung") : GROESSEN_LABEL[art];
    if (!eintraege.some((e) => e.feld === feld)) eintraege.push({ feld, wert: groesse });
  }

  const nummer = eigene.map((p) => text(p, "rueckennummer")).find(Boolean);
  if (nummer) eintraege.push({ feld: "Rückennummer", wert: nummer });

  return eintraege;
}

/** Hat der Kontakt eine Groesse hinterlegt? */
function hatGroesse(kontakt: HsObjekt): boolean {
  if (text(kontakt, "groesse_zuletzt_bestaetigt_am")) return true;
  // Rueckfall, solange das Bestaetigungsdatum noch nirgends gepflegt ist:
  // eine eingetragene Groesse zaehlt auch ohne Datum (docs/datenmodell.md).
  return GROESSEN_FELDER.some((feld) => text(kontakt, feld));
}

function personName(kontakt: HsObjekt): string {
  const vorname = text(kontakt, "firstname") ?? "";
  const nachname = text(kontakt, "lastname") ?? "";
  return `${vorname} ${nachname}`.trim() || `Kontakt ${kontakt.id}`;
}

/**
 * Der Verlauf aus den Datums-Eigenschaften des Deals.
 *
 * HubSpot fuehrt keine Ereignisliste, deshalb steht hier nur, was der Deal
 * wirklich datiert hat. Lieber ein duenner echter Verlauf als ein erfundener.
 */
function verlaufAus(deal: HsObjekt, lieferant: string | undefined): Ereignis[] {
  const eintraege: { sortier: string; ereignis: Ereignis }[] = [];

  function eintrag(feld: string, ab: StufeNr, titel: string, sub?: string, intern?: boolean) {
    const roh = text(deal, feld);
    const datum = kurzDatum(roh);
    if (!roh || !datum) return;
    eintraege.push({ sortier: roh, ereignis: { ab, datum, uhrzeit: "", text: titel, sub, intern } });
  }

  eintrag("groessen_frist", 1, "Frist für die Größen");
  eintrag("angebot_11teamsports_am", 3, "Angebot von 11teamsports eingegangen");
  eintrag("angebot_intersport_am", 3, "Angebot von Intersport Uelzen eingegangen");
  eintrag("stufe_frist", 4, "Frist der Kaskadenstufe", undefined, true);
  eintrag("eingang_am", 5, "Geld ist auf dem Vereinskonto", "Deckungsprüfung erfüllt");
  eintrag("bestellt_am", 6, lieferant ? `Bestellung an ${lieferant} verschickt` : "Bestellt");
  eintrag("geliefert_am", 7, "Lieferung angekommen");
  eintrag("erstattet_am", 8, "Erstattung überwiesen", undefined, true);

  return eintraege.sort((a, b) => a.sortier.localeCompare(b.sortier)).map((e) => e.ereignis);
}

/** Die beiden Haendler mit dem Tag, an dem ihr Angebot einging. */
function haendlerAus(deal: HsObjekt): Haendler[] {
  const gewaehlt = text(deal, "lieferant_gewaehlt");
  return HAENDLER_SPALTEN.map((spalte) => ({
    name: spalte.name,
    ansprechpartner: "",
    angebotAm: kurzDatum(text(deal, spalte.feld)) ?? "",
    gewaehlt: gewaehlt === spalte.name,
  }));
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
      return zahl(deal, "zusage_sponsor") > 0 ? "Sponsor" : "Finanzierung";
    case 6:
      return text(deal, "lieferant_gewaehlt") ?? "Händler";
    case 7:
      return "Trainer";
    default:
      return "–";
  }
}

/** Die Frist, die auf der aktuellen Stufe gilt. */
function fristVon(stufe: StufeNr, deal: HsObjekt): string | undefined {
  const roh = stufe === 1 ? text(deal, "groessen_frist") : text(deal, "stufe_frist");
  const datum = kurzDatum(roh);
  return datum ? `Frist ${datum}` : undefined;
}

/** Ein Deal wird zur Zeile in der Uebersicht. */
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
 * Streicht aus einem Vorgang alles, was ein Spieler nicht sehen darf, bevor er
 * an den Browser geht (docs/formulare.md: „keine anderen Namen“).
 *
 * Die Karten blenden diese Felder ohnehin aus, aber ausgeblendet heisst nicht
 * abwesend: der ganze Vorgang landet im Quelltext der Seite. Wer ihn anschaut,
 * laese sonst die Namen derer, die noch keine Groesse eingetragen haben, und
 * die internen Verlaufseintraege mit.
 */
export function fuerSpieler(vorgang: Vorgang): Vorgang {
  return {
    ...vorgang,
    fehlendeGroessen: [],
    verlauf: vorgang.verlauf.filter((e) => !e.intern),
  };
}

/** Die Suche nach Deals der Ausstattungs-Pipeline. */
function dealSuche(nummer: string | undefined, limit: number) {
  return {
    filterGroups: [
      {
        filters: nummer
          ? [{ propertyName: "vorgangsnummer", operator: "EQ", value: nummer }]
          : [{ propertyName: "vorgangsnummer", operator: "HAS_PROPERTY" }],
      },
    ],
    properties: DEAL_FELDER,
    sorts: [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
    limit,
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
    koerper: dealSuche(undefined, 100),
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
 * Ein einzelner Vorgang mit allem, was die Statusseite zeigt: Kopfdaten aus
 * dem Deal, Artikel aus Positionen und Produkten, Groessen aus den Kontakten,
 * Verlauf aus den Datumsfeldern.
 *
 * `personId` ist die Record-ID der Person, die den Link geoeffnet hat. Ohne
 * sie bleibt die Spieler-Ansicht leer, denn dann ist nicht bekannt, wessen
 * Groessen gezeigt werden duerfen. Spaeter kommt sie aus dem signierten Link
 * (docs/konzept.md).
 */
export async function ladeVorgang(nummer?: string, personId?: string): Promise<Vorgang> {
  if (!hubspotAktiv()) return BEISPIEL_VORGANG;

  const stufen = await pipelineStufen();
  if (!stufen) return BEISPIEL_VORGANG;

  const treffer = await hubspot<HsListe<HsObjekt>>({
    pfad: "/crm/v3/objects/deals/search",
    koerper: dealSuche(nummer, 1),
  });

  const deal = treffer?.results[0];
  if (!deal) return BEISPIEL_VORGANG;

  const stufenName = stufen.get(deal.properties.dealstage ?? "");
  const stufe = stufenName ? stufeAusName(stufenName) : null;
  if (!stufe) return BEISPIEL_VORGANG;

  const [positionsIds, kontaktIds] = await Promise.all([
    assoziierteIds("deals", deal.id, "line_items"),
    assoziierteIds("deals", deal.id, "contacts"),
  ]);

  const [positionen, kontakteRoh] = await Promise.all([
    batchLesen("line_items", positionsIds, POSITION_FELDER),
    batchLesen("contacts", kontaktIds, KONTAKT_FELDER),
  ]);

  const produktIds = [
    ...new Set(positionen.map((p) => text(p, "hs_product_id")).filter((id): id is string => !!id)),
  ];
  const produkte = new Map(
    (await batchLesen("products", produktIds, PRODUKT_FELDER)).map((p) => [p.id, p]),
  );

  const raus = ausgeschlossene(deal);
  const kontakte = kontakteRoh.filter((k) => !raus.has(k.id));
  const mitGroesse = kontakte.filter(hatGroesse);
  const jugend = istJugend(deal);

  const artikel = artikelAus(positionen, produkte);
  const rollen = rollenZaehlen(positionen, produkte);
  const lieferant = text(deal, "lieferant_gewaehlt");

  const betrag = zahl(deal, "amount");
  const gedeckt =
    betrag > 0 &&
    (zahl(deal, "eingang_verein") + zahl(deal, "spartenbudget_freigegeben") >= betrag ||
      zahl(deal, "vorkasse_bestaetigt") >= betrag);

  const sponsor = positionen.map((p) => text(p, "sponsor")).find(Boolean);
  const beflockung = [...produkte.values()].map((p) => text(p, "beflockung_standard")).find(Boolean);

  const bestaetigt = kontakte
    .map((k) => text(k, "groesse_zuletzt_bestaetigt_am"))
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);

  return {
    nummer: text(deal, "vorgangsnummer") ?? deal.id,
    titel: `${text(deal, "mannschaft") ?? "Mannschaft"} · ${text(deal, "ausstattungsart") ?? "Ausstattung"}`,
    untertitel: [
      kontakte.length > 0 ? `${kontakte.length} Personen` : undefined,
      sponsor ? `Sponsor ${sponsor}` : undefined,
      lieferant,
    ]
      .filter(Boolean)
      .join(" · "),
    stufe,
    stand: standText(text(deal, "hs_lastmodifieddate")),

    sponsor,
    finanzierungZugesagt: zahl(deal, "zusage_sponsor") > 0,
    geldEingangAm: gedeckt ? kurzDatum(text(deal, "eingang_am")) : undefined,

    groessenEingetragen: mitGroesse.length,
    groessenGesamt: kontakte.length,
    groessenBestaetigtAm: kurzDatum(bestaetigt),
    // Bei Jugendmannschaften nennt die Seite keine Namen (CLAUDE.md); die
    // Groessenkarte zeigt dann nur, wie viele noch fehlen.
    fehlendeGroessen: jugend
      ? []
      : kontakte.filter((k) => !hatGroesse(k)).map(personName),

    beflockung,
    feldspielerAnzahl: rollen.feldspieler,
    torwartAnzahl: rollen.torwart,

    haendler: haendlerAus(deal),
    artikel,
    verlauf: verlaufAus(deal, lieferant),

    meineAusstattung: ausstattungVon(personId, positionen, produkte),
    meinHinweis: personId
      ? "Du zahlst nichts vorab. Was offen ist, klärt dein Trainer."
      : "Deine persönlichen Größen erscheinen hier, sobald du über deinen eigenen Link kommst.",
    spielerGruss: "Hier siehst du, wo die neue Ausstattung gerade steckt.",

    quelle: "hubspot",
  };
}

/* ------------------------------------------------------------------ *
 * F2 · Groessenabfrage (docs/formulare.md)
 * ------------------------------------------------------------------ */

/** Eine Groessenart, die dieser Vorgang von dieser Person braucht. */
export type GroessenFrage = {
  art: Groessenart;
  label: string;
  /** Die HubSpot-Eigenschaft am Kontakt, zugleich der Feldname im Formular. */
  feld: string;
  werte: string[];
  /** Aktueller Wert, leer wenn keiner da oder veraltet. */
  wert: string;
  /** Es gab einen Wert, er ist aber zu alt zum Vorbelegen. */
  veraltet: boolean;
};

export type GroessenAbfrage = {
  vorgang: string;
  person: string;
  anrede: string;
  mannschaft: string;
  gegenstand: string;
  frist?: string;
  jugend: boolean;
  fragen: GroessenFrage[];
  /** Nur auf Stufe 1 darf geaendert werden (docs/formulare.md). */
  offen: boolean;
};

/**
 * Alles, was die Groessenabfrage einer Person braucht.
 *
 * `null` heisst: gibt es nicht, gehoert nicht zusammen, oder HubSpot antwortet
 * nicht. Die Seite macht daraus dieselbe Antwort wie bei einem falschen Token,
 * damit sich ueber die Antwort nichts erraten laesst.
 */
export async function ladeGroessenAbfrage(
  nummer: string,
  personId: string,
): Promise<GroessenAbfrage | null> {
  if (!hubspotAktiv()) return null;

  const stufen = await pipelineStufen();
  if (!stufen) return null;

  const treffer = await hubspot<HsListe<HsObjekt>>({
    pfad: "/crm/v3/objects/deals/search",
    koerper: dealSuche(nummer, 1),
  });
  const deal = treffer?.results[0];
  if (!deal || text(deal, "vorgangsnummer") !== nummer) return null;

  const stufenName = stufen.get(deal.properties.dealstage ?? "");
  const stufe = stufenName ? stufeAusName(stufenName) : null;
  if (!stufe) return null;

  // Der Token bindet die Person schon an den Vorgang. Die Verknuepfung wird
  // trotzdem geprueft: wer inzwischen aus der Mannschaft raus ist, soll mit
  // einem alten Link nichts mehr eintragen.
  const kontaktIds = await assoziierteIds("deals", deal.id, "contacts");
  if (!kontaktIds.includes(personId)) return null;
  if (ausgeschlossene(deal).has(personId)) return null;

  const [kontakte, positionsIds] = await Promise.all([
    batchLesen("contacts", [personId], KONTAKT_FELDER),
    assoziierteIds("deals", deal.id, "line_items"),
  ]);
  const kontakt = kontakte[0];
  if (!kontakt) return null;

  const positionen = await batchLesen("line_items", positionsIds, POSITION_FELDER);
  const produktIds = [
    ...new Set(positionen.map((p) => text(p, "hs_product_id")).filter((id): id is string => !!id)),
  ];
  const produkte = new Map(
    (await batchLesen("products", produktIds, PRODUKT_FELDER)).map((p) => [p.id, p]),
  );
  const artikel = artikelAus(positionen, produkte);

  const jugend = istJugend(deal);
  const veraltet = istVeraltet(text(kontakt, "groesse_zuletzt_bestaetigt_am"), jugend);

  // Jede Groessenart nur einmal fragen, auch wenn mehrere Artikel sie brauchen.
  const arten = [...new Set(artikel.map((a) => a.groessenart))].filter((a) => a !== "ohne");

  const fragen: GroessenFrage[] = arten.map((art) => {
    const feld = GROESSEN_FELD[art];
    const wert = feld ? (text(kontakt, feld) ?? "") : "";
    return {
      art,
      label: GROESSEN_LABEL[art],
      feld: feld ?? art,
      werte: groessenWerte(art),
      wert: veraltet ? "" : wert,
      veraltet: veraltet && wert !== "",
    };
  });

  return {
    vorgang: nummer,
    person: personId,
    anrede: text(kontakt, "firstname") ?? "",
    mannschaft: text(deal, "mannschaft") ?? text(deal, "mannschaftscode") ?? "",
    gegenstand: text(deal, "ausstattungsart") ?? "Ausstattung",
    frist: kurzDatum(text(deal, "groessen_frist")),
    jugend,
    fragen,
    offen: stufe === 1,
  };
}

/**
 * Schreibt die Groessen einer Person und setzt das Bestaetigungsdatum.
 *
 * Geschrieben wird nur, was zu diesem Vorgang gehoert und in der HubSpot-Liste
 * steht. Ein Formular laesst sich nachbauen, deshalb wird hier nichts
 * uebernommen, was nicht vorher als Frage rausging.
 */
export async function speichereGroessen(
  abfrage: GroessenAbfrage,
  eingaben: Record<string, string>,
): Promise<boolean> {
  const werte: Record<string, string> = {};

  for (const frage of abfrage.fragen) {
    const wert = eingaben[frage.feld];
    if (!wert) continue;
    if (!frage.werte.includes(wert)) return false;
    werte[frage.feld] = wert;
  }

  if (Object.keys(werte).length === 0) return false;

  werte.groesse_zuletzt_bestaetigt_am = new Date().toISOString().slice(0, 10);

  const antwort = await hubspot<HsObjekt>({
    pfad: `/crm/v3/objects/contacts/${encodeURIComponent(abfrage.person)}`,
    methode: "PATCH",
    koerper: { properties: werte },
  });

  return antwort !== null;
}
