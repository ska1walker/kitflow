import "server-only";

/**
 * Laedt Vorgaenge aus der eigenen Datenbank.
 *
 * Bis zum Umzug war HubSpot die einzige Datenbasis. Jetzt gilt der Schnitt aus
 * docs/datenbank.md:
 *
 *   Datenbank -> der Vorgang: Stufe, Artikel, Fristen, wer dazugehoert, wer
 *                ausgeschlossen ist, wer im Tor steht, Rueckennummern, Verlauf
 *   HubSpot   -> die Person: Name, Mitgliedschaft, Groessen, Initialen
 *
 * Gerechnet wird in `ansicht.ts`, geholt wird hier. Der Deal im CRM ist nur
 * noch ein Spiegel (`spiegel.ts`) und wird nie zurueckgelesen.
 *
 * `null` und `gestoert` heissen weiterhin „konnte nicht fragen“ und nie „gibt
 * es nicht“. Der Unterschied hat kitflow dreimal wehgetan.
 */

import { batchLesen, hubspot, text, type HsObjekt } from "./hubspot";
import {
  GROESSEN_FELD,
  GROESSEN_FELDER,
  GROESSEN_LABEL,
  groessenWerte,
  istVeraltet,
} from "./groessen";
import {
  artikelVon,
  ausgeschlossene,
  ausstattungVon,
  gefragteArten,
  haendler,
  istJugend,
  mannschaftsName,
  nurGroessen,
  pruefungen,
  rollen,
  torwarte,
  trikotnummer,
  verlauf as verlaufAus,
} from "./ansicht";
import {
  aendereVorgang,
  haengePersonAn,
  setzePersonAngaben,
  setzeFreigabe,
  setzeStufe,
  verlauf as verlaufLesen,
  mailsJePerson,
  vermerke,
  vermerkeMail,
  vorgangPerNummer,
  type Abruf,
  type VorgangSatz,
} from "./vorgaenge-db";
import { spiegele, spiegelePersonen } from "./spiegel";
import { anfrageHaendler, haendlerAktiv } from "./haendler-adressen";
import { alsCsv, baueAnfrage, summenText } from "./anfrage";
import { freigabeWeg, freigeberName, ruftZurFreigabe, type Freigeber } from "./freigabe";
import { freigabeUmfang } from "./uebersicht";
import { absolut, mailAktiv, sendeM2a, sendeM4, sendeM4b, sendeM5 } from "./mail";
import { kontakteDerMannschaft } from "./bedarf";
import { bestaetigenLink, groessenLink, statusLink, trainerLink } from "./links";
import type { Pruefung } from "./pruefungen";
import { pruefeInitialen } from "./typen";
import type { Groessenart, StufeNr, Vorgang } from "./typen";

/** Kontakt-Eigenschaften: Name, Mannschaft und die Groessen aus docs/datenmodell.md. */
const KONTAKT_FELDER = [
  "firstname",
  "lastname",
  "team",
  "email",
  "initialen",
  "groesse_zuletzt_bestaetigt_am",
  ...GROESSEN_FELDER,
];

const BERLIN = "Europe/Berlin";

/** Zeitstempel in deutscher Ortszeit. */
function standText(wert: string | undefined): string {
  const zeitpunkt = wert ? new Date(wert) : new Date();
  if (Number.isNaN(zeitpunkt.getTime())) return "";

  const datum = new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(zeitpunkt);
  const uhr = new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN,
    hour: "2-digit",
    minute: "2-digit",
  }).format(zeitpunkt);

  return `Stand: ${datum}, ${uhr} Uhr`;
}

/** Hat der Kontakt eine Groesse hinterlegt? */
export function hatGroesse(kontakt: HsObjekt): boolean {
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
 * Die Kontakte eines Vorgangs, ohne die Ausgeschlossenen.
 *
 * `null` heisst: HubSpot hat nicht geantwortet. Das muss unterscheidbar
 * bleiben — sonst zeigt die Seite „0 von 0 eingetragen“, wo in Wahrheit 26
 * Leute warten.
 */
export async function kontakteVon(satz: VorgangSatz): Promise<HsObjekt[] | null> {
  const raus = ausgeschlossene(satz);
  const ids = satz.personen.map((p) => p.kontaktId).filter((id) => !raus.has(id));
  if (ids.length === 0) return [];

  const kontakte = await batchLesen("contacts", ids, KONTAKT_FELDER);
  return kontakte.length === 0 ? null : kontakte;
}

/**
 * Streicht aus einem Vorgang alles, was ein Spieler nicht sehen darf, bevor er
 * an den Browser geht (docs/formulare.md: „keine anderen Namen“).
 */
export function fuerSpieler(vorgang: Vorgang): Vorgang {
  return {
    ...vorgang,
    fehlendeGroessen: [],
    verlauf: vorgang.verlauf.filter((e) => !e.intern),
  };
}

/* ------------------------------------------------------------------ *
 * Statusseite
 * ------------------------------------------------------------------ */

export type VorgangsErgebnis =
  | { stand: "da"; vorgang: Vorgang }
  /** Den Vorgang gibt es nicht, oder die Nummer passt nicht zum Link. */
  | { stand: "unbekannt" }
  /** Die Datenbank antwortet nicht. Das hat nichts mit dem Link zu tun. */
  | { stand: "gestoert" };

export async function ladeVorgang(
  nummer?: string,
  personId?: string,
): Promise<VorgangsErgebnis> {
  if (!nummer) return { stand: "unbekannt" };

  const ergebnis = await vorgangPerNummer(nummer);
  if (ergebnis.stand !== "da") return ergebnis;
  const satz = ergebnis.vorgang;

  const kontakte = await kontakteVon(satz);
  if (kontakte === null) return { stand: "gestoert" };

  // Der Verlauf ist Beiwerk: fehlt er, steht die Seite trotzdem richtig da.
  const ereignisse = (await verlaufLesen(satz.id)) ?? [];

  const mitGroesse = kontakte.filter(hatGroesse);
  const jugend = istJugend(satz);
  const ich = personId ? kontakte.find((k) => k.id === personId) : undefined;

  // Was der Vorgang kostet, sagt das gewaehlte Angebot. Frueher stand dafuer
  // `amount` am Deal, das nie jemand gesetzt hat.
  const betrag =
    satz.lieferantGewaehlt === "11teamsports"
      ? satz.angebote.elfteamsports.betrag
      : satz.lieferantGewaehlt === "Intersport Uelzen"
        ? satz.angebote.intersport.betrag
        : undefined;
  const gedeckt =
    betrag !== undefined &&
    betrag > 0 &&
    ((satz.finanzen.eingangVerein ?? 0) + (satz.finanzen.spartenbudgetFreigegeben ?? 0) >= betrag ||
      (satz.finanzen.vorkasseBestaetigt ?? 0) >= betrag);

  const bestaetigt = kontakte
    .map((k) => text(k, "groesse_zuletzt_bestaetigt_am"))
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);

  const zahl = rollen(satz);

  const vorgang: Vorgang = {
    nummer: satz.nummer,
    titel: `${satz.mannschaften.join(", ") || "Mannschaft"} · ${satz.ausstattungsart}`,
    untertitel: [
      // In der Voranfrage haengt noch niemand am Vorgang; dann zaehlt die
      // Schaetzung des Trainers, ausdruecklich als solche gekennzeichnet.
      kontakte.length > 0
        ? `${kontakte.length} ${kontakte.length === 1 ? "Person" : "Personen"}`
        : satz.personenGeschaetzt
          ? `geschätzt ${satz.personenGeschaetzt} ${satz.personenGeschaetzt === 1 ? "Person" : "Personen"}`
          : undefined,
      satz.sponsor ? `Sponsor ${satz.sponsor}` : undefined,
      satz.lieferantGewaehlt,
    ]
      .filter(Boolean)
      .join(" · "),
    stufe: satz.stufe,
    abbruchBei: satz.abbruchBei,
    stand: standText(satz.aktualisiertAm),

    sponsor: satz.sponsor,
    finanzierungZugesagt: (satz.finanzen.zusageSponsor ?? 0) > 0,
    geldEingangAm: gedeckt ? kurz(satz.finanzen.eingangAm) : undefined,

    personenGeschaetzt: satz.personenGeschaetzt,

    groessenEingetragen: mitGroesse.length,
    groessenGesamt: kontakte.length,
    groessenBestaetigtAm: kurz(bestaetigt),
    // Bei Jugendmannschaften nennt die Seite keine Namen (CLAUDE.md).
    fehlendeGroessen: jugend ? [] : kontakte.filter((k) => !hatGroesse(k)).map(personName),

    beflockung: satz.artikel.map((a) => a.beflockung).find(Boolean),
    feldspielerAnzahl: zahl.feldspieler,
    torwartAnzahl: zahl.torwart,

    nurGroessen: nurGroessen(satz),
    haendler: haendler(satz),
    artikel: artikelVon(satz),
    verlauf: verlaufAus(satz, ereignisse),

    meineAusstattung: ausstattungVon(satz, ich),
    meinHinweis: personId
      ? "Du zahlst nichts vorab. Was offen ist, klärt dein Trainer."
      : "Deine persönlichen Größen erscheinen hier, sobald du über deinen eigenen Link kommst.",
    spielerGruss: "Hier siehst du, wo die neue Ausstattung gerade steckt.",

  };

  return { stand: "da", vorgang };
}

