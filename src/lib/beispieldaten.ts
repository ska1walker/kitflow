/**
 * Beispieldaten der Statusseite.
 *
 * Namen, Termine und Betraege sind erfunden und in der Oberflaeche als
 * Beispieldaten gekennzeichnet. Die Artikel sind echt und stammen aus Kais
 * Anfrage (docs/datenmodell.md), ebenso die beiden Haendler.
 *
 * Namen von Kindern stehen bewusst nicht im Code (CLAUDE.md): beim
 * Jugendvorgang zeigt die Seite nur Zaehlstaende.
 */

import {
  IconRuler,
  IconSend,
  IconDokument,
  IconMuenzen,
  IconCheck,
  IconWarenkorb,
  IconLieferung,
  IconFahne,
} from "@/components/icons";
import type {
  Artikel,
  Ereignis,
  Haendler,
  Stufe,
  StufeNr,
  StufenText,
  VorgangsZeile,
} from "./typen";

export const VEREIN = { kuerzel: "EM", name: "Eintracht Munster · Fußball" };

export const VORGANG_NUMMER = "AUS-2026-014";
export const VORGANG_TITEL = "Herren Ü40 · Trikotsatz";
export const VORGANG_UNTERTITEL =
  "18 Personen · Sponsor VGH · Händler Intersport Uelzen und 11teamsports";
export const VORGANG_STAND = "Stand: heute, 07:30 Uhr";
export const SPIELER_GRUSS =
  "Hallo Jonas, hier siehst du, wo deine neue Ausstattung gerade steckt.";

/** Stufen der HubSpot-Pipeline „Ausstattung“ (docs/konzept.md). */
export const STUFEN: Stufe[] = [
  { nr: 1, intern: "Größen laufen", kurz: "Größen", titel: "Größen werden gesammelt", icon: IconRuler },
  { nr: 2, intern: "Anfrage raus", kurz: "Anfrage", titel: "Angebote angefragt", icon: IconSend },
  { nr: 3, intern: "Angebote da", kurz: "Angebote", titel: "Beide Angebote sind da", icon: IconDokument },
  { nr: 4, intern: "Finanzierung", kurz: "Finanzierung", titel: "Finanzierung läuft", icon: IconMuenzen },
  { nr: 5, intern: "Bestellbar", kurz: "Geld da", titel: "Das Geld ist da", icon: IconCheck },
  { nr: 6, intern: "Bestellt", kurz: "Bestellt", titel: "Bestellt", icon: IconWarenkorb },
  { nr: 7, intern: "Geliefert", kurz: "Geliefert", titel: "Geliefert", icon: IconLieferung },
  { nr: 8, intern: "Abgeschlossen", kurz: "Abgeschlossen", titel: "Abgeschlossen", icon: IconFahne },
  { nr: 9, intern: "Abgebrochen", kurz: "Abgebrochen", titel: "Abgebrochen", icon: IconFahne },
];

export function stufe(nr: StufeNr): Stufe {
  return STUFEN[nr - 1];
}

/** Die letzte Stufe der Schrittleiste. Stufe 9 liegt daneben. */
export const LETZTE_STUFE: StufeNr = 8;

export const GROESSEN_EINGETRAGEN = 14;
export const GROESSEN_GESAMT = 18;

/** Erwachsenen-Mannschaft, deshalb stehen hier Beispielnamen. */
export const FEHLENDE_GROESSEN = [
  "Oliver Brandt",
  "Kevin Stolte",
  "Timo Bartels",
  "Patrick Wulf",
];

