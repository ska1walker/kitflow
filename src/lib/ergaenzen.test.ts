import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ergaenzeVorgang, ladeVoranfrage, type ErgaenzungEingabe } from "./ergaenzen";

/**
 * F1b macht aus einer Voranfrage einen laufenden Vorgang. Hier passieren die
 * meisten Schreibvorgänge am Stück, und zwei davon sind schon einmal
 * schiefgegangen:
 *
 * - HubSpot gibt Positionen in beliebiger Reihenfolge zurück. Ohne Sortierung
 *   stehen die Artikel im Formular anders als in F1, und der Trainer trägt die
 *   Artikelnummer beim falschen Artikel ein.
 * - Gibt es zur echten Nummer schon ein Produkt, muss die Position darauf
 *   umgehängt und der Platzhalter stillgelegt werden — sonst stehen zwei
 *   Produkte mit derselben Nummer im Stamm.
 */

type Roh = { id: string; properties: Record<string, string | null> };

const STUFEN = ["Voranfrage", "Größen laufen", "Anfrage raus", "Abgebrochen"];

function deal(stufe = "Voranfrage"): Roh {
  return {
    id: "d1",
    properties: {
      vorgangsnummer: "AUS-2026-001",
      dealstage: `s-${stufe}`,
      mannschaft: "2007",
      ausstattungsart: "Trikotsatz",
      personen_geschaetzt: "16",
      trainer_email: "zz@example.invalid",
    },
  };
}

function platzhalter(n: number, groessenart: string): { position: Roh; produkt: Roh } {
  return {
    position: { id: `li-${n}`, properties: { hs_product_id: `pr-${n}`, quantity: "1" } },
    produkt: {
      id: `pr-${n}`,
      properties: {
        name: `ZZ Artikel ${n}`,
        hs_sku: `VOR-AUS-2026-001-${n}`,
        hersteller: "adidas",
        groessenart,
        aktiv: "false",
      },
    },
  };
}

type Welt = {
  deal: Roh;
  positionen: Roh[];
  produkte: Roh[];
  /** Positionen kommen in dieser Reihenfolge zurück – HubSpot sortiert nicht. */
  reihenfolge?: string[];
  /** Ein Produkt, das es zu einer echten Nummer schon gibt. */
  fremdesProdukt?: Roh;
  kontakte?: Roh[];
};

/** Ein `fetch`, das man auch selbst aufrufen kann — der letzte Test staffelt zwei. */
type Netz = ReturnType<typeof vi.fn<(url: string, o?: RequestInit) => Promise<Response>>>;

let netz: Netz;

function stelle(welt: Welt) {
  const ids = welt.reihenfolge ?? welt.positionen.map((p) => p.id);
  const positionen = ids.map((id) => welt.positionen.find((p) => p.id === id)!);

  netz = vi.fn(async (url: string, o?: RequestInit) => {
    const pfad = String(url);
    const koerper = o?.body ? String(o.body) : undefined;

    if (pfad.includes("/pipelines/deals")) {
      return Response.json({
        results: [
          {
            id: "p1",
            label: "Ausstattung",
            stages: STUFEN.map((label, i) => ({ id: `s-${label}`, label, displayOrder: i })),
          },
        ],
      });
    }
    if (pfad.includes("/objects/deals/search")) return Response.json({ results: [welt.deal] });
    if (pfad.includes("/objects/products/search")) {
      return Response.json({ results: welt.fremdesProdukt ? [welt.fremdesProdukt] : [] });
    }
    if (pfad.includes("/objects/contacts/search")) {
      return Response.json({ results: welt.kontakte ?? [] });
    }
    if (pfad.includes("/associations/line_items")) {
      return Response.json({ results: positionen.map((p) => ({ toObjectId: p.id })) });
    }
    if (pfad.includes("/associations/contacts")) return Response.json({ results: [] });

    if (pfad.includes("/objects/line_items/batch/read")) {
      const wunsch: string[] = koerper ? JSON.parse(koerper).inputs.map((i: { id: string }) => i.id) : [];
      // Batch-Lesen liefert in der Reihenfolge der Anfrage – die Sortierung
      // muss aus dem SKU kommen, nicht von HubSpot.
      return Response.json({ results: wunsch.map((id) => positionen.find((p) => p.id === id)!) });
    }
    if (pfad.includes("/objects/products/batch/read")) {
      const wunsch: string[] = koerper ? JSON.parse(koerper).inputs.map((i: { id: string }) => i.id) : [];
      return Response.json({
        results: welt.produkte.filter((p) => wunsch.includes(p.id)),
      });
    }
    return Response.json({ id: "1", properties: {} });
  });

  vi.stubGlobal("fetch", netz);
}

/** Die PATCHes an ein Objekt, als Eigenschaften. */
function patches(teil: string): Record<string, string>[] {
  return netz.mock.calls
    .filter(([url, o]) => String(url).includes(teil) && (o as RequestInit)?.method === "PATCH")
    .map(([, o]) => JSON.parse(String((o as RequestInit).body)).properties);
}