/** „2026-09-30“ wird zu „30.09.“. */
function kurz(wert: string | undefined): string | undefined {
  if (!wert) return undefined;
  const treffer = /^(\d{4})-(\d{2})-(\d{2})/.exec(wert);
  return treffer ? `${treffer[3]}.${treffer[2]}.` : undefined;
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
  /** Vorbelegung. Leer, wenn die hinterlegte Groesse als veraltet gilt. */
  wert: string;
  /** Was am Kontakt steht, auch wenn es veraltet ist. */
  bisher: string;
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
  bestaetigtAm?: string;
  initialenNoetig: boolean;
  nurGroessen: boolean;
  initialen: string;
  /** Eingetragen wird nur auf Stufe 1. */
  offen: boolean;
};

/**
 * Alles, was die Groessenabfrage einer Person braucht.
 *
 * `unbekannt` heisst: gibt es nicht oder gehoert nicht zusammen — die Seite
 * antwortet darauf genau wie auf ein falsches Token, damit sich ueber die
 * Antwort nichts erraten laesst. `gestoert` heisst: wir konnten nicht fragen.
 */
export async function ladeGroessenAbfrage(
  nummer: string,
  personId: string,
  alsTrainer = false,
): Promise<Abruf<GroessenAbfrage>> {
  const ergebnis = await vorgangPerNummer(nummer);
  if (ergebnis.stand !== "da") return ergebnis;
  const satz = ergebnis.vorgang;

  // Der Token bindet die Person schon an den Vorgang. Die Zugehoerigkeit wird
  // trotzdem geprueft: wer inzwischen raus ist, soll mit einem alten Link
  // nichts mehr eintragen.
  const dabei = satz.personen.find((p) => p.kontaktId === personId);
  if (!dabei) return { stand: "unbekannt" };
  // Wer ausgeschlossen ist, traegt selbst nichts mehr ein. Der Trainer schon:
  // er muss den Ausschluss zuruecknehmen koennen.
  if (!alsTrainer && dabei.ausgeschlossen) return { stand: "unbekannt" };

  const kontakte = await batchLesen("contacts", [personId], KONTAKT_FELDER);
  const kontakt = kontakte[0];
  // Die Person haengt am Vorgang, HubSpot gibt sie aber nicht heraus. Das ist
  // kein toter Link, sondern ein Ausfall: `batchLesen` liefert auch bei einem
  // Fehler eine leere Liste.
  if (!kontakt) return { stand: "gestoert" };

  const jugend = istJugend(satz);
  const veraltet = istVeraltet(text(kontakt, "groesse_zuletzt_bestaetigt_am"), jugend);

  const fragen: GroessenFrage[] = gefragteArten(satz).map((art) => {
    const feld = GROESSEN_FELD[art];
    const wert = feld ? (text(kontakt, feld) ?? "") : "";
    return {
      art,
      label: GROESSEN_LABEL[art],
      feld: feld ?? art,
      werte: groessenWerte(art),
      // Vorbelegt wird nur, was frisch genug ist: eine alte Groesse soll nicht
      // mit einem Klick ungeprueft bestaetigt werden. Gezeigt wird sie
      // trotzdem – „nicht vorauswaehlen“ heisst nicht „verschweigen“.
      wert: veraltet ? "" : wert,
      bisher: wert,
      veraltet: veraltet && wert !== "",
    };
  });

  const daten: GroessenAbfrage = {
    vorgang: satz.nummer,
    person: personId,
    anrede: text(kontakt, "firstname") ?? "",
    mannschaft: satz.mannschaften.join(", ") || (satz.mannschaftscode ?? ""),
    gegenstand: satz.ausstattungsart,
    frist: kurz(satz.groessenFrist),
    jugend,
    fragen,
    bestaetigtAm: kurz(text(kontakt, "groesse_zuletzt_bestaetigt_am")),
    // Die Initialen haengen nicht an einer Groessenart: eine Person hat genau
    // ein Paar, egal wie viele Artikel beflockt werden.
    initialenNoetig: satz.initialenNoetig,
    nurGroessen: nurGroessen(satz),
    initialen: text(kontakt, "initialen") ?? "",
    offen: satz.stufe === 1,
  };
  return { stand: "da", daten };
}

/**
 * Schreibt die Groessen einer Person und setzt das Bestaetigungsdatum.
 *
 * Groessen gehoeren der Person und bleiben in HubSpot. Geschrieben wird nur,
 * was zu diesem Vorgang gehoert und vorher als Frage rausging – ein Formular
 * laesst sich nachbauen.
 */
