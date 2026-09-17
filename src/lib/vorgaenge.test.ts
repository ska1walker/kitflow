import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ladeVorgang } from "./vorgaenge";

/**
 * Eine Störung bei HubSpot ist kein toter Link.
 *
 * Vorher gab `ladeVorgang` bei jedem Ausfall den Beispiel-Vorgang zurück; die
 * beiden Seiten verwarfen ihn und zeigten „Dieser Link funktioniert nicht".
 * Der Trainer hätte den Fehler bei sich gesucht und den Link neu angefordert,
 * obwohl mit ihm alles in Ordnung war.
 *
 * „Gibt es nicht" muss dagegen weiter dieselbe Antwort bekommen wie ein
 * falsches Token — wer rät, soll aus der Antwort nichts lernen.
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

function netz(dealsuche: () => Response) {
  return vi.fn(async (url: string) => {
    const pfad = String(url);
    if (pfad.includes("/pipelines/deals")) return Response.json(pipelines());
    if (pfad.includes("/objects/deals/search")) return dealsuche();
    if (pfad.includes("/associations/")) return Response.json({ results: [] });
    if (pfad.includes("/batch/read")) return Response.json({ results: [] });
    return Response.json({ results: [] });
  });
}

beforeEach(() => {
  process.env.HUBSPOT_TOKEN = "zz-test";
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((f: () => void) => {
    f();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.HUBSPOT_TOKEN;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("HubSpot antwortet nicht", () => {
  test.for([
    ["Rate-Limit", () => new Response("{}", { status: 429 })],
    ["Störung", () => new Response("{}", { status: 503 })],
    ["Verbindung weg", null],
  ] as const)("%s ist „gestört“, nicht „unbekannt“", async ([, antwort]) => {
    vi.stubGlobal(
      "fetch",
      antwort === null
        ? vi.fn(async () => {
            throw new Error("socket hang up");
          })
        : netz(antwort),
    );
    expect(await ladeVorgang("AUS-2026-001")).toEqual({ stand: "gestoert" });
  });

  test("ohne Anmeldung ebenfalls gestört", async () => {
    delete process.env.HUBSPOT_TOKEN;
    expect(await ladeVorgang("AUS-2026-001")).toEqual({ stand: "gestoert" });
  });
});

describe("Den Vorgang gibt es nicht", () => {
  test("eine leere Trefferliste heißt „unbekannt“", async () => {
    vi.stubGlobal("fetch", netz(() => Response.json({ results: [] })));
    // Dieselbe Antwort wie bei einem falschen Token – Absicht.
    expect(await ladeVorgang("AUS-2026-999")).toEqual({ stand: "unbekannt" });
  });

  test("eine fremde Nummer im Treffer heißt „unbekannt“", async () => {
    // Die Suche ist unscharf; der Treffer muss zur Nummer im Link passen.
    vi.stubGlobal(
      "fetch",
      netz(() =>
        Response.json({
          results: [{ id: "1", properties: { vorgangsnummer: "AUS-2026-002", dealstage: "s1" } }],
        }),
      ),
    );
    expect(await ladeVorgang("AUS-2026-001")).toEqual({ stand: "unbekannt" });
  });

  test("eine unbekannte Stufe heißt „unbekannt“", async () => {
    vi.stubGlobal(
      "fetch",
      netz(() =>
        Response.json({
          results: [{ id: "1", properties: { vorgangsnummer: "AUS-2026-001", dealstage: "xx" } }],
        }),
      ),
    );
    expect(await ladeVorgang("AUS-2026-001")).toEqual({ stand: "unbekannt" });
  });
});

describe("Den Vorgang gibt es", () => {
  test("kommt er mit Nummer und Stufe zurück", async () => {
    vi.stubGlobal(
      "fetch",
      netz(() =>
        Response.json({
          results: [
            {
              id: "1",
              properties: {
                vorgangsnummer: "AUS-2026-001",
                dealstage: "s1",
                mannschaft: "2007",
                ausstattungsart: "Weitere Ausstattung",
              },
            },
          ],
        }),
      ),
    );

    const e = await ladeVorgang("AUS-2026-001");
    expect(e.stand).toBe("da");
    if (e.stand !== "da") return;
    expect(e.vorgang.nummer).toBe("AUS-2026-001");
    expect(e.vorgang.stufe).toBe(1);
    // Kein einziges Feld aus den Beispieldaten.
    expect(e.vorgang.quelle).toBe("hubspot");
  });
});
