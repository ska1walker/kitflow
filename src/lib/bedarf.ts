import "server-only";

/**
 * F1 · Bedarf melden (docs/formulare.md).
 *
 * Legt aus der Meldung eines Trainers einen Vorgang an — seit dem Umzug in der
 * eigenen Datenbank (docs/datenbank.md). Die Artikel sind Zeilen am Vorgang;
 * ein Produktstamm mit Platzhalter-Nummern wird dafuer nicht mehr gebraucht.
 *
 * Wer gefragt wird, steht auf zwei Arten fest: eine **Mannschaft** (dann sucht
 * `kontakteDerMannschaft` ihre Kontakte in HubSpot) oder eine **einzelne
 * Person** (dann hat die Action sie ueber ihre E-Mail-Adresse gefunden). Der
 * zweite Weg ist fuer den Nachzuegler, der allein einen Trainingsanzug braucht
 * – ein Vorgang fuer 25 waere dafuer die falsche Form.
 *
 * Ein Vorgang kann auch gar nichts bestellen: bei der Ausstattungsart
 * `NUR_GROESSEN` haengt kein Artikel dran, und was gefragt wird, steht als
 * `groessenarten` am Vorgang. Das ist der Groessencheck vor der Saison – er
 * endet bei der bestaetigten Liste und geht an keinen Haendler.
 *
 * Zwei Modi (docs/konzept.md):
 *
 * - `vollstaendig` ist der alte Weg: alles auf einmal, Vorgang auf Stufe 1,
 *   die Kontakte der Mannschaft haengen dran, die Groessenabfrage laeuft sofort.
 * - `voranfrage` ist der einfache Weg: nur Artikelbezeichnung, Stueck je Person
 *   und ein Groessenbereich, dazu die geschaetzte Personenzahl. Damit laesst
 *   sich ein Richtpreis fuer einen Sponsor holen, bevor ueberhaupt Groessen
 *   gesammelt werden. Der Vorgang steht auf Stufe 0 und bekommt noch keine
 *   Personen: es gibt nichts zu fragen. Das holt F1b nach (ergaenzen.ts).
 */

import { hubspot, type HsListe, type HsObjekt } from "./hubspot";
import { legeVorgangAn, vermerke, type NeuerArtikel } from "./vorgaenge-db";
import { spiegele, spiegelePersonen } from "./spiegel";
import { groessenLink, statusLink, bestaetigenLink, ergaenzenLink } from "./links";
import { NUR_GROESSEN, TEAMS } from "./mannschaften";
import type { ArtikelFuer, Groessenart } from "./typen";

/** Welcher der beiden Wege von F1 gegangen wird. */
export type Modus = "voranfrage" | "vollstaendig";

export type ArtikelEingabe = {
  hersteller: string;
  bezeichnung: string;
  /** Leer im Modus `voranfrage`: die Nummer kennt der Trainer oft noch nicht. */
  herstellernummer: string;
  farbe: string;
  groessenart: Groessenart;
  /** Stück je Person, in beiden Modi. */
  stueck: number;
  fuer: ArtikelFuer;
  beflockung: string;
  beflockungAbweichend: string;
  /** Nur im Modus `voranfrage`: der Größenbereich statt einzelner Größen. */
  groesseVon: string;
  groesseBis: string;
};

export type BedarfEingabe = {
  modus: Modus;
  vorname: string;
  nachname: string;
  email: string;
  telefon: string;
  teams: string[];
  /**
   * Gesetzt, wenn der Vorgang genau einer Person gilt. Dann wird `teams` nicht
   * gelesen: gefragt wird nur diese eine, egal wer sonst in ihrer Mannschaft
   * spielt.
   */
  person?: Empfaenger;
  mannschaftscode: string;
  ausstattungsart: string;
  artikel: ArtikelEingabe[];
  /**
   * Nur bei `NUR_GROESSEN` gefuellt: welche Groessen gefragt werden. Sonst
   * sagen das die Artikel, und diese Liste bleibt leer.
   */
  groessenarten: Groessenart[];
  /** Geschätzte Kadergröße, nur im Modus `voranfrage`. */
  personenZahl: number;
  groessenFrist: string;
  lieferadresse: string;
  /** Werden Initialen aufgedruckt? Schaltet die Abfrage in F2 frei. */
  initialenNoetig: boolean;
  sponsor: string;
  hinweise: string;
};

export type PersonLink = { name: string; groessen: string; status: string };

