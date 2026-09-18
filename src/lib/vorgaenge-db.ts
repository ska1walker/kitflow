import "server-only";

/**
 * Vorgänge in der eigenen Datenbank (Migration 001).
 *
 * Das ist die Schicht, die in Schritt 2 an die Stelle der Deal-Eigenschaften
 * tritt. **Sie ist noch an keiner Seite angeschlossen** – die App läuft weiter
 * auf HubSpot, bis diese Schicht steht und geprüft ist.
 *
 * Was hier NICHT steht, ist Absicht: kein Name, keine Adresse, keine Größe.
 * Personen hängen als HubSpot-ID daran, und der Name wird beim Anzeigen dort
 * geholt. So gibt es keinen zweiten Bestand von Kindernamen und Größen.
 *
 * Die Spalten der Datenbank heißen wie in der Migration, die Felder hier heißen
 * wie im übrigen Code. Übersetzt wird an genau einer Stelle, den `aus…`- und
 * `zu…`-Funktionen: wird eine Spalte umbenannt, meldet es der Übersetzer und
 * nicht irgendein Aufrufer.
 */

import { aendere, db, lese, leseEine, rufe, schreibe } from "./db";
import type { ArtikelFuer, Groessenart, StufeNr } from "./typen";

/* ------------------------------------------------------------------ *
 * Was die Datenbank liefert
 * ------------------------------------------------------------------ */

/** Genau die Spalten aus `vorgang_artikel`. */
type ArtikelRoh = {
  id: string;
  reihenfolge: number;
  hersteller: string | null;
  bezeichnung: string;
  herstellernummer: string | null;
  farbe: string | null;
  groessenart: Groessenart;
  fuer: ArtikelFuer;
  stueck: number;
  beflockung: string | null;
  groesse_von: string | null;
  groesse_bis: string | null;
};

/** Genau die Spalten aus `vorgang_person`. */
type PersonRoh = {
  id: string;
  hs_kontakt_id: string;
  ausgeschlossen: boolean;
  torwart: boolean;
  trikotnummer: string | null;
};

/** Genau die Spalten aus `vorgang`, plus die eingebetteten Kinder. */
type VorgangRoh = {
  id: string;
  nummer: string;
  mannschaften: string[];
  mannschaftscode: string | null;
  ausstattungsart: string;
  stufe: number;
  stufe_seit: string;
  abbruch_bei: number | null;
  trainer_name: string | null;
  trainer_email: string | null;
  trainer_telefon: string | null;
  personen_geschaetzt: number | null;
  groessenarten: string[];
  groessen_frist: string | null;
  stufe_frist: string | null;
  liste_bestaetigt_am: string | null;
  lieferadresse: string | null;
  initialen_noetig: boolean;
  sponsor: string | null;
  hinweis_haendler: string | null;
  hs_deal_id: string | null;
  angelegt_am: string;
  aktualisiert_am: string;

  // Migration 002: was ein Vorgang nach der Groessenabfrage noch erlebt.
  // `numeric` kommt als JSON-Zahl heraus, nicht als Zeichenkette - gemessen an
  // PostgREST 13.0.4, festgehalten in db-postgrest.echt.ts.
  angebot_intersport_betrag: number | null;
  angebot_intersport_am: string | null;
  angebot_intersport_gueltig_bis: string | null;
  angebot_intersport_lieferzeit: string | null;
  angebot_intersport_abweichung: string | null;
  angebot_11teamsports_betrag: number | null;
  angebot_11teamsports_am: string | null;
  angebot_11teamsports_gueltig_bis: string | null;
  angebot_11teamsports_lieferzeit: string | null;
  angebot_11teamsports_abweichung: string | null;
  lieferant_gewaehlt: string | null;
  kaskadenstufe: number | null;
  zusage_sponsor: number | null;
  eingang_verein: number | null;
  eingang_am: string | null;
  vorkasse_bestaetigt: number | null;
  spartenbudget_freigegeben: number | null;
  zahlweg_mannschaft: string | null;
  rechnungsempfaenger: string | null;
  bestellt_am: string | null;
  geliefert_am: string | null;
  rechnung_betrag: number | null;
  rechnung_abweichung: boolean | null;
  erstattung_betrag: number | null;
  erstattet_am: string | null;
  erstattung_kontoinhaber: string | null;
  erstattung_iban: string | null;
  vorgang_artikel?: ArtikelRoh[];
  vorgang_person?: PersonRoh[];
};

