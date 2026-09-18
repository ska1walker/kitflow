import "server-only";

/**
 * Was die Händler bekommen (M4) — und was ausdrücklich nicht.
 *
 * **Keine Spielernamen.** Kais Auflage bei der Freigabe, und sie ist der ganze
 * Zuschnitt dieser Datei. Der ursprüngliche Entwurf (docs/mails.md) sah ein
 * Blatt „Positionen“ mit je einer Zeile pro Person vor: Vorname, Nachname,
 * Größe, Trikotnummer. Das hätte die Namen und Maße einer ganzen
 * Jugendmannschaft an zwei Firmen gegeben, dauerhaft, außerhalb des Vereins und
 * ohne jede Möglichkeit, es zurückzunehmen.
 *
 * Gebraucht wird das nicht. Ein Händler kalkuliert und produziert aus:
 *
 * - **wie viele** von welchem Artikel in welcher Größe,
 * - **welche Rückennummer** auf welches Stück kommt,
 * - **welche Initialen** darauf sollen, wenn der Vorgang sie verlangt.
 *
 * Kein Schritt davon braucht einen Namen. Die Zeilen sind deshalb nach Artikel
 * und Größe sortiert und nicht nach Person — wer zu welcher Zeile gehört, weiß
 * nur der Verein, und das genügt zum Verteilen der Ware.
 */

import type { Liste, ListenZeile } from "./vorgaenge";
import type { ArtikelSatz } from "./vorgaenge-db";

export type AnfrageZeile = {
  artikel: string;
  hersteller: string;
  herstellernummer: string;
  farbe: string;
  groesse: string;
  stueck: number;
  /** Nur beim Trikotsatz, sonst leer. */
  nummer: string;
  /** Nur wenn der Vorgang Initialen verlangt, sonst leer. */
  initialen: string;
  beflockung: string;
};

export type AnfrageSumme = {
  artikel: string;
  groesse: string;
  stueck: number;
};

export type Anfrage = {
  zeilen: AnfrageZeile[];
  summen: AnfrageSumme[];
  gesamtStueck: number;
};

function artikelName(a: ArtikelSatz): string {
  return [a.hersteller, a.bezeichnung].filter(Boolean).join(" ").trim() || a.bezeichnung;
}

/** Bekommt diese Person diesen Artikel? */
function gilt(a: ArtikelSatz, zeile: ListenZeile): boolean {
  if (a.fuer === "torwart") return zeile.torwart;
  if (a.fuer === "feldspieler") return !zeile.torwart;
  return true;
}

/**
 * Baut die Anfrage aus der bestätigten Liste.
 *
 * Eine Zeile je Person und Artikel — aber **ohne die Person**. Ausgeschlossene
 * sind schon vorher raus (`kontakteVon`), und wer keine Größe eingetragen hat,
 * fällt hier weg: eine Zeile ohne Größe kann kein Händler bepreisen, und geraten
 * wird nichts.
 */
export function baueAnfrage(liste: Liste, artikel: ArtikelSatz[]): Anfrage {
  const zeilen: AnfrageZeile[] = [];

  for (const a of artikel) {
    for (const person of liste.zeilen) {
      if (!gilt(a, person)) continue;

      const groesse = person.groessen.find((g) => g.art === a.groessenart)?.wert ?? "";
      if (!groesse) continue;

      for (let i = 0; i < Math.max(1, a.stueck); i++) {
        zeilen.push({
          artikel: artikelName(a),
          hersteller: a.hersteller ?? "",
          herstellernummer: a.herstellernummer ?? "",
          farbe: a.farbe ?? "",
          groesse,
          stueck: 1,
          // Die Rückennummer gehört zum Trikotsatz. Bei allem anderen stünde
          // dort eine Zahl, die niemand aufdruckt.
          nummer: liste.trikotsatz ? person.nummer : "",
          initialen: liste.initialenNoetig ? person.initialen : "",
          beflockung: a.beflockung ?? "",
        });
      }
    }
  }

  // Nach Artikel, dann nach Größe: so liest es ein Händler, und so verrät die
  // Reihenfolge nichts über die Reihenfolge der Personen in der Liste.
  zeilen.sort(
    (x, y) =>
      x.artikel.localeCompare(y.artikel, "de") ||
      x.groesse.localeCompare(y.groesse, "de") ||
      x.nummer.localeCompare(y.nummer, "de"),
  );

  const nachArtikelUndGroesse = new Map<string, AnfrageSumme>();
  for (const z of zeilen) {
    const schluessel = `${z.artikel}\u0000${z.groesse}`;
    const da = nachArtikelUndGroesse.get(schluessel);
    if (da) da.stueck += 1;
    else nachArtikelUndGroesse.set(schluessel, { artikel: z.artikel, groesse: z.groesse, stueck: 1 });
  }

  return {
    zeilen,
    summen: [...nachArtikelUndGroesse.values()],
    gesamtStueck: zeilen.length,
  };
}

/** Ein Feld für CSV: Anführungszeichen verdoppeln, immer einpacken. */
function feld(wert: string | number): string {
  return `"${String(wert).replace(/"/g, '""')}"`;
}

/**
 * Die Anfrage als CSV, wie sie am Anhang hängt.
 *
 * CSV und nicht XLSX: kitflow hat keine Tabellenbibliothek, und eine erfundene
 * XLSX-Struktur wäre nicht die Vorlage, die die Händler kennen. Eine CSV öffnet
 * jedes Tabellenprogramm; die gewohnte Vorlage lässt sich nachrüsten, sobald
 * `Anfrage_Vorlage.xlsx` vorliegt (docs/mails.md).
 *
 * Semikolon als Trenner und BOM voran: so öffnet Excel auf Deutsch die Datei
 * in Spalten statt alles in eine zu schreiben.
 */
export function alsCsv(anfrage: Anfrage, mitNummer: boolean, mitInitialen: boolean): string {
  const kopf = [
    "Artikel",
    "Hersteller",
    "Herstellernummer",
    "Farbe",
    "Groesse",
    "Stueck",
    ...(mitNummer ? ["Rueckennummer"] : []),
    ...(mitInitialen ? ["Initialen"] : []),
    "Beflockung",
  ];

  const zeilen = anfrage.zeilen.map((z) =>
    [
      z.artikel,
      z.hersteller,
      z.herstellernummer,
      z.farbe,
      z.groesse,
      z.stueck,
      ...(mitNummer ? [z.nummer] : []),
      ...(mitInitialen ? [z.initialen] : []),
      z.beflockung,
    ]
      .map(feld)
      .join(";"),
  );

  return `\uFEFF${kopf.map(feld).join(";")}\r\n${zeilen.join("\r\n")}\r\n`;
}

/** Die Summen in Worten, für den Fließtext der Mail. */
export function summenText(anfrage: Anfrage): { name: string; detail: string }[] {
  return anfrage.summen.map((s) => ({
    name: `${s.stueck}× ${s.artikel}`,
    detail: `Größe ${s.groesse}`,
  }));
}
