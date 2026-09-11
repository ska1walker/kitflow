/**
 * Beispieldaten der Statusseite.
 *
 * Sie greifen nur, solange HubSpot nicht angebunden ist. Namen, Termine und
 * Betraege sind erfunden und werden in der Oberflaeche gekennzeichnet. Die
 * Artikel und die beiden Haendler sind echt und stammen aus Kais Anfrage
 * (docs/datenmodell.md).
 *
 * Namen von Kindern stehen bewusst nicht im Code (CLAUDE.md): beim
 * Jugendvorgang zeigt die Seite nur Zaehlstaende.
 */

import type { Artikel, Ereignis, Haendler, StufeNr, Vorgang, VorgangsZeile } from "./typen";

export const VEREIN = { kuerzel: "EM", name: "Eintracht Munster · Fußball" };

export const VORGANG_NUMMER = "AUS-2026-014";

/** Echte Artikel aus Kais Anfrage (docs/datenmodell.md). */
const ARTIKEL: Artikel[] = [
  {
    name: "Hummel hmlCORE XK Poly T-Shirt Weiss F9001",
    herstellernummer: "211943",
    artikelnrElfteamsports: "102.053.402.247",
    groessenart: "trikot",
    fuer: "feldspieler",
  },
  {
    name: "Hummel hmlCORE XK Poly Short Weiss F9001",
    herstellernummer: "211466",
    artikelnrElfteamsports: "102.052.872.245",
    groessenart: "shorts",
    fuer: "feldspieler",
  },
  {
    name: "Hummel Pro Football Sock Socken F9124",
    herstellernummer: "201.160",
    artikelnrElfteamsports: "101.020.772.148",
    groessenart: "schuhe",
    fuer: "feldspieler",
  },
  {
    name: "adidas Tiro 24 Competition Torwarttrikot langarm Blau",
    herstellernummer: "IN0410",
    artikelnrElfteamsports: "10.276.017.216",
    groessenart: "trikot",
    fuer: "torwart",
  },
  {
    name: "adidas Tiro 24 Pro Torwartshort Blau",
    herstellernummer: "IN0452",
    artikelnrElfteamsports: "10.276.061.214",
    groessenart: "shorts",
    fuer: "torwart",
  },
  {
    name: "adidas Adisock 23 Strumpfstutzen Blau Weiss Grau",
    herstellernummer: "IB7795",
    artikelnrElfteamsports: "102.477.136.540",
    groessenart: "schuhe",
    fuer: "torwart",
  },
];

/** Jede Anfrage geht an beide Haendler (docs/konzept.md). */
const HAENDLER: Haendler[] = [
  {
    name: "11teamsports",
    ansprechpartner: "Michael Hillebrecht",
    angebotAm: "10.09.",
    gewaehlt: true,
  },
  {
    name: "Intersport Uelzen",
    ansprechpartner: "Jens Bormann",
    angebotAm: "12.09.",
    gewaehlt: false,
  },
];

const VERLAUF: Ereignis[] = [
  {
    ab: 1,
    datum: "01.09.",
    uhrzeit: "18:42",
    text: "Bedarf gemeldet",
    sub: "Trikotsatz für 18 Personen, Sponsor VGH",
  },
  {
    ab: 1,
    datum: "01.09.",
    uhrzeit: "18:44",
    text: "Größen-Links an 18 Personen verschickt",
    sub: "Frist: Mo 08.09., 20 Uhr",
  },
  {
    ab: 1,
    datum: "06.09.",
    uhrzeit: "10:00",
    text: "Erinnerung an 4 Personen verschickt",
    intern: true,
  },
  { ab: 2, datum: "08.09.", uhrzeit: "20:00", text: "Größen komplett: 18 von 18" },
  { ab: 2, datum: "09.09.", uhrzeit: "07:15", text: "Liste vom Trainer bestätigt" },
  {
    ab: 2,
    datum: "09.09.",
    uhrzeit: "07:16",
    text: "Anfrage an Intersport Uelzen und 11teamsports verschickt",
    sub: "54 Positionen, beide Händler beflocken selbst",
  },
  { ab: 3, datum: "10.09.", uhrzeit: "11:05", text: "Angebot von 11teamsports eingegangen" },
  { ab: 3, datum: "12.09.", uhrzeit: "09:30", text: "Angebot von Intersport Uelzen eingegangen" },
  { ab: 4, datum: "13.09.", uhrzeit: "19:10", text: "Angebot von 11teamsports gewählt" },
  {
    ab: 4,
    datum: "13.09.",
    uhrzeit: "19:12",
    text: "Sponsor VGH um Zahlung gebeten",
    intern: true,
  },
  {
    ab: 5,
    datum: "18.09.",
    uhrzeit: "08:30",
    text: "Geld vom Sponsor ist auf dem Vereinskonto",
    sub: "Deckungsprüfung erfüllt",
  },
  {
    ab: 6,
    datum: "18.09.",
    uhrzeit: "12:05",
    text: "Bestellung an 11teamsports verschickt",
    sub: "Liefertermin laut Händler: KW 41",
  },
  {
    ab: 7,
    datum: "07.10.",
    uhrzeit: "15:20",
    text: "Lieferung beim Trainer angekommen",
    sub: "54 Teile, beflockt",
  },
  { ab: 8, datum: "09.10.", uhrzeit: "19:45", text: "An die Mannschaft ausgegeben" },
  {
    ab: 8,
    datum: "10.10.",
    uhrzeit: "09:00",
    text: "Rechnung bezahlt und gebucht",
    intern: true,
  },
];