function eingabe(artikel: ErgaenzungEingabe["artikel"]): ErgaenzungEingabe {
  return {
    groessenFrist: "2026-09-30",
    lieferadresse: "ZZ 1",
    initialenNoetig: false,
    sponsor: "",
    hinweise: "",
    artikel,
  };
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

describe("Die Artikel stehen in der Reihenfolge der Meldung", () => {
  test("auch wenn HubSpot sie verdreht zurückgibt", async () => {
    const a = platzhalter(0, "trikot");
    const b = platzhalter(1, "shorts");
    const c = platzhalter(2, "schuhe");
    stelle({
      deal: deal(),
      positionen: [a.position, b.position, c.position],
      produkte: [a.produkt, b.produkt, c.produkt],
      reihenfolge: ["li-2", "li-0", "li-1"],
    });

    const v = await ladeVoranfrage("AUS-2026-001");
    // Sonst trägt der Trainer die Artikelnummer beim falschen Artikel ein.
    expect(v?.artikel.map((x) => x.positionId)).toEqual(["li-0", "li-1", "li-2"]);
  });

  test("ein Platzhalter gilt als „Nummer fehlt noch“", async () => {
    const a = platzhalter(0, "trikot");
    stelle({ deal: deal(), positionen: [a.position], produkte: [a.produkt] });

    const v = await ladeVoranfrage("AUS-2026-001");
    expect(v?.artikel[0].platzhalter).toBe(true);
    expect(v?.artikel[0].herstellernummer).toBe("");
  });
});

describe("Ist der Vorgang über die Voranfrage hinaus", () => {
  test.for(["Größen laufen", "Anfrage raus", "Abgebrochen"])("Stufe %s: nichts zu tun", async (stufe) => {
    const a = platzhalter(0, "trikot");
    stelle({ deal: deal(stufe), positionen: [a.position], produkte: [a.produkt] });
    expect(await ladeVoranfrage("AUS-2026-001")).toBeNull();
  });
});

describe("Die echte Artikelnummer nachtragen", () => {
  const a = platzhalter(0, "trikot");
  const artikelEingabe = [
    {
      positionId: "li-0",
      produktId: "pr-0",
      herstellernummer: "IN0410",
      farbe: "schwarz",
      fuer: "alle" as const,
      beflockung: "Standard",
      beflockungAbweichend: "",
    },
  ];

  test("gibt es die Nummer noch nicht, wird der Platzhalter echt", async () => {
    stelle({
      deal: deal(),
      positionen: [a.position],
      produkte: [a.produkt],
      kontakte: [{ id: "111", properties: { firstname: "ZZ", lastname: "Eins", team: "2007" } }],
    });

    await ergaenzeVorgang("AUS-2026-001", eingabe(artikelEingabe));

    const [produkt] = patches("/objects/products/pr-0");
    expect(produkt.hs_sku).toBe("IN0410");
    expect(produkt.aktiv).toBe("true");
    // Die Position zeigt weiter auf dasselbe Produkt, also kein Umhängen.
    expect(patches("/objects/line_items/li-0")).toHaveLength(0);
  });

  test("gibt es sie schon, wird umgehängt und der Platzhalter stillgelegt", async () => {
    stelle({
      deal: deal(),
      positionen: [a.position],
      produkte: [a.produkt],
      fremdesProdukt: { id: "pr-alt", properties: { hs_sku: "IN0410" } },
      kontakte: [{ id: "111", properties: { firstname: "ZZ", lastname: "Eins", team: "2007" } }],
    });

    await ergaenzeVorgang("AUS-2026-001", eingabe(artikelEingabe));

    // Sonst stünden zwei Produkte mit derselben Nummer im Stamm.
    const [platz] = patches("/objects/products/pr-0");
    expect(platz.aktiv).toBe("false");
    expect(platz.name).toContain("ersetzt");

    const [echt] = patches("/objects/products/pr-alt");
    expect(echt.hs_sku).toBe("IN0410");
    expect(echt.aktiv).toBe("true");

    // Und die Position zeigt jetzt auf das echte Produkt.
    expect(patches("/objects/line_items/li-0")[0].hs_product_id).toBe("pr-alt");
  });
});

describe("Wohin der Vorgang danach geht", () => {
  const a = platzhalter(0, "trikot");
  const artikelEingabe = [
    {
      positionId: "li-0",
      produktId: "pr-0",
      herstellernummer: "IN0410",
      farbe: "schwarz",
      fuer: "alle" as const,
      beflockung: "Standard",
      beflockungAbweichend: "",
    },
  ];

  test("mit Leuten auf „Größen laufen“", async () => {
    stelle({
      deal: deal(),
      positionen: [a.position],
      produkte: [a.produkt],
      kontakte: [{ id: "111", properties: { firstname: "ZZ", lastname: "Eins", team: "2007" } }],
    });

    const e = await ergaenzeVorgang("AUS-2026-001", eingabe(artikelEingabe));
    expect(e?.ohnePersonen).toBe(false);
    expect(patches("/objects/deals/d1")[0].dealstage).toBe("s-Größen laufen");
  });

  test("ohne Leute auf „Abgebrochen“", async () => {
    stelle({ deal: deal(), positionen: [a.position], produkte: [a.produkt], kontakte: [] });

    const e = await ergaenzeVorgang("AUS-2026-001", eingabe(artikelEingabe));
    expect(e?.ohnePersonen).toBe(true);
    expect(patches("/objects/deals/d1")[0].dealstage).toBe("s-Abgebrochen");
  });

  test("scheitert die Kontaktsuche, bleibt die Stufe stehen", async () => {
    stelle({ deal: deal(), positionen: [a.position], produkte: [a.produkt] });
    // Die Suche antwortet nicht – das ist keine leere Mannschaft.
    const echtesNetz = netz;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, o?: RequestInit) => {
        if (String(url).includes("/objects/contacts/search")) {
          return new Response("{}", { status: 503 });
        }
        return echtesNetz(url, o);
      }),
    );

    expect(await ergaenzeVorgang("AUS-2026-001", eingabe(artikelEingabe))).toBeNull();
    // Der Vorgang steht noch, also darf die Stufe nicht wandern.
    expect(patches("/objects/deals/d1")).toHaveLength(0);
  });
});
