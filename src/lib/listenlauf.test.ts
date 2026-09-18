import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { listenlauf } from "./erinnerung";
import { kontakt, person, satz } from "../../test/satz";
import { raeumeUmgebung, stelleUmgebung, stelleWelt, type Welt } from "../../test/welt";

/**
 * M3 · „die Liste ist so weit“.
 *
 * Ohne sie endete die Kette im Stillen: der Trainer musste von sich aus auf
 * seiner Statusseite nachsehen, ob alle eingetragen haben. Wer das vergisst,
 * lässt den Vorgang liegen — und weil nichts passiert, merkt es niemand.
 *
 * Zwei Anlässe, sonst keiner: alle sind da, oder die Frist ist erreicht. Und
 * höchstens eine je Vorgang; eine zweite wäre Nörgeln.
 */

const HEUTE = new Date("2026-09-20T16:00:00Z");
const TRAINER = "trainer@example.invalid";

function welt(mehr: Partial<Welt> = {}) {
  return stelleWelt({
    vorgang: satz({
      nummer: "AUS-2026-001",
      stufe: 1,
      trainerEmail: TRAINER,
      groessenFrist: "2026-09-30",
      personen: [person({ id: "p1", kontaktId: "111" }), person({ id: "p2", kontaktId: "222" })],
    }),
    kontakte: [
      kontakt("111", { firstname: "Anna", lastname: "Klein", trainingsanzug_oberteil: "M" }),
      kontakt("222", { firstname: "Bernd", lastname: "Groß", trainingsanzug_oberteil: "L" }),
    ],
    mails: [],
    ...mehr,
  });
}

function briefe(aufrufe: { host: string; koerper: unknown }[]) {
  return aufrufe
    .filter((a) => a.host === "resend")
    .map((a) => a.koerper as { to: string[]; subject: string; text: string });
}

beforeEach(() => {
  stelleUmgebung();
  process.env.RESEND_API_KEY = "zz-test";
  process.env.KITFLOW_BASIS = "https://zz.example.invalid";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  raeumeUmgebung();
  delete process.env.RESEND_API_KEY;
  delete process.env.KITFLOW_BASIS;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Wenn alle eingetragen haben", () => {
  test("geht eine Mail an den Trainer", async () => {
    const { aufrufe } = welt();

    const lauf = await listenlauf(HEUTE);

    expect(lauf.ok && lauf.bericht.verschickt).toBe(1);
    const post = briefe(aufrufe);
    expect(post).toHaveLength(1);
    expect(post[0].to).toEqual([TRAINER]);
    expect(post[0].text).toContain("alle 2 ihre Größe eingetragen");
  });

  test("und nur an ihn – nicht an die Mannschaft", async () => {
    const { aufrufe } = welt();
    await listenlauf(HEUTE);

    expect(briefe(aufrufe).map((b) => b.to[0])).toEqual([TRAINER]);
  });

  test("die Mail trägt keine Namen und keine Größen", async () => {
    // Der Entwurf sah eine Tabelle vor. Eine Mail wird weitergeleitet und
    // liegengelassen; die Maße einer Jugendmannschaft gehören hinter den Link.
    const { aufrufe } = welt();
    await listenlauf(HEUTE);

    const text = briefe(aufrufe)[0].text;
    expect(text).not.toContain("Anna");
    expect(text).not.toContain("Klein");
    expect(text).not.toContain("Bernd");
    // Die Größen selbst erst recht nicht.
    expect(text).not.toMatch(/\bOberteil: [SML]\b/);
    expect(text).toContain("nur hinter diesem Link");
  });

  test("sie führt auf die Liste, nicht ins Leere", async () => {
    const { aufrufe } = welt();
    await listenlauf(HEUTE);

    expect(briefe(aufrufe)[0].text).toContain("/b/AUS-2026-001");
  });
});

describe("Wenn die Frist erreicht ist", () => {
  test("geht sie auch mit offenen Größen raus", async () => {
    const { aufrufe } = welt({
      vorgang: satz({
        stufe: 1,
        trainerEmail: TRAINER,
        groessenFrist: "2026-09-20",
        personen: [person({ id: "p1", kontaktId: "111" }), person({ id: "p2", kontaktId: "222" })],
      }),
      kontakte: [
        kontakt("111", { firstname: "Anna", trainingsanzug_oberteil: "M" }),
        kontakt("222", { firstname: "Bernd" }),
      ],
    });

    const lauf = await listenlauf(HEUTE);

    expect(lauf.ok && lauf.bericht.verschickt).toBe(1);
    expect(briefe(aufrufe)[0].text).toContain("eine Größe");
    expect(briefe(aufrufe)[0].subject).toContain("bitte prüfen");
  });

  test("vor der Frist und mit offenen Größen geht nichts", async () => {
    // Der Fall, der am häufigsten eintritt: es läuft noch.
    const { aufrufe } = welt({
      kontakte: [
        kontakt("111", { firstname: "Anna", trainingsanzug_oberteil: "M" }),
        kontakt("222", { firstname: "Bernd" }),
      ],
    });

    const lauf = await listenlauf(HEUTE);

    expect(lauf.ok && lauf.bericht.verschickt).toBe(0);
    expect(lauf.ok && lauf.bericht.nochNichtSoweit).toBe(1);
    expect(briefe(aufrufe)).toHaveLength(0);
  });
});

