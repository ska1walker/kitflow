import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ladeGroessenAbfrage, ladeListe } from "./vorgaenge";
import { artikel, deal, kontakt, stelleHubSpot, stufenId } from "../../test/hubspot-fake";

/**
 * F2 fragt Größen ab, F3 zeigt dieselben Größen als Spalten. Weichen die
 * beiden voneinander ab, fragt das Formular etwas anderes, als die Liste
 * anzeigt — und der Trainer bestätigt eine Liste mit Lücken, die er nie
 * füllen konnte.
 *
 * Deshalb steht die Antwort seit „Nur Größen erfassen" in einem Helfer, den
 * beide benutzen. Diese Tests halten die Übereinstimmung fest, nicht den
 * Helfer: sie fragen die echten Einstiegspunkte.
 */

function arten(x: { fragen: { art: string }[] } | { arten: { art: string }[] } | null): string[] {
  if (!x) return [];
  return ("fragen" in x ? x.fragen : x.arten).map((a) => a.art).sort();
}

/** Was F2 fragt und was F3 zeigt — zum Vergleichen nebeneinander. */
async function beideSeiten() {
  const [f2, f3] = await Promise.all([
    ladeGroessenAbfrage("AUS-2026-001", "k1"),
    ladeListe("AUS-2026-001"),
  ]);
  return { f2: arten(f2), f3: arten(f3) };
}

beforeEach(() => {
  process.env.HUBSPOT_TOKEN = "zz-test";
  process.env.LINK_SECRET = "x".repeat(32);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.HUBSPOT_TOKEN;
  delete process.env.LINK_SECRET;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Ein Vorgang mit Artikeln", () => {
  test("F2 und F3 fragen dieselben Größen", async () => {
    const jacke = artikel("p-jacke", "oberteil");
    const hose = artikel("p-hose", "trainingshose");
    stelleHubSpot({
      deal: deal(),
      positionen: [jacke.position, hose.position],
      produkte: [jacke.produkt, hose.produkt],
      kontakte: [kontakt("k1")],
    });

    const { f2, f3 } = await beideSeiten();
    expect(f2).toEqual(["oberteil", "trainingshose"]);
    expect(f3).toEqual(f2);
  });

  test("dieselbe Größenart zweimal wird einmal gefragt", async () => {
    // Trainingsjacke und Regenjacke brauchen beide ein Oberteil.
    const a = artikel("p1", "oberteil");
    const b = artikel("p2", "oberteil");
    stelleHubSpot({
      deal: deal(),
      positionen: [a.position, b.position],
      produkte: [a.produkt, b.produkt],
      kontakte: [kontakt("k1")],
    });

    const { f2, f3 } = await beideSeiten();
    expect(f2).toEqual(["oberteil"]);
    expect(f3).toEqual(f2);
  });

  test("ein Artikel ohne Größe wird nicht gefragt", async () => {
    // Ein Ball hat keine Größe – das Feld hätte keine Werte.
    const ball = artikel("p-ball", "ohne");
    const jacke = artikel("p-jacke", "oberteil");
    stelleHubSpot({
      deal: deal(),
      positionen: [ball.position, jacke.position],
      produkte: [ball.produkt, jacke.produkt],
      kontakte: [kontakt("k1")],
    });

    const { f2, f3 } = await beideSeiten();
    expect(f2).toEqual(["oberteil"]);
    expect(f3).toEqual(f2);
  });
});

describe("Ein Vorgang ohne Artikel („Nur Größen erfassen“)", () => {
  test("gefragt wird, was am Deal steht — in F2 wie in F3", async () => {
    stelleHubSpot({
      deal: deal({ ausstattungsart: "Nur Größen erfassen", groessenarten: "trikot;schuhe" }),
      kontakte: [kontakt("k1")],
    });

    const { f2, f3 } = await beideSeiten();
    expect(f2).toEqual(["schuhe", "trikot"]);
    expect(f3).toEqual(f2);
  });

  test("Unsinn in groessenarten wird stillschweigend übergangen", async () => {
    stelleHubSpot({
      deal: deal({ ausstattungsart: "Nur Größen erfassen", groessenarten: "trikot;quatsch;ohne;" }),
      kontakte: [kontakt("k1")],
    });

    const { f2, f3 } = await beideSeiten();
    // „ohne" ist keine Frage, „quatsch" gibt es nicht.
    expect(f2).toEqual(["trikot"]);
    expect(f3).toEqual(f2);
  });

  test("gibt es Artikel, zählen die Artikel — nicht das Feld am Deal", async () => {
    const jacke = artikel("p-jacke", "oberteil");
    stelleHubSpot({
      deal: deal({ groessenarten: "trikot;schuhe" }),
      positionen: [jacke.position],
      produkte: [jacke.produkt],
      kontakte: [kontakt("k1")],
    });

    const { f2, f3 } = await beideSeiten();
    expect(f2).toEqual(["oberteil"]);
    expect(f3).toEqual(f2);
  });
});

describe("Nur auf Stufe 1 darf eingetragen werden", () => {
  test.for([
    [0, false],
    [1, true],
    [2, false],
    [9, false],
  ] as const)("Stufe %i: offen = %s", async ([nr, offen]) => {
    const jacke = artikel("p-jacke", "oberteil");
    stelleHubSpot({
      deal: deal({ dealstage: stufenId(nr) }),
      positionen: [jacke.position],
      produkte: [jacke.produkt],
      kontakte: [kontakt("k1")],
    });

    expect((await ladeGroessenAbfrage("AUS-2026-001", "k1"))?.offen).toBe(offen);
    expect((await ladeListe("AUS-2026-001"))?.offen).toBe(offen);
  });
});

describe("Wer nicht am Vorgang hängt", () => {
  test("bekommt nichts zu sehen", async () => {
    const jacke = artikel("p-jacke", "oberteil");
    stelleHubSpot({
      deal: deal(),
      positionen: [jacke.position],
      produkte: [jacke.produkt],
      kontakte: [kontakt("k1")],
    });

    // Der Token bindet die Person schon an den Vorgang; die Verknüpfung wird
    // trotzdem geprüft, damit ein alter Link nach dem Ausscheiden nichts mehr
    // einträgt.
    expect(await ladeGroessenAbfrage("AUS-2026-001", "fremd")).toBeNull();
  });
});
