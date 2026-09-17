import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ladeListe } from "./vorgaenge";
import { darfBestaetigen, type Pruefung } from "./pruefungen";
import { artikel, deal, kontakt, stelleHubSpot } from "../../test/hubspot-fake";

/**
 * Die sechs Prüfungen sind der Grund, warum F3 existiert: eine Anfrage mit
 * falschen Größen kostet den Händler Arbeit und die Mannschaft eine Runde
 * Zeit. Eine gefallene Prüfung hält die Bestätigung auf, auch mit gesetztem
 * Häkchen; eine offene nicht — sonst könnte niemand je bestätigen.
 *
 * Geprüft wird über `ladeListe`, also so, wie der Trainer sie sieht.
 */

const HEUTE = "2026-09-17";

/** Ein Kontakt mit vollständiger, frischer Größe. */
function fertig(id: string, mehr: Record<string, string> = {}) {
  return kontakt(id, {
    trainingsanzug_oberteil: "L",
    groesse_zuletzt_bestaetigt_am: HEUTE,
    ...mehr,
  });
}

async function pruefungen(welt: Parameters<typeof stelleHubSpot>[0]) {
  stelleHubSpot(welt);
  const liste = await ladeListe("AUS-2026-001");
  if (!liste) throw new Error("keine Liste");
  return liste;
}

function nr(liste: { pruefungen: Pruefung[] }, n: number): Pruefung {
  const p = liste.pruefungen.find((x) => x.nr === n);
  if (!p) throw new Error(`Prüfung ${n} fehlt`);
  return p;
}

const jacke = artikel("p-jacke", "oberteil");

