/**
 * Typen der Statusseite.
 *
 * Ein Ausstattungs-Vorgang laeuft durch die Stufen aus docs/konzept.md. Die
 * Daten kommen spaeter aus HubSpot (Deal = Vorgang, Positionen = Person x
 * Artikel, Kontakte = Groessen); vorerst aus src/lib/beispieldaten.ts.
 */

import type { ComponentType, SVGProps } from "react";

/**
 * Stufe 1 bis 8 ist der normale Weg, 9 ist der Abbruch. Die Schrittleiste
 * zeigt nur 1 bis 8; ein abgebrochener Vorgang bekommt eine eigene Anzeige.
 *
 * Stufe 0 (Voranfrage) liegt davor: der Trainer hat grob gemeldet, um ein
 * Richtangebot fuer den Sponsor zu bekommen. Sie ist bewusst die Null und
 * nicht eine neue Eins, damit die Nummern 1 bis 9 in Code und Papieren
 * bleiben, wo sie sind (docs/konzept.md).
 */
export type StufeNr = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** Die Stufen, die der Regler im Entwurf durchspielt. */
export const STUFEN_NRN: StufeNr[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Wer die Seite gerade sieht. Rollen nach docs/konzept.md. */
export type Ansicht = "trainer" | "spieler" | "sparte";

export type Stufe = {
  nr: StufeNr;
  /** Interner Name der HubSpot-Pipeline. */
  intern: string;
  /** Kurzlabel unter der Schrittleiste. */
  kurz: string;
  /** Was auf der Statusseite steht. */
  titel: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

/**
 * Verlaufseintrag. `ab` ist die Stufe, ab der er sichtbar wird. `intern`
 * blendet ihn fuer Spieler aus: Erinnerungen, Sponsor-Mahnung und Buchung
 * sehen nur Trainer und Spartenleitung (docs/konzept.md).
 */
export type Ereignis = {
  ab: StufeNr;
  datum: string;
  uhrzeit: string;
  text: string;
  sub?: string;
  intern?: boolean;
};

/** Wer als Naechstes am Zug ist. `du` heisst: die eigene Rolle wartet. */
export type NaechsterSchritt = {
  wer: string;
  was: string;
  du?: boolean;
};

export type StufenText = {
  trainer: string;
  spieler: string;
  naechsterTrainer: NaechsterSchritt | null;
  naechsterSpieler: NaechsterSchritt | null;
};

/** Groessenart nach docs/datenmodell.md. */
export type Groessenart = "trikot" | "oberteil" | "shorts" | "trainingshose" | "schuhe" | "ohne";

/** Fuer wen ein Artikel gedacht ist. */
export type ArtikelFuer = "alle" | "feldspieler" | "torwart";

/** Artikel aus dem Produktstamm. Nie erfinden, nur echte Daten. */
export type Artikel = {
  name: string;
  /** hs_sku, die Herstellernummer. */
  herstellernummer: string;
  artikelnrElfteamsports?: string;
  artikelnrIntersport?: string;
  groessenart: Groessenart;
  fuer: ArtikelFuer;
  /** Nur in der Voranfrage: der grobe Bereich statt einzelner Größen. */
  groesseVon?: string;
  groesseBis?: string;
};

export type Haendler = {
  name: string;
  ansprechpartner: string;
  /** Datum, an dem das Angebot eingegangen ist. */
  angebotAm: string;
  gewaehlt: boolean;
};

/** Zeile in der Uebersicht der Spartenleitung. */
export type VorgangsZeile = {
  nummer: string;
  mannschaft: string;
  gegenstand: string;
  stufe: StufeNr;
  wartetAuf: string;
  seit: string;
  frist?: string;
  warnung?: string;
  /** Die Spartenleitung selbst ist am Zug. */
  du?: boolean;
  /** Im Entwurf ist nur der gesteuerte Vorgang anklickbar. */
  verlinkt?: boolean;
};

/** Wer die Groesse einer Person haelt. Ohne Kontaktdaten, ohne Betraege. */
export type PersonGroesse = {
  feld: string;
  wert: string;
};

/**
 * Ein vollstaendiger Vorgang, so wie die Statusseite ihn braucht.
 *
 * Zusammengesetzt aus HubSpot: Deal, Positionen und Kontakte. `quelle` sagt,
 * ob echte Daten oder Beispieldaten angezeigt werden – die Oberflaeche muss
 * Beispieldaten kennzeichnen (CLAUDE.md).
 */
export type Vorgang = {
  nummer: string;
  titel: string;
  untertitel: string;
  stufe: StufeNr;
  /** Bei Stufe 9: die Stufe, die der Vorgang vor dem Abbruch erreicht hatte. */
  abbruchBei?: StufeNr;
  stand: string;

  sponsor?: string;
  finanzierungZugesagt: boolean;
  geldEingangAm?: string;

  /** Nur in der Voranfrage (Stufe 0): die Schätzung des Trainers. */
  personenGeschaetzt?: number;

  groessenEingetragen: number;
  groessenGesamt: number;
  groessenBestaetigtAm?: string;
  /** Nur Erwachsene namentlich; bei Jugend bleibt die Liste leer. */
  fehlendeGroessen: string[];

  beflockung?: string;
  feldspielerAnzahl: number;
  torwartAnzahl: number;

  haendler: Haendler[];
  artikel: Artikel[];
  verlauf: Ereignis[];

  /** Die Ausstattung der Person, die den Link geoeffnet hat. */
  meineAusstattung: PersonGroesse[];
  meinHinweis: string;
  spielerGruss: string;

  quelle: "hubspot" | "beispiel";
};

/* ------------------------------------------------------------------ *
 * Initialen (docs/datenmodell.md)
 * ------------------------------------------------------------------ */

/**
 * Beides kommt aus der HubSpot-Eigenschaft `initialen` selbst, nicht aus einer
 * Annahme: sie laesst hoechstens drei Zeichen zu und weist Sonderzeichen ab
 * („Enter 3 characters or fewer“ / „Enter only numbers and letters“). Wer hier
 * grosszuegiger prueft, bekommt die Ablehnung erst von HubSpot – und der
 * Spieler sieht dann „hat nicht geklappt“ statt zu erfahren, was falsch ist.
 * Aendert sich die Regel in HubSpot, gehoeren diese beiden Zeilen nachgezogen.
 */
export const INITIALEN_MAX = 3;

/** Buchstaben, Ziffern und Leerzeichen – „KB“, „KAB“, „K B“. Umlaute gehen. */
const INITIALEN_MUSTER = /^[A-Za-zÄÖÜäöüß0-9 ]+$/;

/**
 * Prueft Initialen und gibt sie normiert zurueck, sonst eine Meldung im
 * Klartext. Normiert heisst: Rand getrimmt, Doppelleerzeichen zusammengezogen.
 */
export function pruefeInitialen(roh: string): { wert: string } | { fehler: string } {
  const wert = roh.trim().replace(/\s+/g, " ");
  if (!wert) return { fehler: "Bitte die Initialen eintragen." };
  if (wert.length > INITIALEN_MAX) {
    return { fehler: `Höchstens ${INITIALEN_MAX} Zeichen – so viel passt auf den Aufdruck.` };
  }
  if (!INITIALEN_MUSTER.test(wert)) {
    return { fehler: "Erlaubt sind nur Buchstaben und Ziffern, keine Sonderzeichen." };
  }
  return { wert };
}