/** Echte Artikel aus Kais Anfrage (docs/datenmodell.md). */
export const ARTIKEL: Artikel[] = [
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

/** Jede Anfrage geht an beide Händler (docs/konzept.md). */
export const HAENDLER: Haendler[] = [
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

/** Spieler-Ansicht: die eigenen Größen. Keine Beträge (docs/konzept.md). */
export const MEINE_AUSSTATTUNG = [
  { feld: "Trikot", wert: "L" },
  { feld: "Kurze Sporthose", wert: "L" },
  { feld: "Schuhgröße", wert: "43" },
  { feld: "Rückennummer", wert: "7" },
];

export const MEINE_AUSSTATTUNG_HINWEIS =
  "Trikot mit Vereinslogo, „EINTRACHT MUNSTER“ und deiner Nummer. Du zahlst nichts, der Sponsor VGH übernimmt.";

export const EREIGNISSE: Ereignis[] = [
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

export const STUFEN_TEXTE: Record<StufeNr, StufenText> = {
  1: {
    trainer: "14 von 18 haben ihre Größen eingetragen. Frist ist Montag, 08.09., 20 Uhr.",
    spieler:
      "Deine Größen sind drin. Bis zur Frist am Montag, 08.09., 20 Uhr, kannst du sie noch ändern.",
    naechsterTrainer: {
      wer: "Du",
      was: "Wenn alle drin sind, bekommst du die Liste zum Prüfen. Vier fehlen noch.",
      du: true,
    },
    naechsterSpieler: {
      wer: "Die Mannschaft",
      was: "Sobald alle ihre Größen eingetragen haben, prüft der Trainer die Liste.",
    },
  },
  2: {
    trainer: "Intersport Uelzen und 11teamsports haben die Liste seit 09.09.",
    spieler: "Die Liste ist bei zwei Händlern. Sie erstellen jetzt ihre Angebote.",
    naechsterTrainer: {
      wer: "Die Händler",
      was: "Sobald beide Angebote da sind, wählt die Spartenleitung aus, spätestens fünf Tage nach dem ersten.",
    },
    naechsterSpieler: { wer: "Die Händler", was: "Für dich gibt es gerade nichts zu tun." },
  },
  3: {
    trainer:
      "Beide Angebote sind da. Die Spartenleitung vergleicht Preis, Lieferzeit und Beflockung.",
    spieler: "Beide Angebote sind da. Die Spartenleitung entscheidet in den nächsten Tagen.",
    naechsterTrainer: {
      wer: "Spartenleitung",
      was: "wählt ein Angebot aus. Du bekommst danach eine Mail.",
    },
    naechsterSpieler: { wer: "Spartenleitung", was: "Für dich gibt es gerade nichts zu tun." },
  },
  4: {
    trainer:
      "11teamsports ist gewählt. Der Sponsor VGH hat zugesagt, das Geld ist aber noch nicht auf dem Vereinskonto.",
    spieler: "Ein Angebot ist gewählt. Jetzt kommt das Geld vom Sponsor.",
    naechsterTrainer: {
      wer: "Sponsor VGH",
      was: "überweist. Bestellt wird erst, wenn das Geld da ist. Eine Zusage allein reicht nicht.",
    },
    naechsterSpieler: { wer: "Sponsor", was: "Für dich gibt es gerade nichts zu tun." },
  },
  5: {
    trainer: "Das Geld ist da, die Deckungsprüfung ist erfüllt. Die Bestellung kann raus.",
    spieler: "Das Geld ist da, die Bestellung geht in Kürze raus.",
    naechsterTrainer: { wer: "Spartenleitung", was: "gibt die Bestellung frei." },
    naechsterSpieler: { wer: "Spartenleitung", was: "Für dich gibt es gerade nichts zu tun." },
  },
  6: {
    trainer: "Bestellt bei 11teamsports am 18.09. Liefertermin laut Händler: KW 41.",
    spieler: "Bestellt. Die Lieferung ist für KW 41 angekündigt.",
    naechsterTrainer: { wer: "11teamsports", was: "liefert beflockt an dich als Trainer." },
    naechsterSpieler: {
      wer: "Händler",
      was: "liefert an deinen Trainer. Er gibt die Sachen aus.",
    },
  },
  7: {
    trainer: "Geliefert am 07.10., 54 Teile. Bitte ausgeben und kurz bestätigen.",
    spieler: "Die Sachen sind beim Trainer. Er gibt sie beim nächsten Training aus.",
    naechsterTrainer: {
      wer: "Du",
      was: "gibst die Sachen aus und bestätigst es mit einem Klick.",
      du: true,
    },
    naechsterSpieler: { wer: "Trainer", was: "gibt die Sachen aus." },
  },
  8: {
    trainer:
      "Alles ausgegeben, die Rechnung ist bezahlt und gebucht. Die Größen sind für die nächste Runde gespeichert.",
    spieler: "Fertig. Deine Größen sind für die nächste Bestellung gespeichert.",
    naechsterTrainer: null,
    naechsterSpieler: null,
  },
  9: {
    trainer: "Dieser Vorgang wurde von der Spartenleitung abgebrochen. Es wurde nichts bestellt.",
    spieler: "Dieser Vorgang wurde abgebrochen. Es wurde nichts bestellt.",
    naechsterTrainer: null,
    naechsterSpieler: null,
  },
};

/**
 * Bei welcher Stufe der Beispiel-Abbruch passiert ist. Ein abgebrochener
 * Vorgang hat nie geliefert oder bezahlt, sein Verlauf endet hier.
 */
export const ABBRUCH_BEI: StufeNr = 4;

export const ABBRUCH_EREIGNIS: Ereignis = {
  ab: 9,
  datum: "15.09.",
  uhrzeit: "18:20",
  text: "Vorgang von der Spartenleitung abgebrochen",
  sub: "Sponsor hat abgesagt, kein Spartenbudget freigegeben",
};

/** Auf wen der gesteuerte Vorgang je Stufe wartet. */
const WARTET_AUF: Record<StufeNr, string> = {
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

/** Die uebrigen Vorgaenge der Sparte, fester Stand. Ohne Namen von Kindern. */
const WEITERE_VORGAENGE: VorgangsZeile[] = [
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
export function vorgaenge(aktuelleStufe: StufeNr): VorgangsZeile[] {
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
    ...WEITERE_VORGAENGE,
  ];
}
