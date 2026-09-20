import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { bestaetigeListe, gibFrei } from "./vorgaenge";
import { istGedeckt } from "./ansicht";
import { offeneFreigaben } from "./vorgaenge-db";
import { artikel, kontakt, person, satz } from "../../test/satz";
import { raeumeUmgebung, stelleUmgebung, stelleWelt } from "../../test/welt";

/**
 * Die Löcher aus der Ablaufprüfung vom 20.09.2026.
 *
 * Alle drei waren nicht theoretisch: jedes ließ sich mit einem einzigen Klick
 * auf `/sparte` auslösen, und das erste im einzigen Weg, den niemand zurückholt.
 */

const HAENDLER = "11teamsports|Herr Bormann|bormann@example.invalid";

function welt(mehr: Parameters<typeof satz>[0] = {}) {
  return stelleWelt({
    vorgang: satz({
      nummer: "AUS-2026-001",
      stufe: 1,
      trainerEmail: "trainer@example.invalid",
      lieferadresse: "Am Sportplatz 14",
      artikel: [artikel({ id: "a1", bezeichnung: "Trainingsjacke", groessenart: "oberteil" })],
      personen: [person({ id: "p1", kontaktId: "111" })],
      ...mehr,
    }),
    kontakte: [kontakt("111", { firstname: "Anna", lastname: "Klein", trainingsanzug_oberteil: "M" })],
  });
}

function briefe(aufrufe: { host: string }[]): number {
  return aufrufe.filter((a) => a.host === "resend").length;
}

