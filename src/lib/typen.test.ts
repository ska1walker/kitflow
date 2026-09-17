import { describe, expect, test } from "vitest";
import { INITIALEN_MAX, pruefeInitialen } from "./typen";

/**
 * Die Grenzen stammen nicht von uns, sondern aus der HubSpot-Eigenschaft
 * `initialen`: höchstens drei Zeichen, nur Buchstaben und Ziffern. Beides ist
 * gemessen, nicht angenommen — ein früherer Versuch mit „K.B." prallte mit
 * einem 400er ab, und der Spieler las nur „hat nicht geklappt".
 *
 * kitflow prüft deshalb vorher. Wird die Prüfung hier weicher als HubSpot,
 * kommt der 400er zurück; wird sie strenger, lehnen wir gültige Eingaben ab.
 */

function wert(roh: string) {
  const e = pruefeInitialen(roh);
  return "wert" in e ? e.wert : null;
}

describe("angenommen", () => {
  test.for(["KB", "K B", "KAB", "AB1", "ÄÖ", "ß"])("%s", (roh) => {
    expect(wert(roh)).toBe(roh);
  });

  test("Rand und doppelte Leerzeichen werden geglättet", () => {
    expect(wert("  K  B  ")).toBe("K B");
  });

  test("drei Zeichen sind erlaubt, vier nicht", () => {
    expect(INITIALEN_MAX).toBe(3);
    expect(wert("ABC")).toBe("ABC");
    expect(wert("ABCD")).toBeNull();
  });
});

describe("abgewiesen", () => {
  test.for([
    ["leer", ""],
    ["nur Leerzeichen", "   "],
    ["Punkt", "K.B"],
    ["Bindestrich", "K-B"],
    ["Schrägstrich", "K/B"],
    ["zu lang", "ZZZZ"],
  ] as const)("%s", ([, roh]) => {
    const e = pruefeInitialen(roh);
    expect("fehler" in e).toBe(true);
    // Der Spieler muss erfahren, was falsch ist – nicht nur, dass etwas ist.
    if ("fehler" in e) expect(e.fehler.length).toBeGreaterThan(10);
  });

  test("die Meldung nennt die Grenze, wenn es zu lang ist", () => {
    const e = pruefeInitialen("ABCD");
    expect("fehler" in e && e.fehler).toContain(String(INITIALEN_MAX));
  });
});