export type ArtikelSatz = {
  id: string;
  hersteller?: string;
  bezeichnung: string;
  herstellernummer?: string;
  farbe?: string;
  groessenart: Groessenart;
  fuer: ArtikelFuer;
  stueck: number;
  beflockung?: string;
  groesseVon?: string;
  groesseBis?: string;
};

export type PersonSatz = {
  id: string;
  kontaktId: string;
  ausgeschlossen: boolean;
  torwart: boolean;
  trikotnummer?: string;
};

/** Ein Angebot eines Händlers. Leere Felder heißen: noch nichts da. */
export type AngebotSatz = {
  betrag?: number;
  am?: string;
  gueltigBis?: string;
  lieferzeit?: string;
  abweichung?: string;
};

/**
 * Das Geld. Zusage und Eingang stehen getrennt, weil sie Verschiedenes sind:
 * bestellt wird erst, wenn das Geld da ist (docs/konzept.md). Eine Zusage
 * allein macht nie bestellbar.
 */
export type FinanzenSatz = {
  zusageSponsor?: number;
  eingangVerein?: number;
  eingangAm?: string;
  vorkasseBestaetigt?: number;
  spartenbudgetFreigegeben?: number;
  zahlwegMannschaft?: string;
  rechnungsempfaenger?: string;
};

export type ErstattungSatz = {
  betrag?: number;
  am?: string;
  kontoinhaber?: string;
  /** Nach Abschluss des Vorgangs löschen (docs/datenmodell.md). */
  iban?: string;
};

export type VorgangSatz = {
  id: string;
  nummer: string;
  mannschaften: string[];
  mannschaftscode?: string;
  ausstattungsart: string;
  stufe: StufeNr;
  stufeSeit: string;
  abbruchBei?: StufeNr;
  trainerName?: string;
  trainerEmail?: string;
  trainerTelefon?: string;
  personenGeschaetzt?: number;
  groessenarten: Groessenart[];
  groessenFrist?: string;
  stufeFrist?: string;
  listeBestaetigtAm?: string;
  lieferadresse?: string;
  initialenNoetig: boolean;
  sponsor?: string;
  hinweisHaendler?: string;
  hsDealId?: string;
  angelegtAm: string;
  aktualisiertAm: string;
  artikel: ArtikelSatz[];
  personen: PersonSatz[];

  angebote: { intersport: AngebotSatz; elfteamsports: AngebotSatz };
  lieferantGewaehlt?: string;
  kaskadenstufe?: number;
  finanzen: FinanzenSatz;
  bestelltAm?: string;
  geliefertAm?: string;
  rechnungBetrag?: number;
  rechnungAbweichung?: boolean;
  erstattung: ErstattungSatz;
};

/** `null` und `""` sind dasselbe wie „nicht gesetzt“ – wie `text()` bei HubSpot. */
function wert(roh: string | null): string | undefined {
  return roh === null || roh === "" ? undefined : roh;
}

/**
 * Ein Geldbetrag.
 *
 * `null` heißt „noch nichts“ und wird zu `undefined` — nicht zu 0. Der
 * Unterschied entscheidet die Deckungsprüfung: „null Euro zugesagt“ und „noch
 * nichts zugesagt“ sind zweierlei, und nur das Zweite darf warten.
 */
function betrag(roh: number | null): number | undefined {
  return roh === null || !Number.isFinite(roh) ? undefined : roh;
}

/** Eine Stufe, die es gibt. Alles andere wäre ein Datenfehler und kein Vorgang. */
function alsStufe(roh: number | null): StufeNr | undefined {
  return roh !== null && Number.isInteger(roh) && roh >= 0 && roh <= 9
    ? (roh as StufeNr)
    : undefined;
}