beforeEach(() => {
  stelleUmgebung();
  process.env.RESEND_API_KEY = "zz-test";
  process.env.KITFLOW_BASIS = "https://zz.example.invalid";
  process.env.HAENDLER = HAENDLER;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  raeumeUmgebung();
  delete process.env.RESEND_API_KEY;
  delete process.env.KITFLOW_BASIS;
  delete process.env.HAENDLER;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ *
 * Fund 1 · Die Freigabe hängt an der Stufe
 * ------------------------------------------------------------------ */

describe("Eine offene Freigabe gilt nur auf Stufe 1", () => {
  test("ein abgebrochener Vorgang gibt nichts mehr frei", async () => {
    // So entsteht der Fall: der Trainer bestätigt, danach setzt die
    // Spartenleitung den Vorgang von Hand auf 9. `freigabe_stand` bleibt dabei
    // `offen` — vor dem 20.09.2026 schickte ein Klick darauf M4 an Bormann und
    // Hillebrecht und holte den Vorgang auf Stufe 2 zurück.
    const w = welt({ stufe: 9, freigabe: { stand: "offen" } });

    const ergebnis = await gibFrei("AUS-2026-001", { art: "mensch", email: "kai@example.invalid" });

    expect(ergebnis).toEqual({ ok: false, grund: "nicht_stufe1" });
    expect(briefe(w.aufrufe), "es ging eine Mail raus").toBe(0);
  });

  test("ein Vorgang auf Stufe 2 ebenso wenig — keine zweite Anfrage", async () => {
    const w = welt({ stufe: 2, freigabe: { stand: "offen" } });

    const ergebnis = await gibFrei("AUS-2026-001", { art: "mensch", email: "kai@example.invalid" });

    expect(ergebnis).toEqual({ ok: false, grund: "nicht_stufe1" });
    expect(briefe(w.aufrufe)).toBe(0);
  });

  test("die Karte auf /sparte verschwindet mit der Stufe", async () => {
    welt({ stufe: 9, freigabe: { stand: "offen" } });
    // Ohne den Stufenfilter stünde sie da und lüde zum Klick ein.
    expect(await offeneFreigaben()).toEqual([]);
  });

  test("auf Stufe 1 geht sie weiterhin durch", async () => {
    const w = welt();

    await bestaetigeListe("AUS-2026-001", "Am Sportplatz 14", "");
    const ergebnis = await gibFrei("AUS-2026-001", { art: "mensch", email: "kai@example.invalid" });

    expect(ergebnis.ok).toBe(true);
    expect(briefe(w.aufrufe)).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ *
 * Fund 2 · Wunschtermin und Stufenfrist sind zweierlei
 * ------------------------------------------------------------------ */

describe("Der Wunschtermin kommt aus seiner eigenen Spalte", () => {
  test("er steht wörtlich in der Händleranfrage", async () => {
    const w = welt({ wunschtermin: "2026-11-15" });

    await bestaetigeListe("AUS-2026-001", "Am Sportplatz 14", "");
    await gibFrei("AUS-2026-001", { art: "mensch", email: "kai@example.invalid" });

    const anfrage = w.aufrufe
      .filter((a) => a.host === "resend")
      .map((a) => a.koerper as { subject: string; text: string })
      .find((b) => b.subject.includes("Angebotsanfrage"));
    expect(anfrage?.text).toContain("2026-11-15");
  });

  test("eine Stufenfrist wandert NICHT in die Mail", async () => {
    // Der gefährliche Fall: `stufe_frist` heißt „Frist der Kaskadenstufe“ und
    // wurde bis Migration 007 als Liefertermin an den Händler geschickt. Wer
    // sie je für ihren dokumentierten Zweck füllte — eine Frist für die
    // Sponsorensuche —, hätte sie als Wunschtermin in einer Mail wiedergefunden.
    const w = welt({ stufeFrist: "2026-10-01" });

    await bestaetigeListe("AUS-2026-001", "Am Sportplatz 14", "");
    await gibFrei("AUS-2026-001", { art: "mensch", email: "kai@example.invalid" });

    const anfrage = w.aufrufe
      .filter((a) => a.host === "resend")
      .map((a) => a.koerper as { subject: string; text: string })
      .find((b) => b.subject.includes("Angebotsanfrage"));
    expect(anfrage?.text).not.toContain("2026-10-01");
    expect(anfrage?.text).toContain("nach Absprache");
  });
});

/* ------------------------------------------------------------------ *
 * Fund 4 · Die Deckung
 * ------------------------------------------------------------------ */

describe("Deckung", () => {
  test("ohne gewählten Händler gibt es keinen Betrag und damit keine Deckung", () => {
    expect(istGedeckt(satz({ finanzen: { eingangVerein: 5000 } }))).toBe(false);
  });

  test("eine Zusage allein deckt nicht", () => {
    // Kais Regel wörtlich: „Eine Zusage allein macht nie bestellbar.“
    expect(
      istGedeckt(
        satz({
          lieferantGewaehlt: "11teamsports",
          angebote: { intersport: {}, elfteamsports: { betrag: 800 } },
          finanzen: { zusageSponsor: 1000 },
        }),
      ),
    ).toBe(false);
  });

  test("eingegangenes Geld deckt, wenn es reicht", () => {
    const basis = {
      lieferantGewaehlt: "11teamsports",
      angebote: { intersport: {}, elfteamsports: { betrag: 800 } },
    } as const;

    expect(istGedeckt(satz({ ...basis, finanzen: { eingangVerein: 799 } }))).toBe(false);
    expect(istGedeckt(satz({ ...basis, finanzen: { eingangVerein: 800 } }))).toBe(true);
    // Verein und Spartenbudget zusammen zaehlen.
    expect(
      istGedeckt(satz({ ...basis, finanzen: { eingangVerein: 500, spartenbudgetFreigegeben: 300 } })),
    ).toBe(true);
    // Vorkasse allein genuegt ebenfalls.
    expect(istGedeckt(satz({ ...basis, finanzen: { vorkasseBestaetigt: 800 } }))).toBe(true);
  });

  test("ein Angebot ohne Betrag deckt nicht", () => {
    expect(
      istGedeckt(
        satz({
          lieferantGewaehlt: "11teamsports",
          angebote: { intersport: {}, elfteamsports: {} },
          finanzen: { eingangVerein: 5000 },
        }),
      ),
    ).toBe(false);
  });
});