export async function speichereGroessen(
  abfrage: GroessenAbfrage,
  eingaben: Record<string, string>,
): Promise<{ ok: true } | { ok: false; fehler?: string }> {
  const werte: Record<string, string> = {};

  for (const frage of abfrage.fragen) {
    const wert = eingaben[frage.feld];
    if (!wert) continue;
    if (!frage.werte.includes(wert)) return { ok: false };
    werte[frage.feld] = wert;
  }

  if (Object.keys(werte).length === 0) return { ok: false };

  // Initialen nur, wenn dieser Vorgang sie ueberhaupt aufdruckt. Sonst war das
  // Feld gar nicht im Formular und wird auch nicht uebernommen.
  if (abfrage.initialenNoetig) {
    const geprueft = pruefeInitialen(eingaben.initialen ?? "");
    if ("fehler" in geprueft) return { ok: false, fehler: geprueft.fehler };
    werte.initialen = geprueft.wert;
  }

  werte.groesse_zuletzt_bestaetigt_am = new Date().toISOString().slice(0, 10);

  const antwort = await hubspot<HsObjekt>({
    pfad: `/crm/v3/objects/contacts/${encodeURIComponent(abfrage.person)}`,
    methode: "PATCH",
    koerper: { properties: werte },
  });

  return antwort !== null ? { ok: true } : { ok: false };
}

/* ------------------------------------------------------------------ *
 * F3 · Liste bestaetigen (docs/formulare.md)
 * ------------------------------------------------------------------ */

/** Eine Zeile der Liste: eine Person mit ihren Groessen. */
export type ListenZeile = {
  person: string;
  name: string;
  /** Groesse je Groessenart, leer wenn nicht eingetragen. */
  groessen: { art: Groessenart; label: string; wert: string }[];
  nummer: string;
  /** Leer, wenn der Vorgang keine Initialen braucht oder noch keine da sind. */
  initialen: string;
  veraltet: boolean;
  torwart: boolean;
  /** Der signierte Link, mit dem der Trainer diese Zeile aendert. */
  aendern: string;
};

export type Liste = {
  vorgang: string;
  mannschaft: string;
  gegenstand: string;
  trikotsatz: boolean;
  /** Der Vorgang bestellt nichts: keine Haendlerfelder, keine Artikelpruefungen. */
  nurGroessen: boolean;
  jugend: boolean;
  /** Steuert die Initialen-Spalte: ohne das Haekchen in F1 gibt es sie nicht. */
  initialenNoetig: boolean;
  lieferadresse: string;
  hinweisHaendler: string;
  bestaetigtAm?: string;
  arten: { art: Groessenart; label: string }[];
  zeilen: ListenZeile[];
  pruefungen: Pruefung[];
  /** Bestaetigt wird nur auf Stufe 1. */
  offen: boolean;
};

/**
 * Die Liste, die der Trainer prueft, samt der sechs Pruefungen.
 *
 * Bei Jugendmannschaften stehen hier Namen: der Trainer muss wissen, wessen
 * Groesse fehlt. Diese Seite haengt an seinem eigenen signierten Link.
 */
export async function ladeListe(nummer: string): Promise<Abruf<Liste>> {
  const ergebnis = await vorgangPerNummer(nummer);
  if (ergebnis.stand !== "da") return ergebnis;
  const satz = ergebnis.vorgang;

  const kontakte = await kontakteVon(satz);
  if (kontakte === null) return { stand: "gestoert" };

  const jugend = istJugend(satz);
  const imTor = torwarte(satz);
  const arten = gefragteArten(satz).map((art) => ({ art, label: GROESSEN_LABEL[art] }));

  const zeilen: ListenZeile[] = kontakte.map((k) => ({
    person: k.id,
    name: personName(k),
    groessen: arten.map(({ art, label }) => {
      const feld = GROESSEN_FELD[art];
      return { art, label, wert: (feld ? text(k, feld) : undefined) ?? "" };
    }),
    nummer: trikotnummer(satz, k.id),
    initialen: satz.initialenNoetig ? (text(k, "initialen") ?? "") : "",
    veraltet: istVeraltet(text(k, "groesse_zuletzt_bestaetigt_am"), jugend),
    torwart: imTor.has(k.id),
    aendern: trainerLink(satz.nummer, k.id) ?? "",
  }));

  const daten: Liste = {
    vorgang: satz.nummer,
    mannschaft: satz.mannschaften.join(", ") || (satz.mannschaftscode ?? ""),
    gegenstand: satz.ausstattungsart,
    trikotsatz: satz.ausstattungsart === "Trikotsatz",
    nurGroessen: nurGroessen(satz),
    jugend,
    initialenNoetig: satz.initialenNoetig,
    lieferadresse: satz.lieferadresse ?? "",
    hinweisHaendler: satz.hinweisHaendler ?? "",
    bestaetigtAm: kurz(satz.listeBestaetigtAm),
    arten,
    zeilen,
    pruefungen: pruefungen(satz, zeilen),
    offen: satz.stufe === 1,
  };
  return { stand: "da", daten };
}

/** Die Art in `mail_versand` fuer die Haendleranfrage. Eine je Haendler. */
export const MAIL_ANFRAGE = "anfrage";

/** Der Beflockungsstandard des Vereins, wie er in M4 steht (docs/mails.md). */
const BEFLOCKUNG = [
  "Vereinslogo vorne, Brust links, ca. 8 cm breit, Transferdruck mehrfarbig",
  "„EINTRACHT MUNSTER“ hinten oben mittig, Blockschrift, ca. 5 cm hoch, Flexdruck",
  "Rückennummer hinten darunter, 20 cm bei Erwachsenengrößen, 15 cm bei Kindergrößen 116–164, Flexdruck",
  "Farbe weiß, auf hellen Artikeln schwarz",
  "Hosen, Shorts und Stutzen ohne Beflockung",
  "Torwartartikel wie Trikots, Nummer laut Tabelle",
];

/**
 * Wie die Bestaetigung ausging — genau eines von fuenf, nie zwei davon.
 *
 * Vorher waren es drei Flaggen nebeneinander (`anHaendler`, `ohneHaendler`,
 * `wartetAufFreigabe`). Die beschreiben ein und denselben Ausgang, lassen aber
 * acht Kombinationen zu, von denen vier unsinnig sind, und zwangen jeden
 * Aufrufer, den Ausgang aus den Flaggen wieder zusammenzusetzen. Als Union
 * steht er einmal da und die Oberflaeche liest ihn in einem `switch`.
 */