function ausArtikel(roh: ArtikelRoh): ArtikelSatz {
  return {
    id: roh.id,
    hersteller: wert(roh.hersteller),
    bezeichnung: roh.bezeichnung,
    herstellernummer: wert(roh.herstellernummer),
    farbe: wert(roh.farbe),
    groessenart: roh.groessenart,
    fuer: roh.fuer,
    stueck: roh.stueck,
    beflockung: wert(roh.beflockung),
    groesseVon: wert(roh.groesse_von),
    groesseBis: wert(roh.groesse_bis),
  };
}

function ausPerson(roh: PersonRoh): PersonSatz {
  return {
    id: roh.id,
    kontaktId: roh.hs_kontakt_id,
    ausgeschlossen: roh.ausgeschlossen,
    torwart: roh.torwart,
    trikotnummer: wert(roh.trikotnummer),
  };
}

/** `undefined`, wenn die Zeile keine gültige Stufe trägt: dann ist sie kaputt. */
function ausVorgang(roh: VorgangRoh): VorgangSatz | undefined {
  const stufe = alsStufe(roh.stufe);
  if (stufe === undefined) {
    console.error(`Vorgang ${roh.nummer} hat eine unbekannte Stufe`);
    return undefined;
  }

  return {
    id: roh.id,
    nummer: roh.nummer,
    mannschaften: roh.mannschaften ?? [],
    mannschaftscode: wert(roh.mannschaftscode),
    ausstattungsart: roh.ausstattungsart,
    stufe,
    stufeSeit: roh.stufe_seit,
    abbruchBei: alsStufe(roh.abbruch_bei),
    trainerName: wert(roh.trainer_name),
    trainerEmail: wert(roh.trainer_email),
    trainerTelefon: wert(roh.trainer_telefon),
    personenGeschaetzt: roh.personen_geschaetzt ?? undefined,
    groessenarten: (roh.groessenarten ?? []) as Groessenart[],
    groessenFrist: wert(roh.groessen_frist),
    stufeFrist: wert(roh.stufe_frist),
    listeBestaetigtAm: wert(roh.liste_bestaetigt_am),
    lieferadresse: wert(roh.lieferadresse),
    initialenNoetig: roh.initialen_noetig,
    sponsor: wert(roh.sponsor),
    hinweisHaendler: wert(roh.hinweis_haendler),
    hsDealId: wert(roh.hs_deal_id),
    angelegtAm: roh.angelegt_am,
    aktualisiertAm: roh.aktualisiert_am,
    artikel: (roh.vorgang_artikel ?? []).sort((a, b) => a.reihenfolge - b.reihenfolge).map(ausArtikel),
    personen: (roh.vorgang_person ?? []).map(ausPerson),

    angebote: {
      intersport: {
        betrag: betrag(roh.angebot_intersport_betrag),
        am: wert(roh.angebot_intersport_am),
        gueltigBis: wert(roh.angebot_intersport_gueltig_bis),
        lieferzeit: wert(roh.angebot_intersport_lieferzeit),
        abweichung: wert(roh.angebot_intersport_abweichung),
      },
      elfteamsports: {
        betrag: betrag(roh.angebot_11teamsports_betrag),
        am: wert(roh.angebot_11teamsports_am),
        gueltigBis: wert(roh.angebot_11teamsports_gueltig_bis),
        lieferzeit: wert(roh.angebot_11teamsports_lieferzeit),
        abweichung: wert(roh.angebot_11teamsports_abweichung),
      },
    },
    lieferantGewaehlt: wert(roh.lieferant_gewaehlt),
    kaskadenstufe: roh.kaskadenstufe ?? undefined,
    finanzen: {
      zusageSponsor: betrag(roh.zusage_sponsor),
      eingangVerein: betrag(roh.eingang_verein),
      eingangAm: wert(roh.eingang_am),
      vorkasseBestaetigt: betrag(roh.vorkasse_bestaetigt),
      spartenbudgetFreigegeben: betrag(roh.spartenbudget_freigegeben),
      zahlwegMannschaft: wert(roh.zahlweg_mannschaft),
      rechnungsempfaenger: wert(roh.rechnungsempfaenger),
    },
    bestelltAm: wert(roh.bestellt_am),
    geliefertAm: wert(roh.geliefert_am),
    rechnungBetrag: betrag(roh.rechnung_betrag),
    rechnungAbweichung: roh.rechnung_abweichung ?? undefined,
    erstattung: {
      betrag: betrag(roh.erstattung_betrag),
      am: wert(roh.erstattet_am),
      kontoinhaber: wert(roh.erstattung_kontoinhaber),
      iban: wert(roh.erstattung_iban),
    },
  };
}