beforeEach(() => {
  process.env.HUBSPOT_TOKEN = "zz-test";
  process.env.LINK_SECRET = "x".repeat(32);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${HEUTE}T12:00:00Z`));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.HUBSPOT_TOKEN;
  delete process.env.LINK_SECRET;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Ein Vorgang, an dem nichts fehlt", () => {
  test("lässt sich bestätigen", async () => {
    const liste = await pruefungen({
      deal: deal(),
      positionen: [jacke.position],
      produkte: [jacke.produkt],
      kontakte: [fertig("k1"), fertig("k2")],
    });

    expect(nr(liste, 1).stand).toBe("bestanden");
    expect(nr(liste, 2).stand).toBe("bestanden");
    expect(nr(liste, 6).stand).toBe("bestanden");
    // 4 und 5 bleiben offen und sagen warum: das Vereinslogo kennt das
    // Datenmodell nicht, die Positionen entstehen erst danach.
    expect(nr(liste, 4).stand).toBe("offen");
    expect(nr(liste, 5).stand).toBe("offen");
    expect(darfBestaetigen(liste.pruefungen)).toBe(true);
  });
});

describe("Prüfung 1 · Artikel", () => {
  test.for([
    ["keine Farbe", { farbe: "" }, "keine Farbe"],
    ["keine Herstellernummer", { hs_sku: "" }, "keine Herstellernummer"],
    ["nicht aktiv", { aktiv: "false" }, "nicht aktiv"],
  ] as const)("%s hält die Bestätigung auf", async ([, kaputt, text]) => {
    const a = artikel("p1", "oberteil", kaputt);
    const liste = await pruefungen({
      deal: deal(),
      positionen: [a.position],
      produkte: [a.produkt],
      kontakte: [fertig("k1")],
    });

    expect(nr(liste, 1).stand).toBe("gefallen");
    expect(nr(liste, 1).details.join(" ")).toContain(text);
    expect(darfBestaetigen(liste.pruefungen)).toBe(false);
  });

  test("gar kein Artikel ist ein Mangel", async () => {
    const liste = await pruefungen({ deal: deal(), kontakte: [fertig("k1")] });
    expect(nr(liste, 1).details.join(" ")).toContain("kein Artikel");
  });
});

describe("Prüfung 2 · Größen", () => {
  test("eine fehlende Größe nennt Person und Größenart", async () => {
    const liste = await pruefungen({
      deal: deal(),
      positionen: [jacke.position],
      produkte: [jacke.produkt],
      kontakte: [fertig("k1"), kontakt("k2")],
    });

    expect(nr(liste, 2).stand).toBe("gefallen");
    const text = nr(liste, 2).details.join(" ");
    expect(text).toContain("ZZ Person k2");
    expect(text).toContain("Oberteil");
    // Wer eingetragen hat, taucht nicht als Mangel auf.
    expect(text).not.toContain("ZZ Person k1");
  });

  test("eine veraltete Größe zählt als Mangel", async () => {
    const liste = await pruefungen({
      deal: deal(),
      positionen: [jacke.position],
      produkte: [jacke.produkt],
      kontakte: [fertig("k1", { groesse_zuletzt_bestaetigt_am: "2024-01-01" })],
    });
    expect(nr(liste, 2).details.join(" ")).toContain("veraltet");
  });

  test("wer ausgeschlossen ist, fehlt nicht", async () => {
    // „Bekommt diesmal nichts" hängt am Deal und gilt nur für diesen Vorgang.
    // Im Feld stehen HubSpot-Record-IDs, und die sind Zahlen – `ids()` liest
    // auch nur Zahlen daraus. Deshalb tragen die Kontakte hier echte IDs.
    const liste = await pruefungen({
      deal: deal({ ausgeschlossene_spieler: "222" }),
      positionen: [jacke.position],
      produkte: [jacke.produkt],
      kontakte: [fertig("111"), kontakt("222")],
    });

    expect(liste.zeilen.map((z) => z.person)).toEqual(["111"]);
    expect(nr(liste, 2).stand).toBe("bestanden");
  });

  test("mehrere Ausgeschlossene, wie HubSpot sie schreibt", async () => {
    const liste = await pruefungen({
      deal: deal({ ausgeschlossene_spieler: "222, 333" }),
      positionen: [jacke.position],
      produkte: [jacke.produkt],
      kontakte: [fertig("111"), kontakt("222"), kontakt("333")],
    });
    expect(liste.zeilen.map((z) => z.person)).toEqual(["111"]);
  });
});

describe("Prüfung 3 · Rückennummern", () => {
  const trikot = artikel("p-trikot", "trikot");

  async function mitNummern(...nummern: string[]) {
    return pruefungen({
      deal: deal({ ausstattungsart: "Trikotsatz" }),
      positionen: [trikot.position],
      produkte: [trikot.produkt],
      kontakte: nummern.map((n, i) =>
        kontakt(`k${i}`, {
          trikot: "L",
          groesse_zuletzt_bestaetigt_am: HEUTE,
          trikotnummer: n,
        }),
      ),
    });
  }

  test("nur beim Trikotsatz wird überhaupt geprüft", async () => {
    const liste = await pruefungen({
      deal: deal(), // Weitere Ausstattung
      positionen: [jacke.position],
      produkte: [jacke.produkt],
      kontakte: [fertig("k1")], // ohne Rückennummer
    });
    expect(nr(liste, 3).stand).toBe("bestanden");
    expect(nr(liste, 3).titel).toContain("nur beim Trikotsatz");
  });

  test("eine doppelte Nummer hält auf und nennt beide", async () => {
    const liste = await mitNummern("7", "7");
    expect(nr(liste, 3).stand).toBe("gefallen");
    const text = nr(liste, 3).details.join(" ");
    expect(text).toContain("doppelt");
    expect(text).toContain("ZZ Person k0");
    expect(text).toContain("ZZ Person k1");
  });

  test.for(["0", "100", "abc", ""])("die Nummer %s wird abgewiesen", async (wert) => {
    const liste = await mitNummern(wert);
    expect(nr(liste, 3).stand).toBe("gefallen");
  });

  test("1 bis 99 sind in Ordnung", async () => {
    const liste = await mitNummern("1", "99");
    expect(nr(liste, 3).stand).toBe("bestanden");
  });
});

describe("Prüfung 6 · Lieferadresse und Trainer", () => {
  test.for([
    ["Lieferadresse", { lieferadresse: "" }, "Lieferadresse fehlt"],
    ["Trainer-E-Mail", { trainer_email: "" }, "Trainer-E-Mail fehlt"],
  ] as const)("%s fehlt", async ([, luecke, text]) => {
    const liste = await pruefungen({
      deal: deal(luecke),
      positionen: [jacke.position],
      produkte: [jacke.produkt],
      kontakte: [fertig("k1")],
    });
    expect(nr(liste, 6).details).toContain(text);
  });
});

describe("Ein Größencheck geht an keinen Händler", () => {
  test("es bleibt genau die eine Prüfung, um die es geht", async () => {
    const liste = await pruefungen({
      deal: deal({ ausstattungsart: "Nur Größen erfassen", groessenarten: "trikot" }),
      kontakte: [kontakt("k1")],
    });

    // „Es hängt kein Artikel am Vorgang" wäre hier ein erfundener Mangel.
    expect(liste.pruefungen.map((p) => p.nr)).toEqual([2]);
    expect(nr(liste, 2).stand).toBe("gefallen");
  });

  test("sind die Größen da, ist er fertig", async () => {
    const liste = await pruefungen({
      deal: deal({ ausstattungsart: "Nur Größen erfassen", groessenarten: "trikot" }),
      kontakte: [kontakt("k1", { trikot: "L", groesse_zuletzt_bestaetigt_am: HEUTE })],
    });
    expect(darfBestaetigen(liste.pruefungen)).toBe(true);
  });
});
