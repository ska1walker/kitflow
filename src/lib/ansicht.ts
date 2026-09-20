import "server-only";

/**
 * Aus einem Vorgang der Datenbank wird das, was die Seiten zeigen.
 *
 * Hier steht die Ableitungslogik, die heute noch in `vorgaenge.ts` am
 * HubSpot-Deal hängt: Jugend oder nicht, welche Größen gefragt werden, wer
 * Torwart ist, was in den Verlauf gehört, und die sechs Prüfungen.
 *
 * **Angeschlossen ist noch nichts** — der Umzug kommt im nächsten Schritt.
 * Getrennt gebaut, weil das der Teil ist, der wirklich etwas entscheidet; die
 * Verkabelung danach ist Fleißarbeit, und beides in einem Rutsch wäre ein
 * Diff, den niemand mehr prüfen kann.
 *
 * Was einer Person gehört — Name, Größen, Initialen — kommt weiterhin aus
 * HubSpot und wird hier als `HsObjekt` hereingereicht. Diese Schicht holt
 * nichts selbst; sie rechnet nur.
 */

import { kurzDatum, text, type HsObjekt } from "./hubspot";
import {
  GROESSEN_FELD,
  GROESSEN_LABEL,
  istJugend as istJugendMannschaft,
  istVeraltet,
} from "./groessen";
import { NUR_GROESSEN } from "./mannschaften";
import { offen, pruefung, type Pruefung } from "./pruefungen";
import type { Artikel, Ereignis, Groessenart, Haendler, PersonGroesse, StufeNr } from "./typen";
import type { EreignisSatz, VorgangSatz } from "./vorgaenge-db";

/**
 * Jugendmannschaft? Entscheidet über Namen in der Oberfläche und darüber, ab
 * wann eine Größe als veraltet gilt.
 */
export function istJugend(satz: VorgangSatz): boolean {
  return istJugendMannschaft(satz.mannschaften.join(";"), satz.mannschaftscode);
}

/** Ein Vorgang, der nichts bestellt, sondern nur Größen einsammelt. */
export function nurGroessen(satz: VorgangSatz): boolean {
  return satz.ausstattungsart === NUR_GROESSEN;
}

/**
 * Der Name der Mannschaft, wie ein Mensch ihn lesen soll.
 *
 * Stand vorher als Ausdruck an zehn Stellen, in drei Spielarten — und dieser
 * Name erreicht den Händler (M4), den Trainer (M4b), Telegram und die
 * Übersicht. Drei verschiedene Antworten auf „keine Mannschaft hinterlegt“
 * waren schon sichtbar, bevor die Freigabe drei weitere dazustellte.
 *
 * `ohne` bleibt einstellbar, weil eine Mail „für **deine Mannschaft**“ schreibt,
 * wo eine Liste „Ohne Mannschaft“ braucht.
 */
export function mannschaftsName(satz: VorgangSatz, ohne = "Ohne Mannschaft"): string {
  return satz.mannschaften.join(", ") || satz.mannschaftscode || ohne;
}

/** Wer in diesem Vorgang diesmal nichts bekommt. */
export function ausgeschlossene(satz: VorgangSatz): Set<string> {
  return new Set(satz.personen.filter((p) => p.ausgeschlossen).map((p) => p.kontaktId));
}

/** Wer in diesem Vorgang im Tor steht. Nächste Runde kann es jemand anders sein. */
export function torwarte(satz: VorgangSatz): Set<string> {
  return new Set(satz.personen.filter((p) => p.torwart).map((p) => p.kontaktId));
}

/** Die Rückennummer einer Person in diesem Vorgang. */
export function trikotnummer(satz: VorgangSatz, kontaktId: string): string {
  return satz.personen.find((p) => p.kontaktId === kontaktId)?.trikotnummer ?? "";
}

/**
 * Der Artikelstamm des Vorgangs.
 *
 * Die Artikelnummern der beiden Händler fehlen hier: sie gehören zum Produkt
 * in HubSpot, nicht zum Vorgang. Angezeigt werden sie nirgends; gebraucht
 * werden sie erst von der Händler-Mail M4, und die ist nicht gebaut.
 */