/** Vorgang samt Artikeln und Personen in einem Aufruf. */
const MIT_KINDERN = "*,vorgang_artikel(*),vorgang_person(*)";

/**
 * Die Eindeutigkeit in `vorgang_person`, wie die Migration sie legt. PostgREST
 * braucht die Spalten ausdrücklich, sonst schaut es nur auf den
 * Primärschlüssel und antwortet auf den zweiten Nachtrag mit 409.
 */
const EINDEUTIG_PERSON = "vorgang_id,hs_kontakt_id";

/* ------------------------------------------------------------------ *
 * Lesen
 * ------------------------------------------------------------------ */

/**
 * Die drei Fälle, die auseinandergehalten werden müssen. `unbekannt` und
 * `gestoert` sehen für den Benutzer verschieden aus: das eine ist ein toter
 * Link, das andere sind wir.
 */
export type SatzErgebnis =
  | { stand: "da"; vorgang: VorgangSatz }
  | { stand: "unbekannt" }
  | { stand: "gestoert" };

/**
 * Dieselben drei Stände für alles, was eine Seite lädt.
 *
 * `null` hieß dort früher beides: „gibt es nicht“ und „konnte nicht fragen“.
 * Die Statusseite trennte das schon, F2, F3 und F1b nicht — dort bekam der
 * Spieler bei einer Störung „Dieser Link funktioniert nicht“ zu lesen und
 * suchte den Fehler bei sich. Ein toter Link und ein Ausfall sehen für den,
 * der davorsitzt, völlig verschieden aus.
 */
export type Abruf<T> = { stand: "da"; daten: T } | { stand: "unbekannt" } | { stand: "gestoert" };

export async function vorgangPerNummer(nummer: string): Promise<SatzErgebnis> {
  const zeilen = await lese<VorgangRoh>("vorgang", {
    select: MIT_KINDERN,
    nummer: `eq.${nummer}`,
    limit: "1",
  });
  if (zeilen === null) return { stand: "gestoert" };

  const roh = zeilen[0];
  if (!roh) return { stand: "unbekannt" };

  const vorgang = ausVorgang(roh);
  // Eine Zeile mit kaputter Stufe ist nicht „nicht da“: wer sie als unbekannt
  // meldet, schickt den Trainer auf die Suche nach einem Link, der stimmt.
  return vorgang ? { stand: "da", vorgang } : { stand: "gestoert" };
}

/**
 * Alle Vorgänge für die Übersicht der Spartenleitung, neueste zuerst.
 * `null` heißt „konnte nicht fragen“, `[]` heißt „es gibt keine“.
 */
export async function alleVorgaenge(): Promise<VorgangSatz[] | null> {
  const zeilen = await lese<VorgangRoh>("vorgang", {
    select: MIT_KINDERN,
    order: "angelegt_am.desc",
    limit: "200",
  });
  if (zeilen === null) return null;
  return zeilen.map(ausVorgang).filter((v): v is VorgangSatz => v !== undefined);
}

