import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { kontakt, person, satz } from "../../test/satz";
import { raeumeUmgebung, stelleUmgebung, stelleWelt } from "../../test/welt";

/**
 * Die Adresse, unter der der Erinnerungslauf hängt.
 *
 * **Sie steht offen im Netz.** Vercel Cron ruft sie auf wie jeder andere auch;
 * ein Zeitgeber ist kein Zugangsschutz. Käme man ohne Nachweis durch, ließe
 * sich der Lauf im Minutentakt anstoßen — und weil jeder Lauf Mails verschickt,
 * wäre das ein Knopf, mit dem ein Fremder eine ganze Mannschaft zuspammt, bis
 * das Höchstmaß von zwei erreicht ist.
 */

const GEHEIM = "z".repeat(32);

const { GET } = await import("@/app/api/erinnerungen/route");

function anfrage(kopf?: string) {
  return new Request("https://zz.example.invalid/api/erinnerungen", {
    headers: kopf ? { authorization: kopf } : {},
  }) as unknown as Parameters<typeof GET>[0];
}

function welt() {
  return stelleWelt({
    vorgang: satz({
      nummer: "AUS-2026-001",
      stufe: 1,
      groessenFrist: "2026-12-31",
      personen: [person({ id: "p1", kontaktId: "111" })],
    }),
    kontakte: [kontakt("111", { firstname: "Anna", email: "a@example.invalid" })],
    mails: [{ art: "groessen", hs_kontakt_id: "111", gesendet_am: "2026-01-01T10:00:00Z" }],
  });
}

beforeEach(() => {
  stelleUmgebung();
  process.env.RESEND_API_KEY = "zz-test";
  process.env.KITFLOW_BASIS = "https://zz.example.invalid";
  process.env.CRON_SECRET = GEHEIM;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  raeumeUmgebung();
  delete process.env.RESEND_API_KEY;
  delete process.env.KITFLOW_BASIS;
  delete process.env.CRON_SECRET;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Wer den Lauf anstoßen darf", () => {
  test("mit dem richtigen Geheimnis", async () => {
    const { aufrufe } = welt();

    const antwort = await GET(anfrage(`Bearer ${GEHEIM}`));

    expect(antwort.status).toBe(200);
    expect(aufrufe.some((a) => a.host === "resend")).toBe(true);
  });

  test.for([
    ["gar kein Kopf", undefined],
    ["leerer Kopf", ""],
    ["falsches Geheimnis", `Bearer ${"y".repeat(32)}`],
    ["ohne Bearer", GEHEIM],
    ["nur der Anfang stimmt", `Bearer ${"z".repeat(16)}`],
    ["etwas angehängt", `Bearer ${GEHEIM}x`],
  ] as const)("%s: 401, und es geht keine Mail raus", async ([, kopf]) => {
    const { aufrufe } = welt();

    const antwort = await GET(anfrage(kopf));

    expect(antwort.status).toBe(401);
    expect(aufrufe.some((a) => a.host === "resend")).toBe(false);
    // Auch nicht nachgesehen: ein Unbefugter soll nicht einmal Last erzeugen.
    expect(aufrufe).toHaveLength(0);
  });
});

describe("Ohne eingerichtetes Geheimnis", () => {
  test("ist die Antwort 503 und nicht 200", async () => {
    // Der gefährliche Ausgang wäre „kein Geheimnis gesetzt, also jeder darf“.
    delete process.env.CRON_SECRET;
    const { aufrufe } = welt();

    const antwort = await GET(anfrage());

    expect(antwort.status).toBe(503);
    expect(aufrufe).toHaveLength(0);
  });

  test("ein zu kurzes Geheimnis gilt als keines", async () => {
    // „test“ oder „1234“ in der Variable ist kein Schutz.
    process.env.CRON_SECRET = "kurz";
    const { aufrufe } = welt();

    expect((await GET(anfrage("Bearer kurz"))).status).toBe(503);
    expect(aufrufe).toHaveLength(0);
  });
});

describe("Was der Endpunkt zurückgibt", () => {
  test("Zahlen, keine Namen und keine Adressen", async () => {
    // Der Bericht geht ins Log von Vercel. Vorname und Adresse eines Kindes
    // gehören in die Mail und nirgendwo sonst.
    welt();

    const antwort = await GET(anfrage(`Bearer ${GEHEIM}`));
    const text = JSON.stringify(await antwort.json());

    expect(text).toContain('"verschickt":1');
    expect(text).not.toContain("Anna");
    expect(text).not.toContain("a@example.invalid");
    expect(text).not.toContain("AUS-2026-001");
  });

  test("auch das Log trägt keine Namen", async () => {
    welt();
    const zeilen: string[] = [];
    vi.mocked(console.log).mockImplementation((...a: unknown[]) => {
      zeilen.push(a.map(String).join(" "));
    });

    await GET(anfrage(`Bearer ${GEHEIM}`));

    expect(zeilen.join("\n")).toContain("Erinnerungslauf");
    expect(zeilen.join("\n")).not.toContain("Anna");
    expect(zeilen.join("\n")).not.toContain("a@example.invalid");
  });

  test("ein abgebrochener Lauf meldet 503, nicht 200", async () => {
    // Sonst steht im Vercel-Protokoll ein grüner Haken, während nichts lief.
    stelleWelt({ vorgang: satz({ stufe: 1 }), dbGestoert: true });

    const antwort = await GET(anfrage(`Bearer ${GEHEIM}`));

    expect(antwort.status).toBe(503);
    expect(await antwort.json()).toMatchObject({ ok: false, grund: "gestoert" });
  });

  test("der Schlüssel steht in keiner Antwort", async () => {
    welt();

    const antwort = await GET(anfrage(`Bearer ${GEHEIM}`));

    expect(JSON.stringify(await antwort.json())).not.toContain(GEHEIM);
  });
});