export function artikelVon(satz: VorgangSatz): Artikel[] {
  return satz.artikel.map((a) => ({
    id: a.id,
    name: [a.hersteller, a.bezeichnung].filter(Boolean).join(" "),
    herstellernummer: a.herstellernummer ?? "",
    groessenart: a.groessenart,
    fuer: a.fuer,
    groesseVon: a.groesseVon,
    groesseBis: a.groesseBis,
    hatBild: Boolean(a.bild),
  }));
}

/**
 * Welche Größen dieser Vorgang fragt.
 *
 * Normalerweise sagen das die Artikel: eine Trainingsjacke braucht ein
 * Oberteil, eine Hose eine Hosengröße. Ein reiner Größencheck hat keine
 * Artikel – dann steht am Vorgang, wonach gefragt wird.
 *
 * F2 und F3 müssen hier zum selben Ergebnis kommen, sonst fragt das Formular
 * etwas anderes, als die Liste anzeigt. Deshalb steht es genau einmal hier.
 */
export function gefragteArten(satz: VorgangSatz): Groessenart[] {
  const ausArtikeln = [...new Set(satz.artikel.map((a) => a.groessenart))].filter((a) => a !== "ohne");
  if (ausArtikeln.length > 0) return ausArtikeln;

  return [...new Set(satz.groessenarten.filter((a) => a in GROESSEN_FELD && a !== "ohne"))];
}

/**
 * Wer ist Feldspieler, wer Torwart?
 *
 * Bisher entschieden das die Positionen: wer eine Torwart-Position hatte, war
 * Torwart. Jetzt steht es am Vorgang, wo es hingehört — der Trainer setzt es
 * in F2 als Trainer, und es gilt nur für diese Runde.
 */
export function rollen(satz: VorgangSatz): { feldspieler: number; torwart: number } {
  const raus = ausgeschlossene(satz);
  const dabei = satz.personen.filter((p) => !raus.has(p.kontaktId));
  const torwart = dabei.filter((p) => p.torwart).length;
  return { feldspieler: dabei.length - torwart, torwart };
}

/**
 * Die Ausstattung einer Person: je gefragter Größenart der Wert am Kontakt,
 * dazu die Rückennummer aus diesem Vorgang.
 *
 * Das ist zugleich eine Richtigstellung. Bisher las diese Liste die Größen aus
 * den Positionen — dorthin schreibt kitflow aber gar nichts, Größen stehen am
 * Kontakt. Die Karte blieb deshalb immer leer.
 */
export function ausstattungVon(
  satz: VorgangSatz,
  kontakt: HsObjekt | undefined,
): PersonGroesse[] {
  if (!kontakt) return [];

  const eintraege: PersonGroesse[] = [];
  for (const art of gefragteArten(satz)) {
    const feld = GROESSEN_FELD[art];
    const wert = feld ? text(kontakt, feld) : undefined;
    if (wert) eintraege.push({ feld: GROESSEN_LABEL[art], wert });
  }

  const nummer = trikotnummer(satz, kontakt.id);
  if (nummer) eintraege.push({ feld: "Rückennummer", wert: nummer });

  return eintraege;
}

/** Die beiden Händler mit dem Tag, an dem ihr Angebot einging. */
export function haendler(satz: VorgangSatz): Haendler[] {
  return [
    {
      name: "Intersport Uelzen",
      ansprechpartner: "",
      angebotAm: kurzDatum(satz.angebote.intersport.am) ?? "",
      gewaehlt: satz.lieferantGewaehlt === "Intersport Uelzen",
    },
    {
      name: "11teamsports",
      ansprechpartner: "",
      angebotAm: kurzDatum(satz.angebote.elfteamsports.am) ?? "",
      gewaehlt: satz.lieferantGewaehlt === "11teamsports",
    },
  ];
}

/**
 * Der Verlauf aus zweierlei: den Daten, die am Vorgang stehen, und den
 * Ereignissen, die kitflow selbst mitschreibt.
 *
 * Bisher gab es nur das Erste, weil HubSpot keine Ereignisliste führt. Jetzt
 * kommt beides zusammen und wird nach Zeitpunkt sortiert.
 */