/** Der Eintrag, mit dem ein abgebrochener Vorgang schliesst. */
export const ABBRUCH_EREIGNIS: Ereignis = {
  ab: 9,
  datum: "15.09.",
  uhrzeit: "18:20",
  text: "Vorgang von der Spartenleitung abgebrochen",
  sub: "Sponsor hat abgesagt, kein Spartenbudget freigegeben",
};

/** Erwachsenen-Mannschaft, deshalb stehen hier Beispielnamen. */
const FEHLENDE_GROESSEN = ["Oliver Brandt", "Kevin Stolte", "Timo Bartels", "Patrick Wulf"];

export const BEISPIEL_VORGANG: Vorgang = {
  nummer: VORGANG_NUMMER,
  titel: "Herren Ü40 · Trikotsatz",
  untertitel: "18 Personen · Sponsor VGH · Händler Intersport Uelzen und 11teamsports",
  stufe: 2,
  abbruchBei: 4,
  stand: "Stand: heute, 07:30 Uhr",
  sponsor: "VGH",
  finanzierungZugesagt: true,
  geldEingangAm: "18.09.",
  groessenEingetragen: 14,
  groessenGesamt: 18,
  groessenBestaetigtAm: "09.09.",
  fehlendeGroessen: FEHLENDE_GROESSEN,
  beflockung: "Standard auf den Trikots",
  feldspielerAnzahl: 17,
  torwartAnzahl: 1,
  haendler: HAENDLER,
  artikel: ARTIKEL,
  verlauf: VERLAUF,
  meineAusstattung: [
    { feld: "Trikot", wert: "L" },
    { feld: "Kurze Sporthose", wert: "L" },
    { feld: "Schuhgröße", wert: "43" },
    { feld: "Rückennummer", wert: "7" },
  ],
  meinHinweis:
    "Trikot mit Vereinslogo, „EINTRACHT MUNSTER“ und deiner Nummer. Du zahlst nichts, der Sponsor VGH übernimmt.",
  spielerGruss: "Hallo Jonas, hier siehst du, wo deine neue Ausstattung gerade steckt.",
  quelle: "beispiel",
};

/** Auf wen der Beispiel-Vorgang je Stufe wartet. */
const WARTET_AUF: Record<StufeNr, string> = {
  0: "Sponsor",
  1: "Mannschaft",
  2: "Händler",
  3: "dich",
  4: "Sponsor VGH",
  5: "dich",
  6: "11teamsports",
  7: "Trainer",
  8: "–",
  9: "–",
};

/** Die uebrigen Vorgaenge der Sparte. Ohne Namen von Kindern. */
const WEITERE_ZEILEN: VorgangsZeile[] = [
  {
    nummer: "AUS-2026-012",
    mannschaft: "JG 2014/2015",
    gegenstand: "Trainingsanzüge · 16 Personen",
    stufe: 1,
    wartetAuf: "Eltern · 9 von 16",
    seit: "3 Tage",
    frist: "Frist Fr 12.09.",
  },
  {
    nummer: "AUS-2026-011",
    mannschaft: "Damen",
    gegenstand: "Aufwärmshirts · 15 Personen",
    stufe: 4,
    wartetAuf: "Mannschaftsanteil",
    seit: "12 Tage",
    warnung: "seit 12 Tagen offen",
  },
  {
    nummer: "AUS-2026-009",
    mannschaft: "JG 2012",
    gegenstand: "Trikotsatz · 14 Personen",
    stufe: 6,
    wartetAuf: "Intersport Uelzen",
    seit: "9 Tage",
    frist: "Lieferung KW 39",
  },
];

/** Der erste Vorgang folgt dem Regler, damit Uebersicht und Detail zusammenpassen. */
export function beispielZeilen(aktuelleStufe: StufeNr): VorgangsZeile[] {
  return [
    {
      nummer: VORGANG_NUMMER,
      mannschaft: "Herren Ü40",
      gegenstand: "Trikotsatz · 18 Personen",
      stufe: aktuelleStufe,
      wartetAuf: WARTET_AUF[aktuelleStufe],
      seit: "heute",
      du: aktuelleStufe === 3 || aktuelleStufe === 5,
      verlinkt: true,
    },
    ...WEITERE_ZEILEN,
  ];
}