export type BestaetigungsErgebnis =
  | { ok: false }
  /** Reiner Groessencheck: es gibt nichts zu bestellen, der Vorgang ist fertig. */
  | { ok: true; wie: "fertig" }
  /** Kein Haendler hinterlegt – es gibt nichts freizugeben. */
  | { ok: true; wie: "ohne_haendler" }
  /** Keine einzige Groesse eingetragen – ein Haendler haette nichts zu bepreisen. */
  | { ok: true; wie: "ohne_zeilen" }
  /** Die Anfrage liegt jetzt bei der Spartenleitung. */
  | { ok: true; wie: "wartet" }
  /** Eine Regel hat sofort freigegeben, die Anfrage ging raus. */
  | { ok: true; wie: "raus"; anHaendler: number };

/**
 * Nimmt die Bestaetigung des Trainers entgegen und beantragt die Freigabe.
 *
 * **Hier geht nichts mehr nach draussen.** Bis zum 18.09.2026 loeste diese
 * Funktion M4 unmittelbar aus. Das war falsch herum: M4 geht an zwei echte
 * Geschaeftspartner und ist nicht zurueckzuholen, und ein Trainer sollte sie
 * nicht allein ausloesen koennen. Kais Ansage: die Spartenleitung genehmigt.
 * Der Versand steht jetzt in `gibFrei`.
 *
 * **Die Bestaetigung gilt trotzdem sofort.** Der Trainer hat seinen Teil getan;
 * ihn scheitern zu lassen, weil noch jemand zustimmen muss, waere falsch. Sein
 * Datum, seine Lieferadresse und sein Hinweis stehen am Vorgang, und die
 * Freigabe wartet daneben.
 */
export async function bestaetigeListe(
  nummer: string,
  lieferadresse: string,
  hinweis: string,
): Promise<BestaetigungsErgebnis> {
  const ergebnis = await vorgangPerNummer(nummer);
  if (ergebnis.stand !== "da") return { ok: false };
  const satz = ergebnis.vorgang;

  const ok = await aendereVorgang(satz.id, {
    listeBestaetigtAm: new Date().toISOString().slice(0, 10),
    ...(lieferadresse ? { lieferadresse } : {}),
    ...(hinweis ? { hinweisHaendler: hinweis } : {}),
  });
  if (!ok) return { ok: false };

  await vermerke(satz.id, {
    art: "liste_bestaetigt",
    text: "Der Trainer hat die Liste bestätigt",
    abStufe: 1,
  });

  // Ein reiner Groessencheck geht an keinen Haendler: es gibt nichts zu
  // bestellen. Er endet mit der Bestaetigung, und das ist richtig so.
  if (nurGroessen(satz)) return { ok: true, wie: "fertig" };

  // Ohne hinterlegte Haendler gibt es nichts freizugeben. Das jetzt schon zu
  // sagen ist ehrlicher, als eine Freigabe zu erbitten, die ins Leere liefe.
  if (!haendlerAktiv()) {
    await vermerke(satz.id, { art: "anfrage_offen", text: OHNE_HAENDLER, intern: true, abStufe: 1 });
    return { ok: true, wie: "ohne_haendler" };
  }

  // Und ohne eine einzige Groesse gibt es ebenso wenig freizugeben. Die
  // Pruefungen auf der Seite halten die Bestaetigung ausdruecklich nicht auf
  // („Offene Pruefungen halten die Bestaetigung nicht auf“), ein Trainer kann
  // also eine Liste bestaetigen, in der niemand etwas eingetragen hat. Ohne
  // diese Frage waere die Folge: Telegram meldet sich, die Karte erscheint auf
  // /sparte, und der Klick darauf scheitert — eine Freigabe, die von Anfang an
  // nicht gelingen konnte.
  if (await ohneZeilen(satz)) {
    await vermerke(satz.id, {
      art: "anfrage_offen",
      text: "Anfrage nicht möglich: keine einzige Größe eingetragen",
      intern: true,
      abStufe: 1,
    });
    return { ok: true, wie: "ohne_zeilen" };
  }

  return beantrageFreigabe(satz);
}

/**
 * Haette die Anfrage ueberhaupt eine Zeile?
 *
 * Kostet einen Griff nach der Liste (und damit nach HubSpot). Das ist der Preis
 * dafuer, es **vor** der Freigabe zu wissen statt danach: eine Aufgabe in
 * Todoist, die niemand erledigen kann, ist teurer als eine Abfrage.
 *
 * Eine Stoerung heisst hier ausdruecklich **nicht** „keine Zeilen“: kommt die
 * Liste nicht, wird die Freigabe ganz normal erbeten, und `verschickeAnfrage`
 * prueft spaeter noch einmal. Aus „konnte nicht fragen“ ein „gibt es nicht“ zu
 * machen ist genau der Fehler, der kitflow schon dreimal wehgetan hat.
 */
async function ohneZeilen(satz: VorgangSatz): Promise<boolean> {
  const abruf = await ladeListe(satz.nummer);
  if (abruf.stand !== "da") return false;
  return baueAnfrage(abruf.daten, satz.artikel).zeilen.length === 0;
}

/**
 * Der eine Satz fuer „kein Haendler hinterlegt“.
 *
 * Er stand zweimal im Code, in zwei Fassungen („nicht vorbereitet“ und „nicht
 * verschickt“) — wer spaeter nach `anfrage_offen` sucht, fand zwei Schreiber
 * und konnte nicht sagen, welcher gefeuert hat.
 */
const OHNE_HAENDLER = "Anfrage nicht möglich: kein Händler hinterlegt (HAENDLER)";

/**
 * Stellt den Vorgang auf „Freigabe offen“ und ruft die Spartenleitung.
 *
 * **Die Naht fuer die spaetere Automatik** (Kai, 18.09.2026): sagt
 * `freigabeWeg()` eine Regel, gibt diese Funktion sofort frei, statt zu fragen.
 * Heute sagt sie nie eine — der Mensch entscheidet, und das steht so im Code
 * und nicht in einem Kommentar.
 */
async function beantrageFreigabe(satz: VorgangSatz): Promise<BestaetigungsErgebnis> {
  const gesetzt = await setzeFreigabe(satz.id, "offen");
  if (!gesetzt) return { ok: false };

  await vermerke(satz.id, {
    art: "freigabe_offen",
    text: "Die Händleranfrage wartet auf die Freigabe der Spartenleitung",
    intern: true,
    abStufe: 1,
  });

  // Laeuft es automatisch, ist der Antrag im selben Atemzug erledigt.
  const regel = freigabeWeg();
  if (regel) {
    const frei = await gibFrei(satz.nummer, regel);
    return frei.ok ? { ok: true, wie: "raus", anHaendler: frei.anHaendler } : { ok: false };
  }

  // Dieselben Zahlen, die auch auf der Karte in /sparte stehen — die Nachricht
  // ist die Benachrichtigung ueber die Karte, sie duerfen nie auseinanderlaufen.
  await ruftZurFreigabe(satz.id, { ...freigabeUmfang(satz), link: absolut("/sparte") ?? "" });
  return { ok: true, wie: "wartet" };
}