/** Vorgänge auf einer Stufe, mit Frist – die Grundlage des Erinnerungslaufs. */
export async function vorgaengeAufStufe(stufe: StufeNr): Promise<VorgangSatz[] | null> {
  const zeilen = await lese<VorgangRoh>("vorgang", {
    select: MIT_KINDERN,
    stufe: `eq.${stufe}`,
    order: "angelegt_am.asc",
    limit: "200",
  });
  if (zeilen === null) return null;
  return zeilen.map(ausVorgang).filter((v): v is VorgangSatz => v !== undefined);
}

/* ------------------------------------------------------------------ *
 * Anlegen
 * ------------------------------------------------------------------ */

export type NeuerArtikel = {
  hersteller?: string;
  bezeichnung: string;
  herstellernummer?: string;
  farbe?: string;
  groessenart: Groessenart;
  fuer?: ArtikelFuer;
  stueck: number;
  beflockung?: string;
  groesseVon?: string;
  groesseBis?: string;
};

export type NeuerVorgang = {
  mannschaften: string[];
  mannschaftscode?: string;
  ausstattungsart: string;
  stufe: StufeNr;
  trainerName?: string;
  trainerEmail?: string;
  trainerTelefon?: string;
  personenGeschaetzt?: number;
  groessenarten?: Groessenart[];
  groessenFrist?: string;
  lieferadresse?: string;
  initialenNoetig?: boolean;
  sponsor?: string;
  hinweisHaendler?: string;
  artikel?: NeuerArtikel[];
  /** HubSpot-IDs der Personen, die zu diesem Vorgang gehören. */
  personen?: string[];
};

/** Die nächste freie Vorgangsnummer. `null` heißt: die Datenbank schweigt. */
export async function naechsteNummer(): Promise<string | null> {
  return rufe<string>("naechste_vorgangsnummer");
}

/**
 * Legt einen Vorgang mit Artikeln und Personen an.
 *
 * PostgREST kennt keine Transaktion über mehrere Aufrufe. Scheitert ein Kind,
 * wird der eben angelegte Vorgang wieder entfernt (die Fremdschlüssel räumen
 * den Rest) und `null` gemeldet – lieber gar kein Vorgang als ein halber, dem
 * die Hälfte der Artikel fehlt. Scheitert auch das Aufräumen, bleibt der
 * Vorgang stehen und ist in der Übersicht sichtbar; still verschwindet nichts.
 */
export async function legeVorgangAn(neu: NeuerVorgang): Promise<VorgangSatz | null> {
  const nummer = await naechsteNummer();
  if (!nummer) return null;

  const angelegt = await schreibe<VorgangRoh>("vorgang", {
    nummer,
    mannschaften: neu.mannschaften,
    mannschaftscode: neu.mannschaftscode ?? null,
    ausstattungsart: neu.ausstattungsart,
    stufe: neu.stufe,
    trainer_name: neu.trainerName ?? null,
    trainer_email: neu.trainerEmail ?? null,
    trainer_telefon: neu.trainerTelefon ?? null,
    personen_geschaetzt: neu.personenGeschaetzt ?? null,
    groessenarten: neu.groessenarten ?? [],
    groessen_frist: neu.groessenFrist || null,
    lieferadresse: neu.lieferadresse ?? null,
    initialen_noetig: neu.initialenNoetig ?? false,
    sponsor: neu.sponsor ?? null,
    hinweis_haendler: neu.hinweisHaendler ?? null,
  });

  const roh = angelegt?.[0];
  if (!roh) return null;

  const artikel = neu.artikel ?? [];
  if (artikel.length > 0) {
    const zeilen = await schreibe("vorgang_artikel", artikel.map((a, i) => zuArtikelZeile(a, roh.id, i)));
    if (zeilen === null) return await zuruecknehmen(roh.id);
  }

  const personen = neu.personen ?? [];
  if (personen.length > 0) {
    const zeilen = await schreibe(
      "vorgang_person",
      personen.map((kontaktId) => ({ vorgang_id: roh.id, hs_kontakt_id: kontaktId })),
      { ignoriereDoppelte: EINDEUTIG_PERSON },
    );
    if (zeilen === null) return await zuruecknehmen(roh.id);
  }

  return vollstaendig(roh.id);
}

