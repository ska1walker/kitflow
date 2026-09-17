import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { meldeBedarf, type BedarfEingabe } from "./bedarf";

/**
 * Der Fall, um den es hier geht: die Suche nach den Kontakten einer Mannschaft
 * scheitert — Rate-Limit, Störung, abgerissene Verbindung.
 *
 * Vorher wurde daraus eine leere Liste. Der Vorgang landete sofort auf Stufe 9
 * „Abgebrochen", und der Trainer las, zu seiner Mannschaft sei niemand in
 * HubSpot hinterlegt. Das war bei einem Rate-Limit schlicht gelogen, ließ sich
 * nicht zurücknehmen und hätte ihn zur Geschäftsstelle geschickt.
 */

const STUFEN = ["Voranfrage", "Größen laufen", "Abgebrochen"];

function pipelines() {
  return {
    results: [
      {
        id: "p1",
        label: "Ausstattung",
        stages: STUFEN.map((label, i) => ({ id: `s${i}`, label, displayOrder: i })),
      },
    ],
  };
}

function eingabe(): BedarfEingabe {
  return {
    modus: "vollstaendig",
    vorname: "ZZ",
    nachname: "Test",
    email: "zz@example.invalid",
    telefon: "0",
    teams: ["2007"],
    mannschaftscode: "",
    ausstattungsart: "Weitere Ausstattung",
    artikel: [],
    groessenarten: [],
    personenZahl: 0,
    groessenFrist: "2026-09-30",
    lieferadresse: "ZZ 1",
    initialenNoetig: false,
    sponsor: "",
    hinweise: "",
  };
}

/** Beantwortet jeden Pfad; die Kontaktsuche bekommt eine eigene Antwort. */
function netz(kontaktsuche: () => Response) {
  return vi.fn(async (url: string) => {
    const pfad = String(url);
    if (pfad.includes("/pipelines/deals")) return Response.json(pipelines());
    if (pfad.includes("/objects/contacts/search")) return kontaktsuche();
    if (pfad.includes("/search")) return Response.json({ results: [] });
    return Response.json({ id: "neu", properties: {} });
  });
}

let fetchFake: ReturnType<typeof vi.fn>;

function angelegteVorgaenge() {
  return fetchFake.mock.calls.filter(
    ([url, o]) => String(url).endsWith("/objects/deals") && (o as RequestInit)?.method === "POST",
  );
}

beforeEach(() => {
  process.env.HUBSPOT_TOKEN = "zz-test";
  process.env.LINK_SECRET = "x".repeat(32);
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((f: () => void) => {
    f();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.HUBSPOT_TOKEN;
  delete process.env.LINK_SECRET;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("wenn die Kontaktsuche scheitert", () => {
  test.for([
    ["dauerhaftes Rate-Limit", () => new Response("{}", { status: 429 })],
    ["Störung bei HubSpot", () => new Response("{}", { status: 503 })],
  ] as const)("%s: es entsteht kein Vorgang", async ([, antwort]) => {
    fetchFake = netz(antwort);
    vi.stubGlobal("fetch", fetchFake);

    expect(await meldeBedarf(eingabe())).toBeNull();
    // Nicht „ein abgebrochener Vorgang", sondern gar keiner: das Formular
    // sagt dann „bitte in einer Minute noch einmal".
    expect(angelegteVorgaenge()).toHaveLength(0);
  });
});

describe("wenn die Mannschaft wirklich leer ist", () => {
  test("entsteht ein Vorgang, und er ist abgebrochen", async () => {
    fetchFake = netz(() => Response.json({ results: [] }));
    vi.stubGlobal("fetch", fetchFake);

    const ergebnis = await meldeBedarf(eingabe());

    // Das ist der richtige Abbruch: es gibt niemanden zu fragen.
    expect(ergebnis?.ohnePersonen).toBe(true);
    const [, gesendet] = angelegteVorgaenge()[0];
    const koerper = JSON.parse(String((gesendet as RequestInit).body));
    expect(koerper.properties.dealstage).toBe("s2"); // Abgebrochen
  });
});

describe("wenn die Mannschaft Leute hat", () => {
  test("läuft der Vorgang auf Stufe 1 und alle hängen dran", async () => {
    fetchFake = netz(() =>
      Response.json({
        results: [
          { id: "11", properties: { firstname: "ZZ", lastname: "Eins", team: "2007" } },
          { id: "12", properties: { firstname: "ZZ", lastname: "Zwei", team: "2007" } },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchFake);

    const ergebnis = await meldeBedarf(eingabe());

    expect(ergebnis?.ohnePersonen).toBe(false);
    expect(ergebnis?.personen.map((p) => p.name)).toEqual(["ZZ Eins", "ZZ Zwei"]);
    const [, gesendet] = angelegteVorgaenge()[0];
    expect(JSON.parse(String((gesendet as RequestInit).body)).properties.dealstage).toBe("s1");

    const verknuepft = fetchFake.mock.calls.filter(
      ([url, o]) => String(url).includes("/associations/") && (o as RequestInit)?.method === "PUT",
    );
    expect(verknuepft).toHaveLength(2);
  });
});