/**
 * Wie die Entscheidung ausging.
 *
 * Als Union und nicht als Beutel mit `ok`/`anHaendler`/`ohneHaendler`/`grund`:
 * dort waren auf jedem Zweig drei der vier Felder bedeutungslos, `ohneHaendler`
 * sagte dasselbe wie `grund === "ohne_haendler"`, und `grund` war ein freier
 * String — die Oberflaeche konnte einen Grund uebersehen, ohne dass es auffiel.
 * Genau das war passiert: fuer `"versand"` gab es keinen Text.
 *
 * Dieselbe Form wie `Abruf` in `vorgaenge-db.ts` und `VersandErgebnis` weiter
 * unten in dieser Datei.
 */
export type FreigabeGrund =
  | "gestoert"
  | "unbekannt"
  | "nicht_offen"
  | "ohne_haendler"
  /** Keine einzige Groesse — die Anfrage haette ein leeres Blatt geschickt. */
  | "ohne_zeilen"
  | "versand";

export type FreigabeErgebnis =
  | { ok: true; anHaendler: number }
  | { ok: false; grund: FreigabeGrund };

/**
 * Der Vorgang zu einer Nummer, sofern seine Freigabe wirklich aussteht.
 *
 * Freigeben und Ablehnen sind zwei Entscheidungen mit derselben Vorbedingung.
 * Sie stand vorher zweimal wortgleich da; eine fuenfte Bedingung haette an
 * beiden Tueren nachgezogen werden muessen.
 */
async function offeneFreigabeZu(
  nummer: string,
): Promise<{ satz: VorgangSatz } | { grund: FreigabeGrund }> {
  const ergebnis = await vorgangPerNummer(nummer);
  if (ergebnis.stand === "gestoert") return { grund: "gestoert" };
  if (ergebnis.stand !== "da") return { grund: "unbekannt" };

  // Nur was wirklich offen ist. Sonst gingen zwei Klicks auf denselben Vorgang
  // als zwei Anfragen an die Haendler raus – und die zweite waere nicht zu
  // erklaeren.
  if (ergebnis.vorgang.freigabe.stand !== "offen") return { grund: "nicht_offen" };
  return { satz: ergebnis.vorgang };
}

/**
 * Gibt die Anfrage frei und schickt sie raus.
 *
 * Erst jetzt geht M4 an die Haendler und M5 an den Trainer. Der Stand wandert
 * nur dann auf `freigegeben`, wenn wirklich etwas rausging: eine Freigabe, nach
 * der nichts passiert ist, waere schlimmer als gar keine, weil niemand mehr
 * hinsieht.
 */
export async function gibFrei(nummer: string, wer: Freigeber): Promise<FreigabeErgebnis> {
  const zugriff = await offeneFreigabeZu(nummer);
  if ("grund" in zugriff) return { ok: false, grund: zugriff.grund };
  const satz = zugriff.satz;

  // Die Haendler koennen zwischen Bestaetigung und Freigabe weggefallen sein.
  // Hier gefragt statt aus „nichts verschickt“ erschlossen: der Grund steht am
  // Entscheidungspunkt, nicht als Ausnahme am Ende.
  if (!haendlerAktiv()) {
    await vermerke(satz.id, {
      art: "freigabe_ohne_versand",
      text: OHNE_HAENDLER,
      sub: freigeberName(wer),
      intern: true,
      abStufe: 1,
    });
    return { ok: false, grund: "ohne_haendler" };
  }

  const versand = await verschickeAnfrage(satz);

  if (versand.stand !== "raus") {
    await vermerke(satz.id, {
      art: "freigabe_ohne_versand",
      text:
        versand.stand === "leer"
          ? "Freigabe erteilt, aber die Anfrage hatte keine einzige Zeile"
          : "Freigabe erteilt, aber die Anfrage ging nicht raus",
      sub: freigeberName(wer),
      intern: true,
      abStufe: 1,
    });
    return { ok: false, grund: versand.stand === "leer" ? "ohne_zeilen" : "versand" };
  }

  await setzeFreigabe(satz.id, "freigegeben", freigeberName(wer));
  await vermerke(satz.id, {
    art: "freigabe_erteilt",
    text:
      wer.art === "mensch"
        ? "Die Spartenleitung hat die Händleranfrage freigegeben"
        : "Die Händleranfrage lief automatisch durch",
    sub: freigeberName(wer),
    intern: true,
    abStufe: 1,
  });

  return { ok: true, anHaendler: versand.anzahl };
}

/**
 * Lehnt die Anfrage ab, mit Grund.
 *
 * Der Grund ist Pflicht und kein Beiwerk: ohne ihn bliebe der Vorgang stumm
 * liegen und der Trainer wuesste nicht, was er aendern soll. Er geht deshalb
 * auch per Mail an ihn.
 */
export async function lehneAb(
  nummer: string,
  wer: Freigeber,
  grund: string,
): Promise<FreigabeErgebnis> {
  const zugriff = await offeneFreigabeZu(nummer);
  if ("grund" in zugriff) return { ok: false, grund: zugriff.grund };
  const satz = zugriff.satz;

  const gesetzt = await setzeFreigabe(satz.id, "abgelehnt", freigeberName(wer), grund);
  if (!gesetzt) return { ok: false, grund: "versand" };

  await vermerke(satz.id, {
    art: "freigabe_abgelehnt",
    text: `Die Händleranfrage wurde nicht freigegeben: ${grund}`,
    sub: freigeberName(wer),
    intern: true,
    abStufe: 1,
  });

  // Der Trainer erfaehrt es. Ohne diese Mail steht er vor einer bestaetigten
  // Liste, bei der nichts passiert – und das sieht aus wie ein Fehler.
  if (satz.trainerEmail && mailAktiv()) {
    const liste = absolut(bestaetigenLink(satz.nummer) ?? "");
    await sendeM4b(satz.trainerEmail, {
      vorgang: satz.nummer,
      mannschaft: mannschaftsName(satz, "deine Mannschaft"),
      grund,
      listeLink: liste ?? "",
    });
  }

  return { ok: true, anHaendler: 0 };
}

/**
 * Schickt M4 an jeden hinterlegten Haendler und M5 an den Trainer.
 *
 * Getrennt von `bestaetigeListe`, weil hier alles passiert, was nach draussen
 * geht — und weil sich das so einzeln pruefen laesst.
 */
type AnfrageVersand =
  | { stand: "raus"; anzahl: number }
  /** Es gab nichts anzufragen – kein Fehler, aber auch kein Versand. */
  | { stand: "leer" }
  | { stand: "fehlgeschlagen" };