function zuArtikelZeile(a: NeuerArtikel, vorgangId: string, index: number) {
  return {
    vorgang_id: vorgangId,
    reihenfolge: index,
    hersteller: a.hersteller ?? null,
    bezeichnung: a.bezeichnung,
    herstellernummer: a.herstellernummer ?? null,
    farbe: a.farbe ?? null,
    groessenart: a.groessenart,
    fuer: a.fuer ?? "alle",
    stueck: a.stueck,
    beflockung: a.beflockung ?? null,
    groesse_von: a.groesseVon ?? null,
    groesse_bis: a.groesseBis ?? null,
  };
}

/** Der halb angelegte Vorgang wird entfernt. Gibt immer `null` zurück. */
async function zuruecknehmen(id: string): Promise<null> {
  const weg = await loesche("vorgang", { id: `eq.${id}` });
  if (!weg) {
    console.error(`Vorgang ${id} blieb halb angelegt stehen: Aufräumen fehlgeschlagen`);
  }
  return null;
}

/** Der frisch angelegte Vorgang, diesmal mit seinen Kindern. */
async function vollstaendig(id: string): Promise<VorgangSatz | null> {
  const zeile = await leseEine<VorgangRoh>("vorgang", { select: MIT_KINDERN, id: `eq.${id}` });
  if (!zeile) return null;
  return ausVorgang(zeile) ?? null;
}

/* ------------------------------------------------------------------ *
 * Ändern
 * ------------------------------------------------------------------ */

/**
 * Die Stufe setzen. `abbruchBei` hält fest, wo der Vorgang stand – ein
 * abgebrochener Vorgang, dessen vorherige Stufe niemand mehr kennt, lässt sich
 * nicht wieder aufnehmen.
 */
export async function setzeStufe(
  vorgangId: string,
  stufe: StufeNr,
  abbruchBei?: StufeNr,
): Promise<boolean> {
  const werte: Record<string, unknown> = { stufe };
  if (abbruchBei !== undefined) werte.abbruch_bei = abbruchBei;
  const zeilen = await aendere("vorgang", { id: `eq.${vorgangId}` }, werte);
  return zeilen !== null && zeilen.length > 0;
}

/** Einzelne Felder des Vorgangs ändern, in Feldnamen dieser Schicht. */
export async function aendereVorgang(
  vorgangId: string,
  werte: Partial<{
    groessenFrist: string;
    stufeFrist: string;
    listeBestaetigtAm: string;
    lieferadresse: string;
    hinweisHaendler: string;
    initialenNoetig: boolean;
    sponsor: string;
    hsDealId: string;
  }>,
): Promise<boolean> {
  const zu: Record<string, unknown> = {};
  const namen: Record<keyof typeof werte, string> = {
    groessenFrist: "groessen_frist",
    stufeFrist: "stufe_frist",
    listeBestaetigtAm: "liste_bestaetigt_am",
    lieferadresse: "lieferadresse",
    hinweisHaendler: "hinweis_haendler",
    initialenNoetig: "initialen_noetig",
    sponsor: "sponsor",
    hsDealId: "hs_deal_id",
  };

  for (const [feld, inhalt] of Object.entries(werte)) {
    if (inhalt === undefined) continue;
    zu[namen[feld as keyof typeof werte]] = inhalt;
  }
  if (Object.keys(zu).length === 0) return true;

  const zeilen = await aendere("vorgang", { id: `eq.${vorgangId}` }, zu);
  return zeilen !== null && zeilen.length > 0;
}

/** Einen Artikel des Vorgangs nachbessern – das ist F1b (ergaenzen.ts). */
export async function aendereArtikel(
  artikelId: string,
  werte: Partial<{
    herstellernummer: string;
    farbe: string;
    fuer: ArtikelFuer;
    beflockung: string;
  }>,
): Promise<boolean> {
  const zu: Record<string, unknown> = {};
  if (werte.herstellernummer !== undefined) zu.herstellernummer = werte.herstellernummer || null;
  if (werte.farbe !== undefined) zu.farbe = werte.farbe || null;
  if (werte.fuer !== undefined) zu.fuer = werte.fuer;
  if (werte.beflockung !== undefined) zu.beflockung = werte.beflockung || null;
  if (Object.keys(zu).length === 0) return true;

  const zeilen = await aendere("vorgang_artikel", { id: `eq.${artikelId}` }, zu);
  return zeilen !== null && zeilen.length > 0;
}

