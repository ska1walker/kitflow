import { afterEach, describe, expect, test } from "vitest";
import { darfSparte, spartenAdressen } from "./sparte";

/**
 * Die Liste, die entscheidet, wer alle Vorgänge sieht.
 *
 * Bis hierher hatte kitflow überhaupt keine Anmeldung: jede Seite hing an einem
 * signierten Link und zeigte genau einen Vorgang. `/sparte` zeigt alle. Wer
 * hier durchkommt, sieht jede Mannschaft, jede Frist und jeden Betrag — und
 * darf die Stufe von Hand setzen.
 *
 * Geprüft wird die Regel allein, ohne Netz und ohne Supabase: sie ist der
 * ganze Unterschied zwischen „angemeldet“ und „darf“.
 */

afterEach(() => {
  delete process.env.SPARTE_EMAILS;
});

describe("Wer auf der Liste steht", () => {
  test("eine Adresse aus der Liste darf", () => {
    process.env.SPARTE_EMAILS = "kai.boehm@eintrachtmunster.de";
    expect(darfSparte("kai.boehm@eintrachtmunster.de")).toBe(true);
  });

  test("eine andere nicht", () => {
    process.env.SPARTE_EMAILS = "kai.boehm@eintrachtmunster.de";
    expect(darfSparte("fremder@example.invalid")).toBe(false);
  });

  test("mehrere Adressen, mit Leerzeichen getippt", () => {
    // So sieht eine Variable aus, die ein Mensch in Vercel eingetragen hat.
    process.env.SPARTE_EMAILS = " kai.boehm@eintrachtmunster.de ,  sebastian@example.invalid ";
    expect(spartenAdressen()).toEqual([
      "kai.boehm@eintrachtmunster.de",
      "sebastian@example.invalid",
    ]);
    expect(darfSparte("sebastian@example.invalid")).toBe(true);
  });

  test("Großschreibung ist dieselbe Person", () => {
    // Supabase gibt die Adresse so zurück, wie sie beim Anlegen getippt wurde.
    process.env.SPARTE_EMAILS = "Kai.Boehm@Eintrachtmunster.de";
    expect(darfSparte("kai.boehm@eintrachtmunster.de")).toBe(true);
    expect(darfSparte("KAI.BOEHM@EINTRACHTMUNSTER.DE")).toBe(true);
  });

  test("Leerzeichen um die eingehende Adresse stören nicht", () => {
    process.env.SPARTE_EMAILS = "kai@example.invalid";
    expect(darfSparte("  kai@example.invalid  ")).toBe(true);
  });
});

describe("Wenn die Liste fehlt oder kaputt ist", () => {
  // Der gefährliche Fall: eine vergessene Variable darf nie „alle dürfen“
  // heißen. Dieselbe Regel wie bei LINK_SECRET in links.ts — ohne Schlüssel
  // steht die Anwendung nicht offen, sondern zu.
  test("keine Variable: niemand darf", () => {
    delete process.env.SPARTE_EMAILS;
    expect(spartenAdressen()).toEqual([]);
    expect(darfSparte("kai.boehm@eintrachtmunster.de")).toBe(false);
  });

  test("leere Variable: niemand darf", () => {
    process.env.SPARTE_EMAILS = "";
    expect(darfSparte("kai.boehm@eintrachtmunster.de")).toBe(false);
  });

  test("nur Kommas und Leerzeichen: niemand darf", () => {
    process.env.SPARTE_EMAILS = " , , ";
    expect(spartenAdressen()).toEqual([]);
    expect(darfSparte("kai.boehm@eintrachtmunster.de")).toBe(false);
  });

  test("Einträge ohne @ zählen nicht als Adresse", () => {
    // „alle“ oder „*“ in der Variable ist keine Freigabe, sondern ein Tippfehler.
    process.env.SPARTE_EMAILS = "alle,*,true";
    expect(spartenAdressen()).toEqual([]);
    expect(darfSparte("irgendwer@example.invalid")).toBe(false);
  });
});

describe("Was nie als angemeldet durchgeht", () => {
  test.for([
    ["nichts", undefined],
    ["null", null],
    ["leerer Text", ""],
    ["nur Leerzeichen", "   "],
  ] as const)("%s darf nicht", ([, wert]) => {
    process.env.SPARTE_EMAILS = "kai@example.invalid";
    expect(darfSparte(wert)).toBe(false);
  });

  test("ein leerer Eintrag in der Liste öffnet keine Tür", () => {
    // Ohne den Filter auf „@“ stünde hier ein leerer String in der Liste und
    // eine Anmeldung ohne Adresse käme durch.
    process.env.SPARTE_EMAILS = "kai@example.invalid,";
    expect(darfSparte("")).toBe(false);
    expect(darfSparte(undefined)).toBe(false);
  });
});