async function verschickeAnfrage(satz: VorgangSatz): Promise<AnfrageVersand> {
  const empfaenger = anfrageHaendler();
  if (empfaenger.length === 0 || !mailAktiv()) return { stand: "fehlgeschlagen" };

  const abruf = await ladeListe(satz.nummer);
  if (abruf.stand !== "da") return { stand: "fehlgeschlagen" };
  const liste = abruf.daten;

  const anfrage = baueAnfrage(liste, satz.artikel);
  // Ohne eine einzige Zeile gibt es nichts anzufragen. `bestaetigeListe` fragt
  // das schon vorher, damit gar keine Freigabe erbeten wird; hier steht es
  // zweitens, weil zwischen Bestaetigung und Freigabe Zeit vergeht — und weil
  // ein leeres Blatt an einen Haendler nicht passieren darf.
  if (anfrage.zeilen.length === 0) return { stand: "leer" };

  const csv = alsCsv(anfrage, liste.trikotsatz, liste.initialenNoetig);
  const antwortAn = process.env.MAIL_ANTWORT || "kai.boehm@eintrachtmunster.de";

  // Nacheinander und nicht parallel: Resend laesst im Standard zwei Anfragen je
  // Sekunde durch. Mit zwei Haendlern plus M5 in derselben Anfrage liegt
  // paralleler Versand genau auf der Kante, und ein 429 hiesse hier, dass ein
  // Haendler still nichts bekommt.
  let verschickt = 0;
  const umgeleitet: boolean[] = [];
  for (const h of empfaenger) {
    const ging = await sendeM4(h.email, {
      vorgang: satz.nummer,
      anrede: h.anrede,
      mannschaft: liste.mannschaft,
      summen: summenText(anfrage),
      gesamtStueck: anfrage.gesamtStueck,
      beflockung: BEFLOCKUNG,
      wunschtermin: satz.stufeFrist ?? "",
      lieferadresse: satz.lieferadresse ?? "",
      hinweisHaendler: satz.hinweisHaendler ?? "",
      trainerEmail: satz.trainerEmail ?? "",
      antwortAn,
      csv,
      // Nur hier. M1, M2, M3 und M5 bleiben ohne Wappen — die gehen an Leute,
      // die den Verein kennen (Kais Schnitt vom 20.09.2026).
      wappen: satz.wappenMit,
    });
    if (!ging) continue;
    verschickt += 1;
    umgeleitet.push(ging !== h.email);
  }

  if (verschickt === 0) return { stand: "fehlgeschlagen" };

  // Die Mailspuren erst danach: im Versandweg zwischen zwei Haendlern zu
  // schreiben verzoegert nur den zweiten.
  for (const war of umgeleitet) await vermerkeMail(satz.id, MAIL_ANFRAGE, null, war);

  await setzeStufe(satz.id, 2);
  await vermerke(satz.id, {
    art: "anfrage_raus",
    text: `Anfrage an ${empfaenger.map((h) => h.name).join(" und ")} verschickt`,
    abStufe: 1,
  });

  if (satz.trainerEmail) {
    const status = absolut(statusLink(satz.nummer) ?? "");
    if (status) {
      await sendeM5(satz.trainerEmail, {
        vorgang: satz.nummer,
        vorname: "",
        mannschaft: liste.mannschaft,
        haendler: empfaenger.map((h) => h.name),
        statusLink: status,
      });
    }
  }

  // Die Stufe haben wir gerade selbst gesetzt, sonst hat sich nichts geaendert —
  // dafuer den ganzen Vorgang samt Artikeln und Personen neu zu laden waere eine
  // Abfrage fuer eine Zahl, die wir schon kennen.
  await spiegele({ ...satz, stufe: 2 });

  return { stand: "raus", anzahl: verschickt };
}

/* ------------------------------------------------------------------ *
 * F2 als Trainer (docs/formulare.md)
 * ------------------------------------------------------------------ */

export type TrainerAbfrage = GroessenAbfrage & {
  name: string;
  /** Rueckennummer, leer wenn keine vergeben. */
  nummer: string;
  ausgeschlossen: boolean;
  torwart: boolean;
  /** Nummern, die andere in diesem Vorgang schon haben. */
  belegteNummern: { nummer: string; name: string }[];
};

/**
 * Dieselbe Abfrage wie fuer den Spieler, plus das, was nur der Trainer setzt:
 * Rueckennummer, „bekommt diesmal nichts“ und „spielt Torwart“.
 *
 * Die belegten Nummern kommen mit, damit das Formular eine Dublette meldet,
 * bevor sie geschrieben wird. Geprueft wird beim Speichern trotzdem noch
 * einmal – zwischen Anzeigen und Absenden kann sich etwas aendern.
 */
export async function ladeTrainerAbfrage(
  nummer: string,
  personId: string,
): Promise<Abruf<TrainerAbfrage>> {
  const abfrage = await ladeGroessenAbfrage(nummer, personId, true);
  if (abfrage.stand !== "da") return abfrage;

  const ergebnis = await vorgangPerNummer(nummer);
  if (ergebnis.stand !== "da") return ergebnis;
  const satz = ergebnis.vorgang;

  const kontakte = await batchLesen(
    "contacts",
    satz.personen.map((p) => p.kontaktId),
    KONTAKT_FELDER,
  );
  const ich = kontakte.find((k) => k.id === personId);
  // Dass es die Person gibt, steht schon fest — die Abfrage oben hat sie
  // gelesen. Fehlt sie hier, hat HubSpot diesmal nicht geantwortet.
  if (!ich) return { stand: "gestoert" };

  const eigene = satz.personen.find((p) => p.kontaktId === personId);

  const daten: TrainerAbfrage = {
    ...abfrage.daten,
    name: personName(ich),
    nummer: eigene?.trikotnummer ?? "",
    ausgeschlossen: eigene?.ausgeschlossen ?? false,
    torwart: eigene?.torwart ?? false,
    belegteNummern: satz.personen
      .filter((p) => p.kontaktId !== personId && p.trikotnummer)
      .map((p) => ({
        nummer: p.trikotnummer as string,
        name: kontakte.find((k) => k.id === p.kontaktId)
          ? personName(kontakte.find((k) => k.id === p.kontaktId) as HsObjekt)
          : `Kontakt ${p.kontaktId}`,
      })),
  };
  return { stand: "da", daten };
}

export type TrainerEingabe = {
  groessen: Record<string, string>;
  nummer: string;
  /** Leer heisst hier „loeschen“, so wie bei der Rueckennummer. */
  initialen: string;
  ausgeschlossen: boolean;
  torwart: boolean;
};

/**
 * Schreibt die Angaben des Trainers zu einer Person.
 *
 * Groessen und Initialen gehoeren der Person und gehen nach HubSpot.
 * Rueckennummer, Ausschluss und Torwart gelten nur fuer diesen Vorgang und
 * stehen in der Datenbank – naechste Runde kann jemand anders im Tor stehen.
 *
 * Groessen sind hier optional: der Trainer traegt oft nur eine Nummer nach.
 * Das Bestaetigungsdatum wird nur gesetzt, wenn er wirklich eine Groesse
 * angefasst hat; sonst liesse eine fremde Bestaetigung eine alte Groesse
 * wieder frisch aussehen.
 */