export type BedarfErgebnis = {
  vorgang: string;
  modus: Modus;
  /** Der Vorgang bestellt nichts, er sammelt nur Groessen ein. */
  nurGroessen: boolean;
  /** Leer, wenn zur Mannschaft niemand gefunden wurde oder noch keiner gesucht. */
  personen: PersonLink[];
  trainerStatus: string;
  bestaetigen: string;
  /** Nur im Modus `voranfrage` gefüllt: der Weg zu den fehlenden Angaben. */
  ergaenzen: string;
  /** Kein Kontakt mit dieser Mannschaft: der Vorgang steht auf Abgebrochen. */
  ohnePersonen: boolean;
  /** Adresse, an die M1 ging. Leer heisst: es wurde keine Mail verschickt. */
  mailAn?: string;
  /** Die Artikel für die Mail: Name und eine Zeile Einzelheiten. */
  artikelText: { name: string; detail: string }[];
};

/** Nur die Werte, die HubSpot kennt. Alles andere waere ein Tippfehler. */
export function gueltigeTeams(werte: string[]): string[] {
  return werte.filter((w) => TEAMS.includes(w));
}

/** Der Text, der als Standardbeflockung am Artikel steht. */
export function beflockungText(artikel: {
  beflockung: string;
  beflockungAbweichend: string;
}): string {
  if (artikel.beflockung === "Abweichend") return artikel.beflockungAbweichend;
  if (artikel.beflockung === "Ohne") return "ohne Beflockung";
  return "Standard";
}

/** Eine Person eines Vorgangs, auf das Noetigste gekuerzt. */
export type Empfaenger = { id: string; name: string; team: string };

function alsEmpfaenger(k: HsObjekt): Empfaenger {
  const name = `${k.properties.firstname ?? ""} ${k.properties.lastname ?? ""}`.trim();
  return { id: k.id, name: name || `Kontakt ${k.id}`, team: k.properties.team ?? "" };
}

/**
 * Der Kontakt zu einer E-Mail-Adresse, sonst `null`.
 *
 * Gesucht wird ueber die Adresse und nicht ueber den Namen, weil F1 als
 * einzige Seite ohne Token offen steht (docs/formulare.md). Eine Namenssuche
 * waere dort ein Mitgliederverzeichnis fuer jeden, der die Seite kennt; ein
 * Treffer auf die genaue Adresse verraet nur dem etwas, der sie schon hat.
 */
export async function kontaktPerEmail(email: string): Promise<Empfaenger | null> {
  const adresse = email.trim().toLowerCase();
  if (!adresse) return null;

  const treffer = await hubspot<HsListe<HsObjekt>>({
    pfad: "/crm/v3/objects/contacts/search",
    koerper: {
      filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: adresse }] }],
      properties: ["firstname", "lastname", "team"],
      limit: 1,
    },
  });
  const kontakt = treffer?.results[0];
  return kontakt ? alsEmpfaenger(kontakt) : null;
}

/**
 * Die Kontakte, deren `team` eine der gewaehlten Mannschaften ist.
 *
 * `null` heisst „konnte nicht fragen", eine leere Liste heisst „da ist
 * wirklich niemand". Der Unterschied ist wichtig: wer beides gleich behandelt,
 * bricht bei einem Rate-Limit einen Vorgang ab und schreibt dem Trainer, seine
 * Mannschaft stehe nicht in HubSpot.
 */
export async function kontakteDerMannschaft(teams: string[]): Promise<HsObjekt[] | null> {
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
  return treffer ? treffer.results : null;
}

/**
 * Legt den Vorgang an. `null` heisst: die Datenbank war nicht erreichbar oder
 * die Kontaktsuche ist gescheitert – dann ist nichts entstanden, was
 * aufgeraeumt werden muesste.
 */
