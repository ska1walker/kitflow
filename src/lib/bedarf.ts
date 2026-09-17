import "server-only";

/**
 * F1 · Bedarf melden (docs/formulare.md).
 *
 * Legt aus der Meldung eines Trainers einen Vorgang an: Deal, Produkte für die
 * Artikel und je Artikel eine Position ohne Person.
 *
 * Die Positionen ohne `spieler_hsid` sind die Artikelliste des Vorgangs. F2
 * liest daraus, welche Größen zu fragen sind; F3 klappt sie später zu Person
 * mal Artikel auf. So bleibt alles in HubSpot sichtbar und bearbeitbar, statt
 * in einem Textfeld zu verschwinden.
 *
 * Wer gefragt wird, steht auf zwei Arten fest: eine **Mannschaft** (dann sucht
 * `kontakteDerMannschaft` ihre Kontakte) oder eine **einzelne Person** (dann
 * hat die Action sie ueber ihre E-Mail-Adresse gefunden und reicht sie herein).
 * Der zweite Weg ist fuer den Nachzuegler, der allein einen Trainingsanzug
 * braucht – ein Vorgang fuer 25 waere dafuer die falsche Form.
 *
 * Ein Vorgang kann auch gar nichts bestellen: bei der Ausstattungsart
 * `NUR_GROESSEN` haengt kein Artikel dran, und was gefragt wird, steht als
 * `groessenarten` am Deal. Das ist der Groessencheck vor der Saison – er endet
 * bei der bestaetigten Liste und geht an keinen Haendler.
 *
 * Zwei Modi (docs/konzept.md):
 *
 * - `vollstaendig` ist der alte Weg: alles auf einmal, Deal auf Stufe 1, die
 *   Kontakte der Mannschaft hängen dran, die Größenabfrage läuft sofort.
 * - `voranfrage` ist der einfache Weg: nur Artikelbezeichnung, Stück je Person
 *   und ein Größenbereich, dazu die geschätzte Personenzahl. Damit lässt sich
 *   ein Richtpreis für einen Sponsor holen, bevor überhaupt Größen gesammelt
 *   werden. Der Deal steht auf Stufe 0 und bekommt noch keine Kontakte: es gibt
 *   nichts zu fragen. Das holt F1b nach (src/lib/ergaenzen.ts).
 */

import {
  hubspot,
  hubspotAktiv,
  pipelineStufen,
  PIPELINE_NAME,
  type HsListe,
  type HsObjekt,
} from "./hubspot";
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

/**
 * Der Schluessel, unter dem ein Produkt wiedergefunden wird.
 *
 * Ohne Herstellernummer – im Modus `voranfrage` – waere `hs_sku` leer, und
 * jedes leere Feld wuerde auf jedes andere passen. Deshalb ein Platzhalter mit
 * der Vorgangsnummer darin: er kollidiert nie und ist als Platzhalter lesbar.
 * F1b ersetzt ihn spaeter durch die echte Nummer (src/lib/ergaenzen.ts).
 */
export function platzhalterSku(vorgang: string, index: number): string {
  return `VOR-${vorgang}-${index + 1}`;
}

/** Der Text, der als Standardbeflockung am Produkt steht. */
export function beflockungText(artikel: {
  beflockung: string;
  beflockungAbweichend: string;
}): string {
  if (artikel.beflockung === "Abweichend") return artikel.beflockungAbweichend;
  if (artikel.beflockung === "Ohne") return "ohne Beflockung";
  return "Standard";
}

/**
 * Ein Produkt zur Herstellernummer, sonst neu angelegt. Ein Produkt mit
 * Platzhalter-Nummer gilt als noch nicht fertig und steht auf `aktiv = false`;
 * Pruefung 1 vor der Anfrage verlangt ein aktives Produkt (docs/konzept.md).
 */