export async function speichereTrainerAngaben(
  abfrage: TrainerAbfrage,
  eingabe: TrainerEingabe,
): Promise<{ ok: boolean; fehler?: string }> {
  const werte: Record<string, string> = {};

  for (const frage of abfrage.fragen) {
    const wert = eingabe.groessen[frage.feld];
    if (!wert) continue;
    if (!frage.werte.includes(wert)) return { ok: false, fehler: "Unbekannte Größe." };
    werte[frage.feld] = wert;
  }
  if (Object.keys(werte).length > 0) {
    werte.groesse_zuletzt_bestaetigt_am = new Date().toISOString().slice(0, 10);
  }

  if (eingabe.nummer !== "") {
    const zahl = Number(eingabe.nummer);
    if (!Number.isInteger(zahl) || zahl < 1 || zahl > 99) {
      return { ok: false, fehler: "Die Rückennummer muss zwischen 1 und 99 liegen." };
    }
    const dublette = abfrage.belegteNummern.find((b) => b.nummer === eingabe.nummer);
    if (dublette) {
      return { ok: false, fehler: `Die ${eingabe.nummer} hat schon ${dublette.name}.` };
    }
  }

  // Initialen sind fuer den Trainer optional – er traegt oft nur eine Nummer
  // nach. Was drinsteht, muss aber passen; leer loescht, so wie die Nummer.
  if (abfrage.initialenNoetig) {
    if (eingabe.initialen.trim() === "") {
      werte.initialen = "";
    } else {
      const geprueft = pruefeInitialen(eingabe.initialen);
      if ("fehler" in geprueft) return { ok: false, fehler: geprueft.fehler };
      werte.initialen = geprueft.wert;
    }
  }

  if (Object.keys(werte).length > 0) {
    const kontaktOk = await hubspot<HsObjekt>({
      pfad: `/crm/v3/objects/contacts/${encodeURIComponent(abfrage.person)}`,
      methode: "PATCH",
      koerper: { properties: werte },
    });
    if (!kontaktOk) return { ok: false };
  }

  const ergebnis = await vorgangPerNummer(abfrage.vorgang);
  if (ergebnis.stand !== "da") return { ok: false };

  const gesetzt = await setzePersonAngaben(ergebnis.vorgang.id, abfrage.person, {
    ausgeschlossen: eingabe.ausgeschlossen,
    torwart: eingabe.torwart,
    trikotnummer: eingabe.nummer,
  });

  return { ok: gesetzt };
}

/* ------------------------------------------------------------------ *
 * Person nachtragen (docs/formulare.md)
 * ------------------------------------------------------------------ */

export type Nachtrag = {
  vorgangId: string;
  /** Wer zur Mannschaft gehoert, aber noch nicht am Vorgang haengt. */
  personen: { id: string; name: string }[];
};

/**
 * Wen der Trainer noch nachtragen kann.
 *
 * Verknuepft wird in F1 genau einmal, beim Absenden. Wer danach zur Mannschaft
 * kommt, fehlt am Vorgang und bekommt keinen Groessen-Link.
 *
 * Die Auswahl ist bewusst eng: es erscheint nur, wer ohnehin zu einer der
 * Mannschaften dieses Vorgangs zaehlt. Eine freie Namenssuche waere ein
 * Mitgliederverzeichnis, und die haette hier nichts zu suchen.
 *
 * `null` heisst: gibt es nicht, oder der Vorgang ist nicht auf Stufe 1. Nur
 * dort werden Groessen gesammelt; spaeter waere ein Nachzuegler eine Zeile in
 * einer schon bestaetigten Liste.
 */