/**
 * Mehrere Personen auf einmal an den Vorgang hängen. Das macht F1b, wenn aus
 * einer Voranfrage ein laufender Vorgang wird.
 */
export async function haengePersonenAn(vorgangId: string, kontaktIds: string[]): Promise<boolean> {
  if (kontaktIds.length === 0) return true;
  const zeilen = await schreibe(
    "vorgang_person",
    kontaktIds.map((kontaktId) => ({ vorgang_id: vorgangId, hs_kontakt_id: kontaktId })),
    { ignoriereDoppelte: EINDEUTIG_PERSON },
  );
  return zeilen !== null;
}

/**
 * Eine Person an den Vorgang hängen. Zweimal nachgetragen bleibt eine Person;
 * `true` heißt „gehört jetzt dazu“, nicht „war vorher nicht dabei“.
 */
export async function haengePersonAn(vorgangId: string, kontaktId: string): Promise<boolean> {
  const zeilen = await schreibe(
    "vorgang_person",
    { vorgang_id: vorgangId, hs_kontakt_id: kontaktId },
    { ignoriereDoppelte: EINDEUTIG_PERSON },
  );
  return zeilen !== null;
}

/** Was der Trainer je Person für diesen einen Vorgang festlegt. */
export async function setzePersonAngaben(
  vorgangId: string,
  kontaktId: string,
  angaben: Partial<{ ausgeschlossen: boolean; torwart: boolean; trikotnummer: string }>,
): Promise<boolean> {
  const zu: Record<string, unknown> = {};
  if (angaben.ausgeschlossen !== undefined) zu.ausgeschlossen = angaben.ausgeschlossen;
  if (angaben.torwart !== undefined) zu.torwart = angaben.torwart;
  if (angaben.trikotnummer !== undefined) zu.trikotnummer = angaben.trikotnummer || null;
  if (Object.keys(zu).length === 0) return true;

  const zeilen = await aendere(
    "vorgang_person",
    { vorgang_id: `eq.${vorgangId}`, hs_kontakt_id: `eq.${kontaktId}` },
    zu,
  );
  return zeilen !== null && zeilen.length > 0;
}

/* ------------------------------------------------------------------ *
 * Verlauf und Mailversand
 * ------------------------------------------------------------------ */

export type NeuesEreignis = {
  art: string;
  text: string;
  sub?: string;
  /** Nur für Trainer und Spartenleitung sichtbar. */
  intern?: boolean;
  /** Ab welcher Stufe der Eintrag im Verlauf auftaucht. */
  abStufe?: StufeNr;
};

/**
 * Einen Eintrag in den Verlauf schreiben.
 *
 * Bewusst ohne Rückgabe, die jemanden aufhält: ein fehlender Verlaufseintrag
 * darf nie ein Formular scheitern lassen. Er wird trotzdem gemeldet.
 */
export async function vermerke(vorgangId: string, ereignis: NeuesEreignis): Promise<void> {
  const zeilen = await schreibe("ereignis", {
    vorgang_id: vorgangId,
    art: ereignis.art,
    text: ereignis.text,
    sub: ereignis.sub ?? null,
    intern: ereignis.intern ?? false,
    ab_stufe: ereignis.abStufe ?? 0,
  });
  if (zeilen === null) console.error(`Verlaufseintrag „${ereignis.art}“ nicht geschrieben`);
}

export type EreignisSatz = {
  zeitpunkt: string;
  art: string;
  text: string;
  sub?: string;
  intern: boolean;
  abStufe: StufeNr;
};