async function produktFinden(
  artikel: ArtikelEingabe,
  vorgang: string,
  index: number,
): Promise<string | null> {
  const echt = artikel.herstellernummer.trim();
  const sku = echt || platzhalterSku(vorgang, index);

  if (echt) {
    const treffer = await hubspot<HsListe<HsObjekt>>({
      pfad: "/crm/v3/objects/products/search",
      koerper: {
        filterGroups: [{ filters: [{ propertyName: "hs_sku", operator: "EQ", value: echt }] }],
        properties: ["hs_sku"],
        limit: 1,
      },
    });
    const vorhanden = treffer?.results[0];
    if (vorhanden) return vorhanden.id;
  }

  const angelegt = await hubspot<HsObjekt>({
    pfad: "/crm/v3/objects/products",
    koerper: {
      properties: {
        name: `${artikel.hersteller} ${artikel.bezeichnung}`.trim(),
        hs_sku: sku,
        hersteller: artikel.hersteller,
        farbe: artikel.farbe,
        groessenart: artikel.groessenart,
        fuer: artikel.fuer,
        beflockung_standard: beflockungText(artikel),
        aktiv: echt ? "true" : "false",
      },
    },
  });
  return angelegt?.id ?? null;
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

/** `false` heisst: HubSpot hat die Verknuepfung nicht bestaetigt. */
export async function verknuepfen(
  vonTyp: string,
  vonId: string,
  zuTyp: string,
  zuId: string,
): Promise<boolean> {
  const antwort = await hubspot({
    pfad: `/crm/v4/objects/${vonTyp}/${vonId}/associations/default/${zuTyp}/${zuId}`,
    methode: "PUT",
  });
  return antwort !== null;
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
  const stufe0 = pipeline?.stages.find((s) => s.label === "Voranfrage");
  const stufe1 = pipeline?.stages.find((s) => s.label === "Größen laufen");
  const stufe9 = pipeline?.stages.find((s) => s.label === "Abgebrochen");
  if (!pipeline || !stufe0 || !stufe1 || !stufe9) return null;

  const voranfrage = eingabe.modus === "voranfrage";
  const nummer = await naechsteNummer();

  // Im Modus `voranfrage` wird noch niemand gefragt, also auch niemand gesucht.
  // Die Kontakte holt F1b, wenn die Groessenabfrage wirklich startet.
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

  // Die Mannschaft am Deal entscheidet spaeter ueber `istJugend`: ohne sie
  // gaelte der Vorgang vorsichtshalber als Jugend, Groessen veralteten nach
  // vier statt zwoelf Monaten und die Seite nennt keine Namen. Bei einer
  // einzelnen Person steht deshalb deren eigene Mannschaft am Deal.
  const mannschaft = eingabe.person ? eingabe.person.team : eingabe.teams.join(";");

  const deal = await hubspot<HsObjekt>({
    pfad: "/crm/v3/objects/deals",
    koerper: {
      properties: {
        dealname: eingabe.person
          ? `${eingabe.person.name} · ${eingabe.ausstattungsart}`
          : `${eingabe.teams.join(", ")} · ${eingabe.ausstattungsart}`,
        pipeline: pipeline.id,
        // Ohne Spieler gibt es nichts anzufragen: der Vorgang endet sofort
        // (docs/formulare.md, M7). Eine Voranfrage lebt dagegen von der
        // geschaetzten Personenzahl und bricht hier nicht ab.
        dealstage: voranfrage ? stufe0.id : ohnePersonen ? stufe9.id : stufe1.id,
        vorgangsnummer: nummer,
        ausstattungsart: eingabe.ausstattungsart,
        mannschaft,
        mannschaftscode: eingabe.mannschaftscode,
        trainer_email: eingabe.email,
        personen_geschaetzt: voranfrage ? String(eingabe.personenZahl) : "",
        groessenarten: eingabe.groessenarten.join(";"),
        groessen_frist: eingabe.groessenFrist,
        lieferadresse: eingabe.lieferadresse,
        initialen_noetig: eingabe.initialenNoetig ? "true" : "false",
        hinweis_haendler: eingabe.hinweise,
      },
    },
  });
  if (!deal) return null;

  // Artikel als Positionen ohne Person: das ist die Artikelliste des Vorgangs.
  for (const [i, artikel] of eingabe.artikel.entries()) {
    const produktId = await produktFinden(artikel, nummer, i);
    if (!produktId) continue;

    const position = await hubspot<HsObjekt>({
      pfad: "/crm/v3/objects/line_items",
      koerper: {
        properties: {
          hs_product_id: produktId,
          quantity: String(artikel.stueck),
          sponsor: eingabe.sponsor,
          groesse_von: artikel.groesseVon,
          groesse_bis: artikel.groesseBis,
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
    trainerStatus: statusLink(nummer) ?? "",
    bestaetigen: voranfrage ? "" : (bestaetigenLink(nummer) ?? ""),
    ergaenzen: voranfrage ? (ergaenzenLink(nummer) ?? "") : "",
    personen: kontakte.map((k) => ({
      name: k.name,
      groessen: groessenLink(nummer, k.id) ?? "",
      status: statusLink(nummer, k.id) ?? "",
    })),
  };
}