export function verlauf(satz: VorgangSatz, ereignisse: EreignisSatz[] = []): Ereignis[] {
  const eintraege: { sortier: string; ereignis: Ereignis }[] = [];

  function ausDatum(roh: string | undefined, ab: StufeNr, titel: string, sub?: string, intern?: boolean) {
    const datum = kurzDatum(roh);
    if (!roh || !datum) return;
    eintraege.push({ sortier: roh, ereignis: { ab, datum, uhrzeit: "", text: titel, sub, intern } });
  }

  ausDatum(satz.groessenFrist, 1, "Frist für die Größen");
  ausDatum(satz.angebote.elfteamsports.am, 3, "Angebot von 11teamsports eingegangen");
  ausDatum(satz.angebote.intersport.am, 3, "Angebot von Intersport Uelzen eingegangen");
  ausDatum(satz.stufeFrist, 4, "Frist der Kaskadenstufe", undefined, true);
  ausDatum(satz.finanzen.eingangAm, 5, "Geld ist auf dem Vereinskonto", "Deckungsprüfung erfüllt");
  ausDatum(
    satz.bestelltAm,
    6,
    satz.lieferantGewaehlt ? `Bestellung an ${satz.lieferantGewaehlt} verschickt` : "Bestellt",
  );
  ausDatum(satz.geliefertAm, 7, "Lieferung angekommen");
  ausDatum(satz.erstattung.am, 8, "Erstattung überwiesen", undefined, true);

  for (const e of ereignisse) {
    const zeit = inBerlin(e.zeitpunkt);
    if (!zeit) continue;
    eintraege.push({
      sortier: e.zeitpunkt,
      ereignis: {
        ab: e.abStufe,
        datum: zeit.datum,
        uhrzeit: zeit.uhrzeit,
        text: e.text,
        sub: e.sub,
        intern: e.intern,
      },
    });
  }

  return eintraege.sort((a, b) => a.sortier.localeCompare(b.sortier)).map((e) => e.ereignis);
}

/**
 * Ein Zeitstempel aus der Datenbank, in deutscher Ortszeit.
 *
 * `kurzDatum` schneidet die Zeichenkette auf, und das ist für ein reines Datum
 * (`groessen_frist`) auch richtig. Ein Ereignis trägt dagegen eine Uhrzeit mit
 * Zeitzone: um 23:30 UTC ist in Munster schon der nächste Tag, und 06:38 UTC
 * sind hier 08:38. Wer das aufschneidet, zeigt zwei verschiedene Uhren auf
 * derselben Seite — der Kopf „Stand: …" rechnet nämlich richtig um.
 */
function inBerlin(zeitpunkt: string): { datum: string; uhrzeit: string } | null {
  const zeit = new Date(zeitpunkt);
  if (Number.isNaN(zeit.getTime())) return null;

  const teile = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(zeit);
  const hole = (art: string) => teile.find((t) => t.type === art)?.value ?? "";

  return { datum: `${hole("day")}.${hole("month")}.`, uhrzeit: `${hole("hour")}:${hole("minute")}` };
}

/** Eine Zeile der Liste, so weit die Prüfungen sie brauchen. */
export type PruefZeile = {
  name: string;
  groessen: { label: string; wert: string }[];
  nummer: string;
  veraltet: boolean;
};

/**
 * Die sechs Prüfungen aus docs/konzept.md, in dieser Reihenfolge.
 *
 * Sie entscheiden, ob eine Anfrage an beide Händler rausgeht. Was sich nicht
 * prüfen lässt, bekommt `offen` und sagt warum — nicht `bestanden`.
 */
