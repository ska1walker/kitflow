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
  verlauf as verlaufLesen,
  vermerke,
  vorgangPerNummer,
  type VorgangSatz,
} from "./vorgaenge-db";
import { spiegelePersonen } from "./spiegel";
import { kontakteDerMannschaft } from "./bedarf";
import { trainerLink } from "./links";
import type { Pruefung } from "./pruefungen";
import { pruefeInitialen } from "./typen";
import type { Groessenart, StufeNr, Vorgang } from "./typen";

/** Kontakt-Eigenschaften: Name, Mannschaft und die Groessen aus docs/datenmodell.md. */
const KONTAKT_FELDER = [
  "firstname",
  "lastname",
  "team",
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
 * Die Kontakte eines Vorgangs, ohne die Ausgeschlossenen.
 *
 * `null` heisst: HubSpot hat nicht geantwortet. Das muss unterscheidbar
 * bleiben — sonst zeigt die Seite „0 von 0 eingetragen“, wo in Wahrheit 26
 * Leute warten.
 */
async function kontakteVon(satz: VorgangSatz): Promise<HsObjekt[] | null> {
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

    quelle: "echt",
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
 * `null` heisst: gibt es nicht, gehoert nicht zusammen, oder die Datenbank
 * antwortet nicht. Die Seite macht daraus dieselbe Antwort wie bei einem
 * falschen Token, damit sich ueber die Antwort nichts erraten laesst.
 */
export async function ladeGroessenAbfrage(
  nummer: string,
  personId: string,
  alsTrainer = false,
): Promise<GroessenAbfrage | null> {
  const ergebnis = await vorgangPerNummer(nummer);
  if (ergebnis.stand !== "da") return null;
  const satz = ergebnis.vorgang;

  // Der Token bindet die Person schon an den Vorgang. Die Zugehoerigkeit wird
  // trotzdem geprueft: wer inzwischen raus ist, soll mit einem alten Link
  // nichts mehr eintragen.
  const dabei = satz.personen.find((p) => p.kontaktId === personId);
  if (!dabei) return null;
  // Wer ausgeschlossen ist, traegt selbst nichts mehr ein. Der Trainer schon:
  // er muss den Ausschluss zuruecknehmen koennen.
  if (!alsTrainer && dabei.ausgeschlossen) return null;

  const kontakte = await batchLesen("contacts", [personId], KONTAKT_FELDER);
  const kontakt = kontakte[0];
  if (!kontakt) return null;

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

  return {
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
export async function ladeListe(nummer: string): Promise<Liste | null> {
  const ergebnis = await vorgangPerNummer(nummer);
  if (ergebnis.stand !== "da") return null;
  const satz = ergebnis.vorgang;

  const kontakte = await kontakteVon(satz);
  if (kontakte === null) return null;

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

  return {
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
}

/**
 * Nimmt die Bestaetigung des Trainers entgegen: Datum, Lieferadresse und der
 * Hinweis an die Haendler.
 *
 * Die Stufe bleibt, wo sie ist. „Anfrage raus“ hiesse, dass eine Anfrage
 * rausgegangen ist; solange kitflow keine verschickt, waere das eine Behauptung.
 */
export async function bestaetigeListe(
  nummer: string,
  lieferadresse: string,
  hinweis: string,
): Promise<boolean> {
  const ergebnis = await vorgangPerNummer(nummer);
  if (ergebnis.stand !== "da") return false;
  const satz = ergebnis.vorgang;

  const ok = await aendereVorgang(satz.id, {
    listeBestaetigtAm: new Date().toISOString().slice(0, 10),
    ...(lieferadresse ? { lieferadresse } : {}),
    ...(hinweis ? { hinweisHaendler: hinweis } : {}),
  });
  if (!ok) return false;

  await vermerke(satz.id, {
    art: "liste_bestaetigt",
    text: "Der Trainer hat die Liste bestätigt",
    abStufe: 1,
  });
  return true;
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
): Promise<TrainerAbfrage | null> {
  const abfrage = await ladeGroessenAbfrage(nummer, personId, true);
  if (!abfrage) return null;

  const ergebnis = await vorgangPerNummer(nummer);
  if (ergebnis.stand !== "da") return null;
  const satz = ergebnis.vorgang;

  const kontakte = await batchLesen(
    "contacts",
    satz.personen.map((p) => p.kontaktId),
    KONTAKT_FELDER,
  );
  const ich = kontakte.find((k) => k.id === personId);
  if (!ich) return null;

  const eigene = satz.personen.find((p) => p.kontaktId === personId);

  return {
    ...abfrage,
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

export type { StufeNr };