export async function meldeBedarf(eingabe: BedarfEingabe): Promise<BedarfErgebnis | null> {
  const voranfrage = eingabe.modus === "voranfrage";

  // Im Modus `voranfrage` wird noch niemand gefragt, also auch niemand gesucht.
  // Die Personen holt F1b, wenn die Groessenabfrage wirklich startet.
  //
  // Gilt der Vorgang einer einzelnen Person, steht sie schon fest: die Action
  // hat sie ueber ihre Adresse gefunden. Dann wird nicht nach Mannschaft
  // gesucht, sonst haenge der halbe Kader mit dran.
  let kontakte: Empfaenger[] = [];
  if (!voranfrage) {
    if (eingabe.person) {
      kontakte = [eingabe.person];
    } else {
      const gefunden = await kontakteDerMannschaft(eingabe.teams);
      // Scheitert die Suche, entsteht hier nichts. Frueher wurde daraus eine
      // leere Liste, der Vorgang landete sofort auf Stufe 9 und der Trainer
      // las, zu seiner Mannschaft sei niemand hinterlegt – bei einem
      // Rate-Limit schlicht gelogen, und er haette die Geschaeftsstelle
      // angerufen. Lieber gar kein Vorgang als ein falsch abgebrochener.
      if (gefunden === null) return null;
      kontakte = gefunden.map(alsEmpfaenger);
    }
  }
  const ohnePersonen = !voranfrage && kontakte.length === 0;

  // Die Mannschaft am Vorgang entscheidet spaeter ueber `istJugend`: ohne sie
  // gaelte er vorsichtshalber als Jugend, Groessen veralteten nach vier statt
  // zwoelf Monaten und die Seite nennt keine Namen. Bei einer einzelnen Person
  // steht deshalb deren eigene Mannschaft am Vorgang.
  const mannschaften = eingabe.person
    ? eingabe.person.team.split(";").map((w) => w.trim()).filter(Boolean)
    : eingabe.teams;

  const artikel: NeuerArtikel[] = eingabe.artikel.map((a) => ({
    hersteller: a.hersteller,
    bezeichnung: a.bezeichnung,
    herstellernummer: a.herstellernummer.trim() || undefined,
    farbe: a.farbe || undefined,
    groessenart: a.groessenart,
    fuer: a.fuer,
    stueck: a.stueck,
    beflockung: beflockungText(a),
    groesseVon: a.groesseVon || undefined,
    groesseBis: a.groesseBis || undefined,
  }));

  const satz = await legeVorgangAn({
    mannschaften,
    mannschaftscode: eingabe.mannschaftscode || undefined,
    ausstattungsart: eingabe.ausstattungsart,
    // Ohne Personen gibt es nichts anzufragen: der Vorgang endet sofort
    // (docs/formulare.md, M7). Eine Voranfrage lebt dagegen von der
    // geschaetzten Personenzahl und bricht hier nicht ab.
    stufe: voranfrage ? 0 : ohnePersonen ? 9 : 1,
    trainerName: `${eingabe.vorname} ${eingabe.nachname}`.trim() || undefined,
    trainerEmail: eingabe.email || undefined,
    trainerTelefon: eingabe.telefon || undefined,
    personenGeschaetzt: voranfrage ? eingabe.personenZahl : undefined,
    groessenarten: eingabe.groessenarten,
    groessenFrist: eingabe.groessenFrist,
    lieferadresse: eingabe.lieferadresse || undefined,
    initialenNoetig: eingabe.initialenNoetig,
    sponsor: eingabe.sponsor || undefined,
    hinweisHaendler: eingabe.hinweise || undefined,
    artikel,
    personen: kontakte.map((k) => k.id),
  });
  if (!satz) return null;

  await vermerke(satz.id, {
    art: "angelegt",
    text: voranfrage ? "Voranfrage gemeldet" : "Vorgang gemeldet",
    sub: eingabe.email || undefined,
    abStufe: 0,
  });

  // Der Spiegel ist Sicht, keine Wahrheit: scheitert er, bleibt der Vorgang
  // gueltig und es steht im Verlauf (spiegel.ts).
  if (await spiegele(satz)) await spiegelePersonen({ ...satz, hsDealId: satz.hsDealId });

  return {
    vorgang: satz.nummer,
    modus: eingabe.modus,
    nurGroessen: eingabe.ausstattungsart === NUR_GROESSEN,
    ohnePersonen,
    artikelText: eingabe.artikel.map((a) => ({
      name: [a.hersteller, a.bezeichnung].filter(Boolean).join(" "),
      detail: [
        `${a.stueck} Stück je Person`,
        a.groesseVon && a.groesseBis ? `Größen ${a.groesseVon} bis ${a.groesseBis}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    })),
    trainerStatus: statusLink(satz.nummer) ?? "",
    bestaetigen: voranfrage ? "" : (bestaetigenLink(satz.nummer) ?? ""),
    ergaenzen: voranfrage ? (ergaenzenLink(satz.nummer) ?? "") : "",
    personen: kontakte.map((k) => ({
      name: k.name,
      groessen: groessenLink(satz.nummer, k.id) ?? "",
      status: statusLink(satz.nummer, k.id) ?? "",
    })),
  };
}