export function pruefungen(satz: VorgangSatz, zeilen: PruefZeile[]): Pruefung[] {
  const fehlendeGroessen = (): string[] => {
    const maengel: string[] = [];
    for (const zeile of zeilen) {
      const fehlend = zeile.groessen.filter((g) => !g.wert).map((g) => g.label);
      if (fehlend.length > 0) maengel.push(`${zeile.name}: ${fehlend.join(", ")} fehlt`);
      else if (zeile.veraltet) maengel.push(`${zeile.name}: Größe ist veraltet`);
    }
    return maengel;
  };

  // Ein Größencheck geht an keinen Händler: Artikel, Beflockung, Summen und die
  // Lieferadresse haben dort nichts zu prüfen. „Es hängt kein Artikel am
  // Vorgang“ wäre ein erfundener Mangel.
  if (nurGroessen(satz)) {
    return [pruefung(2, "Jede Person hat eine aktuelle Größe je Größenart", fehlendeGroessen())];
  }

  const trikotsatz = satz.ausstattungsart === "Trikotsatz";

  // 1 · Artikel vollständig. Eine fehlende Herstellernummer heißt: der Artikel
  //     steckt noch im Platzhalter aus der Voranfrage.
  const artikelMaengel: string[] = [];
  if (satz.artikel.length === 0) artikelMaengel.push("Es hängt kein Artikel am Vorgang.");
  for (const a of satz.artikel) {
    const name = [a.hersteller, a.bezeichnung].filter(Boolean).join(" ") || "Artikel";
    if (!a.herstellernummer) artikelMaengel.push(`${name}: keine Herstellernummer`);
    if (!a.farbe) artikelMaengel.push(`${name}: keine Farbe`);
  }

  // 3 · Rückennummern vollständig und eindeutig, nur beim Trikotsatz
  const nummernMaengel: string[] = [];
  if (trikotsatz) {
    const gesehen = new Map<string, string>();
    for (const zeile of zeilen) {
      if (!zeile.nummer) {
        nummernMaengel.push(`${zeile.name}: keine Rückennummer`);
        continue;
      }
      const zahl = Number(zeile.nummer);
      if (!Number.isInteger(zahl) || zahl < 1 || zahl > 99) {
        nummernMaengel.push(`${zeile.name}: Rückennummer ${zeile.nummer} liegt nicht zwischen 1 und 99`);
        continue;
      }
      const schon = gesehen.get(zeile.nummer);
      if (schon) nummernMaengel.push(`Rückennummer ${zeile.nummer} doppelt: ${schon} und ${zeile.name}`);
      else gesehen.set(zeile.nummer, zeile.name);
    }
  }

  // 4 · Beflockung je Artikel festgelegt. Das Vereinslogo als Datei kennt das
  //     Datenmodell nicht, deshalb bleibt die Prüfung offen statt zu lügen.
  const beflockungMaengel = satz.artikel
    .filter((a) => !a.beflockung)
    .map((a) => `${[a.hersteller, a.bezeichnung].filter(Boolean).join(" ") || "Artikel"}: keine Beflockung hinterlegt`);

  // 6 · Lieferadresse und Trainer-Kontakt
  const kontaktMaengel: string[] = [];
  if (!satz.lieferadresse) kontaktMaengel.push("Lieferadresse fehlt");
  if (!satz.trainerEmail) kontaktMaengel.push("Trainer-E-Mail fehlt");

  return [
    pruefung(1, "Artikel sind vollständig mit Herstellernummer und Farbe", artikelMaengel),
    pruefung(2, "Jede Person hat eine aktuelle Größe je Größenart", fehlendeGroessen()),
    trikotsatz
      ? pruefung(3, "Rückennummern vollständig und eindeutig", nummernMaengel)
      : pruefung(3, "Rückennummern (nur beim Trikotsatz)", []),
    beflockungMaengel.length > 0
      ? pruefung(4, "Beflockung je Artikel festgelegt", beflockungMaengel)
      : offen(4, "Beflockung und Vereinslogo", "Das Vereinslogo als Datei kennt das Datenmodell noch nicht."),
    offen(5, "Summen je Artikel und Größe", "Prüfbar erst, wenn jede Person ihre Größe eingetragen hat."),
    pruefung(6, "Lieferadresse und Trainer-Kontakt gesetzt", kontaktMaengel),
  ];
}

/** Ob die Größe einer Person für diesen Vorgang als veraltet gilt. */
export function veraltet(satz: VorgangSatz, kontakt: HsObjekt): boolean {
  return istVeraltet(text(kontakt, "groesse_zuletzt_bestaetigt_am"), istJugend(satz));
}