describe("Höchstens eine je Vorgang", () => {
  test("ein zweiter Lauf schickt nichts nach", async () => {
    const { aufrufe } = welt({
      mails: [{ art: "liste", hs_kontakt_id: null, gesendet_am: "2026-09-19T16:00:00Z" }],
    });

    const lauf = await listenlauf(HEUTE);

    expect(lauf.ok && lauf.bericht.verschickt).toBe(0);
    expect(lauf.ok && lauf.bericht.schonGemeldet).toBe(1);
    expect(briefe(aufrufe)).toHaveLength(0);
  });

  test("der Versand wird ohne Person vermerkt", async () => {
    // M3 geht an den Vorgang, nicht an einen Spieler: `hs_kontakt_id` bleibt
    // leer. Stünde dort jemand, zählte die Mail als dessen Erinnerung.
    const { aufrufe } = welt();
    await listenlauf(HEUTE);

    const spur = aufrufe.find((a) => a.pfad === "mail_versand" && a.methode === "POST")
      ?.koerper as { art: string; hs_kontakt_id: string | null };
    expect(spur.art).toBe("liste");
    expect(spur.hs_kontakt_id).toBeNull();
  });
});

describe("Wen der Lauf auslässt", () => {
  test("Vorgänge auf einer anderen Stufe", async () => {
    const { aufrufe } = welt({
      vorgang: satz({ stufe: 2, trainerEmail: TRAINER, personen: [person({ kontaktId: "111" })] }),
    });

    const lauf = await listenlauf(HEUTE);

    expect(lauf.ok && lauf.bericht.vorgaenge).toBe(0);
    expect(briefe(aufrufe)).toHaveLength(0);
  });

  test("Vorgänge ohne Trainer-Adresse", async () => {
    const { aufrufe } = welt({
      vorgang: satz({
        stufe: 1,
        trainerEmail: undefined,
        groessenFrist: "2026-09-30",
        personen: [person({ kontaktId: "111" })],
      }),
    });

    const lauf = await listenlauf(HEUTE);

    expect(lauf.ok && lauf.bericht.vorgaenge).toBe(0);
    expect(briefe(aufrufe)).toHaveLength(0);
  });

  test("ein Vorgang ohne Personen", async () => {
    // „Alle haben eingetragen“ bei null Personen wäre eine Lüge.
    const { aufrufe } = welt({
      vorgang: satz({ stufe: 1, trainerEmail: TRAINER, groessenFrist: "2026-09-30", personen: [] }),
    });

    const lauf = await listenlauf(HEUTE);

    expect(lauf.ok && lauf.bericht.verschickt).toBe(0);
    expect(briefe(aufrufe)).toHaveLength(0);
  });
});

describe("Wenn etwas ausfällt", () => {
  test("schweigt die Datenbank, läuft gar nichts", async () => {
    const { aufrufe } = welt({ dbGestoert: true });

    const lauf = await listenlauf(HEUTE);

    expect(lauf.ok).toBe(false);
    expect(briefe(aufrufe)).toHaveLength(0);
  });

  test("schweigt die Mailspur, geht nichts raus", async () => {
    // Der gefährliche Fall: „konnte nicht fragen" als „noch keine Mail" zu
    // lesen hiesse, dem Trainer dieselbe Mail jeden Tag zu schicken.
    const { aufrufe } = welt({ mailsGestoert: true });

    const lauf = await listenlauf(HEUTE);

    expect(lauf.ok && lauf.bericht.verschickt).toBe(0);
    expect(lauf.ok && lauf.bericht.fehlgeschlagen).toBe(1);
    expect(briefe(aufrufe)).toHaveLength(0);
  });

  test("schweigt HubSpot, wird nichts behauptet", async () => {
    const { aufrufe } = welt({ hubspotGestoert: true });

    const lauf = await listenlauf(HEUTE);

    expect(lauf.ok && lauf.bericht.verschickt).toBe(0);
    expect(briefe(aufrufe)).toHaveLength(0);
  });

  test("ohne Resend-Schlüssel läuft nichts an", async () => {
    delete process.env.RESEND_API_KEY;
    const { aufrufe } = welt();

    const lauf = await listenlauf(HEUTE);

    expect(!lauf.ok && lauf.grund).toBe("kein-versand");
    expect(aufrufe).toHaveLength(0);
  });
});