export async function verlauf(vorgangId: string): Promise<EreignisSatz[] | null> {
  type Roh = {
    zeitpunkt: string;
    art: string;
    text: string;
    sub: string | null;
    intern: boolean;
    ab_stufe: number;
  };
  const zeilen = await lese<Roh>("ereignis", {
    vorgang_id: `eq.${vorgangId}`,
    order: "zeitpunkt.asc",
    limit: "500",
  });
  if (zeilen === null) return null;

  return zeilen.map((z) => ({
    zeitpunkt: z.zeitpunkt,
    art: z.art,
    text: z.text,
    sub: wert(z.sub),
    intern: z.intern,
    abStufe: alsStufe(z.ab_stufe) ?? 0,
  }));
}

/**
 * Dasselbe für den ganzen Kader auf einmal: je Person der Zeitpunkt der
 * letzten Mail dieser Art. Wer nicht in der Karte steht, hat noch keine.
 *
 * Ein Aufruf statt 26 – die Liste in der Mail-Karte zeigt neben jedem Namen,
 * ob er schon angeschrieben wurde.
 */
export async function mailsJePerson(
  vorgangId: string,
  art: string,
): Promise<Map<string, string> | null> {
  const zeilen = await lese<{ hs_kontakt_id: string | null; gesendet_am: string }>(
    "mail_versand",
    {
      select: "hs_kontakt_id,gesendet_am",
      vorgang_id: `eq.${vorgangId}`,
      art: `eq.${art}`,
      umgeleitet: "is.false",
      order: "gesendet_am.desc",
    },
  );
  if (zeilen === null) return null;

  const letzte = new Map<string, string>();
  // Absteigend sortiert: der erste Treffer je Person ist der jüngste.
  for (const z of zeilen) {
    if (z.hs_kontakt_id && !letzte.has(z.hs_kontakt_id)) {
      letzte.set(z.hs_kontakt_id, z.gesendet_am);
    }
  }
  return letzte;
}

/**
 * Was an eine Person in diesem Vorgang schon rausging – nur, was sie wirklich
 * erreicht hat. Eine von `MAIL_NUR_AN` umgeleitete Mail zählt nicht: sie lag in
 * Kais Postfach, nicht in ihrem.
 *
 * `null` heißt „konnte nicht fragen“. Der Erinnerungslauf darf das nicht als
 * „noch nichts verschickt“ lesen, sonst erinnert er zweimal am Tag.
 */
export async function mailsAn(
  vorgangId: string,
  art: string,
  kontaktId: string | null,
): Promise<string[] | null> {
  const zeilen = await lese<{ gesendet_am: string }>("mail_versand", {
    select: "gesendet_am",
    vorgang_id: `eq.${vorgangId}`,
    art: `eq.${art}`,
    hs_kontakt_id: kontaktId === null ? "is.null" : `eq.${kontaktId}`,
    umgeleitet: "is.false",
    order: "gesendet_am.desc",
    limit: "20",
  });
  if (zeilen === null) return null;
  return zeilen.map((z) => z.gesendet_am);
}

/** Hält fest, dass eine Mail rausging. `umgeleitet`: die Bremse war gesetzt. */
export async function vermerkeMail(
  vorgangId: string,
  art: string,
  kontaktId: string | null,
  umgeleitet = false,
): Promise<boolean> {
  const zeilen = await schreibe("mail_versand", {
    vorgang_id: vorgangId,
    art,
    hs_kontakt_id: kontaktId,
    umgeleitet,
  });
  return zeilen !== null;
}

/* ------------------------------------------------------------------ *
 * Löschen – nur für das Zurücknehmen oben und für Wegwerf-Vorgänge
 * ------------------------------------------------------------------ */

async function loesche(tabelle: string, suche: Record<string, string>): Promise<boolean> {
  const zeilen = await db<unknown[]>({ pfad: tabelle, methode: "DELETE", suche });
  return zeilen !== null;
}

/** Entfernt einen Vorgang samt Artikeln, Personen, Verlauf und Mailspuren. */
export async function loescheVorgang(vorgangId: string): Promise<boolean> {
  return loesche("vorgang", { id: `eq.${vorgangId}` });
}
