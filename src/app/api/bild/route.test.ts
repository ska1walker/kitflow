import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GET } from "./route";
import { signiere } from "@/lib/links";
import { artikel, kontakt, person, satz } from "../../../../test/satz";
import { raeumeUmgebung, stelleUmgebung, stelleWelt } from "../../../../test/welt";

/**
 * `/api/bild` ist die einzige Stelle, an der Bytes aus der Ablage das Haus
 * verlassen. Der Eimer ist privat; was hier durchkommt, kommt überhaupt
 * irgendwo an.
 *
 * Zwei Dinge sind hier Absicht und werden unten festgenagelt:
 *
 * - **Der Pfad kommt nie von außen.** Die Anfrage nennt Vorgang, Art und
 *   allenfalls eine Artikel-ID; den Pfad schlägt die Route in der Datenbank
 *   nach. Ein Pfad als Parameter wäre ein Leseschlüssel für den ganzen Eimer.
 * - **Immer 404, nie 403.** Ein „verboten" verriete, dass es das Bild gibt.
 */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x07]);

function welt() {
  return stelleWelt({
    vorgang: satz({
      nummer: "AUS-2026-001",
      stufe: 1,
      sponsorLogo: "sponsor/v1.png",
      artikel: [artikel({ id: "a1", bezeichnung: "Jacke", groessenart: "oberteil", bild: "artikel/a1.png" })],
      personen: [person({ id: "p1", kontaktId: "111" })],
    }),
    kontakte: [kontakt("111", { firstname: "Anna", lastname: "Klein" })],
    ablage: {
      "sponsor/v1.png": { bytes: PNG, typ: "image/png" },
      "artikel/a1.png": { bytes: PNG, typ: "image/png" },
    },
  });
}

function anfrage(suche: Record<string, string>): Request {
  const u = new URL("https://zz.example.invalid/api/bild");
  for (const [k, v] of Object.entries(suche)) u.searchParams.set(k, v);
  return new Request(u);
}

beforeEach(() => {
  stelleUmgebung();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  raeumeUmgebung();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("wer ein Bild bekommt", () => {
  test("der Trainer mit seinem Token", async () => {
    welt();
    const antwort = await GET(
      anfrage({ vorgang: "AUS-2026-001", art: "sponsor", token: signiere("status", "AUS-2026-001")! }),
    );

    expect(antwort.status).toBe(200);
    expect(antwort.headers.get("content-type")).toBe("image/png");
    expect(Array.from(new Uint8Array(await antwort.arrayBuffer()))).toEqual(Array.from(PNG));
  });

  test("der Spieler mit seinem persoenlichen Token", async () => {
    welt();
    const antwort = await GET(
      anfrage({
        vorgang: "AUS-2026-001",
        art: "artikel",
        id: "a1",
        person: "111",
        token: signiere("groessen", "AUS-2026-001", "111")!,
      }),
    );

    expect(antwort.status).toBe(200);
  });
});

describe("wer keins bekommt", () => {
  test("ohne Token", async () => {
    welt();
    expect((await GET(anfrage({ vorgang: "AUS-2026-001", art: "sponsor" }))).status).toBe(404);
  });

  test("mit erfundenem Token", async () => {
    welt();
    const antwort = await GET(
      anfrage({ vorgang: "AUS-2026-001", art: "sponsor", token: "x".repeat(43) }),
    );
    expect(antwort.status).toBe(404);
  });

  test("mit dem Token eines anderen Vorgangs", async () => {
    welt();
    const antwort = await GET(
      anfrage({ vorgang: "AUS-2026-001", art: "sponsor", token: signiere("status", "AUS-2026-999")! }),
    );
    expect(antwort.status).toBe(404);
  });

  test("der Spieler-Token gilt nicht fuer eine fremde Person", async () => {
    welt();
    // Gueltig signiert — aber fuer 111, nicht fuer 222.
    const antwort = await GET(
      anfrage({
        vorgang: "AUS-2026-001",
        art: "artikel",
        id: "a1",
        person: "222",
        token: signiere("groessen", "AUS-2026-001", "111")!,
      }),
    );
    expect(antwort.status).toBe(404);
  });

  test("eine Artikel-ID, die nicht zu diesem Vorgang gehoert", async () => {
    welt();
    const antwort = await GET(
      anfrage({
        vorgang: "AUS-2026-001",
        art: "artikel",
        id: "fremd",
        token: signiere("status", "AUS-2026-001")!,
      }),
    );
    expect(antwort.status).toBe(404);
  });

  test("ein Pfad als Parameter bringt gar nichts", async () => {
    welt();
    // Der einzige Weg zu einem Pfad fuehrt ueber die Datenbank. Wer einen
    // mitschickt, bekommt trotzdem nur, was zu `art` hinterlegt ist — hier
    // nichts, weil `art` ungueltig ist.
    const antwort = await GET(
      anfrage({
        vorgang: "AUS-2026-001",
        art: "../../andere/geheim.png",
        pfad: "sponsor/v1.png",
        token: signiere("status", "AUS-2026-001")!,
      }),
    );
    expect(antwort.status).toBe(404);
  });

  test("kein Bild hinterlegt heisst ebenfalls 404", async () => {
    stelleWelt({
      vorgang: satz({ nummer: "AUS-2026-001", stufe: 1, personen: [] }),
      kontakte: [],
    });
    const antwort = await GET(
      anfrage({ vorgang: "AUS-2026-001", art: "sponsor", token: signiere("status", "AUS-2026-001")! }),
    );
    expect(antwort.status).toBe(404);
  });
});