export async function nachtragbarePersonen(nummer: string): Promise<Nachtrag | null> {
  const ergebnis = await vorgangPerNummer(nummer);
  if (ergebnis.stand !== "da") return null;
  const satz = ergebnis.vorgang;

  if (satz.stufe !== 1) return null;
  if (satz.mannschaften.length === 0) return { vorgangId: satz.id, personen: [] };

  const kandidaten = await kontakteDerMannschaft(satz.mannschaften);
  // Scheitert die Suche, zeigt die Karte lieber gar nichts, als „alle haengen
  // schon am Vorgang“ zu behaupten.
  if (kandidaten === null) return null;

  const dabei = new Set(satz.personen.map((p) => p.kontaktId));
  const personen = kandidaten
    .filter((k) => !dabei.has(k.id))
    .map((k) => ({ id: k.id, name: personName(k) }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  return { vorgangId: satz.id, personen };
}

/**
 * Haengt eine Person an den Vorgang.
 *
 * Geprueft wird gegen dieselbe Auswahl, die das Formular angezeigt hat: eine
 * untergeschobene ID kommt so nicht durch, auch nicht die eines Kontakts aus
 * einer fremden Mannschaft.
 */
export async function trageNach(
  nummer: string,
  personId: string,
): Promise<{ ok: true; name: string } | { ok: false; fehler: string }> {
  const nachtrag = await nachtragbarePersonen(nummer);
  if (!nachtrag) {
    return { ok: false, fehler: "In diesem Vorgang laufen gerade keine Größen." };
  }

  const person = nachtrag.personen.find((p) => p.id === personId);
  if (!person) {
    return { ok: false, fehler: "Diese Person gehört nicht zur Mannschaft dieses Vorgangs." };
  }

  const gesetzt = await haengePersonAn(nachtrag.vorgangId, person.id);
  if (!gesetzt) {
    return { ok: false, fehler: "Das hat gerade nicht geklappt. Bitte versuch es später." };
  }

  await vermerke(nachtrag.vorgangId, {
    art: "nachtrag",
    text: `${person.name} wurde nachgetragen`,
    abStufe: 1,
    intern: true,
  });

  // Im CRM soll am Deal sichtbar bleiben, wer dazugehoert.
  const ergebnis = await vorgangPerNummer(nummer);
  if (ergebnis.stand === "da") await spiegelePersonen(ergebnis.vorgang);

  return { ok: true, name: person.name };
}

/* ------------------------------------------------------------------ *
 * Die Groessen-Mail an die Mannschaft (M2a)
 * ------------------------------------------------------------------ */

/**
 * Die Arten in `mail_versand`. Getrennt gefuehrt, weil sie verschiedene
 * Grenzen haben: die Groessen-Mail schickt der Trainer von Hand und so oft er
 * will, die Erinnerung ein Lauf und hoechstens zweimal (`erinnerung.ts`).
 */
export const MAIL_GROESSEN = "groessen";
export const MAIL_ERINNERUNG = "erinnerung";

export type MailEmpfaenger = {
  person: string;
  name: string;
  /**
   * Ob am Kontakt eine Adresse steht. Die Adresse selbst geht nie an den
   * Browser: der Trainer soll auswaehlen koennen, nicht die Adressen seiner
   * Mannschaft ablesen (CLAUDE.md, „Kontaktdaten nie offen anzeigen“).
   */
  hatAdresse: boolean;
  /** Zeitpunkt der letzten Groessen-Mail, leer wenn noch keine rausging. */
  zuletzt: string;
  /** Wer schon eingetragen hat, braucht keine Mail mehr. */
  hatGroesse: boolean;
};

export type Verteiler = {
  vorgang: string;
  mannschaft: string;
  frist: string;
  empfaenger: MailEmpfaenger[];
};

/**
 * Wer eine Groessen-Mail bekommen kann, und wer schon eine hat.
 *
 * Hier stehen Namen, auch bei einer Jugendmannschaft — wie in F3 und aus
 * demselben Grund: der Trainer muss wissen, wen er anschreibt, und die Seite
 * haengt an seinem eigenen signierten Link.
 */
export async function verteiler(nummer: string): Promise<Abruf<Verteiler>> {
  const ergebnis = await vorgangPerNummer(nummer);
  if (ergebnis.stand !== "da") return ergebnis;
  const satz = ergebnis.vorgang;

  const kontakte = await kontakteVon(satz);
  if (kontakte === null) return { stand: "gestoert" };

  // Wer schon eine Mail hat, entscheidet die Vorauswahl. Waere das hier
  // „konnte nicht fragen“ und die Karte zeigte trotzdem alle als offen an,
  // bekaeme die halbe Mannschaft die Mail ein zweites Mal.
  const gesendet = await mailsJePerson(satz.id, MAIL_GROESSEN);
  if (gesendet === null) return { stand: "gestoert" };

  return {
    stand: "da",
    daten: {
      vorgang: satz.nummer,
      mannschaft: satz.mannschaften.join(", ") || (satz.mannschaftscode ?? ""),
      frist: kurz(satz.groessenFrist) ?? "",
      // Nach Namen, nicht in der Reihenfolge von HubSpot: die ist beliebig und
      // wechselt zwischen zwei Besuchen. Wer 26 Haken setzt, will die Liste
      // zweimal gleich vorfinden.
      empfaenger: kontakte
        .map((k) => ({
          person: k.id,
          name: personName(k),
          hatAdresse: Boolean(text(k, "email")),
          zuletzt: gesendet.get(k.id) ?? "",
          hatGroesse: hatGroesse(k),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "de")),
    },
  };
}

/** „Oberteil“, „Oberteil und Trainingshose“, „Trikot, Oberteil und Schuhe“. */
function aufzaehlung(teile: string[]): string {
  if (teile.length <= 1) return teile[0] ?? "";
  return `${teile.slice(0, -1).join(", ")} und ${teile[teile.length - 1]}`;
}

export type MailKontext = {
  /** Was gefragt wird, in Worten: „Oberteil und Trainingshose“. */
  arten: string;
  /** Die Frist, deutsch gekuerzt. */
  frist: string;
  mannschaft: string;
  nurGroessen: boolean;
};

/**
 * Was jede Groessen-Mail ueber den Vorgang wissen muss.
 *
 * Steht an einer Stelle, weil zwei Absender daraus schoepfen: die Mail, die der
 * Trainer von Hand verschickt (M2a), und die Erinnerung (M2). Liefen sie
 * auseinander, fragte die Erinnerung nach etwas anderem als die erste Mail.
 */
export function mailKontext(satz: VorgangSatz): MailKontext {
  return {
    arten: aufzaehlung(gefragteArten(satz).map((art) => GROESSEN_LABEL[art])),
    frist: kurz(satz.groessenFrist) ?? "zur Frist",
    mannschaft: satz.mannschaften.join(", ") || (satz.mannschaftscode ?? ""),
    nurGroessen: nurGroessen(satz),
  };
}

export type VersandErgebnis =
  | { ok: true; verschickt: number; fehlgeschlagen: number; umgeleitetAn?: string }
  | { ok: false; grund: "gestoert" | "unbekannt" | "zu" | "niemand" | "kein-versand" };

/**
 * Verschickt die Groessen-Mail an die ausgewaehlten Personen.
 *
 * Wer ausgewaehlt werden darf, entscheidet der Vorgang und nicht das Formular:
 * die Liste wird frisch geladen und jede ID daran geprueft. Sonst liesse sich
 * ueber ein nachgebautes Formular jede beliebige Kontakt-ID anschreiben.
 *
 * Verschickt wird einzeln, damit jeder nur seinen eigenen Link bekommt — und
 * damit eine Adresse, die Resend ablehnt, die uebrigen nicht mitreisst.
 */
export async function sendeGroessenMails(
  nummer: string,
  ids: string[],
): Promise<VersandErgebnis> {
  if (!mailAktiv()) return { ok: false, grund: "kein-versand" };

  const ergebnis = await vorgangPerNummer(nummer);
  if (ergebnis.stand === "gestoert") return { ok: false, grund: "gestoert" };
  if (ergebnis.stand !== "da") return { ok: false, grund: "unbekannt" };
  const satz = ergebnis.vorgang;

  // Nur solange Groessen gesammelt werden. Danach waere die Mail eine
  // Aufforderung, etwas einzutragen, das niemand mehr aendern kann.
  if (satz.stufe !== 1) return { ok: false, grund: "zu" };

  const raus = ausgeschlossene(satz);
  const erlaubt = new Set(
    satz.personen.map((p) => p.kontaktId).filter((id) => !raus.has(id)),
  );
  const gewaehlt = [...new Set(ids)].filter((id) => erlaubt.has(id));
  if (gewaehlt.length === 0) return { ok: false, grund: "niemand" };

  const kontakte = await batchLesen("contacts", gewaehlt, KONTAKT_FELDER);
  if (kontakte.length === 0) return { ok: false, grund: "gestoert" };

  const { arten, frist, mannschaft, nurGroessen: nur } = mailKontext(satz);

  let verschickt = 0;
  let fehlgeschlagen = 0;
  let umgeleitetAn: string | undefined;

  for (const k of kontakte) {
    const email = text(k, "email");
    const pfad = groessenLink(satz.nummer, k.id);
    const link = pfad ? absolut(pfad) : null;
    if (!email || !link) {
      fehlgeschlagen += 1;
      continue;
    }

    const ging = await sendeM2a(email, {
      vorgang: satz.nummer,
      vorname: text(k, "firstname") ?? "",
      mannschaft,
      arten,
      frist,
      nurGroessen: nur,
      groessenLink: link,
    });
    if (!ging) {
      fehlgeschlagen += 1;
      continue;
    }

    verschickt += 1;
    const umgeleitet = ging !== email;
    if (umgeleitet) umgeleitetAn = ging;
    await vermerkeMail(satz.id, MAIL_GROESSEN, k.id, umgeleitet);
  }

  if (verschickt > 0) {
    // Ohne Namen: der Verlauf steht auch auf der Spieler-Ansicht.
    await vermerke(satz.id, {
      art: "mail",
      text: `Größen-Mail an ${verschickt} ${verschickt === 1 ? "Person" : "Personen"} verschickt`,
      abStufe: 1,
    });
  }

  return { ok: true, verschickt, fehlgeschlagen, umgeleitetAn };
}

export type { StufeNr };
