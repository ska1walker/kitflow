import { describe, expect, test, vi, afterEach } from "vitest";
import { istJugend, istVeraltet, groessenWerte, GROESSENARTEN, GROESSEN_FELD } from "./groessen";

/**
 * Zwei Entscheidungen hängen an diesen Funktionen, und beide sind heikel:
 *
 * - `istVeraltet` entscheidet, ob eine Größe vorbelegt wird. Zu großzügig
 *   heißt: jemand bestätigt mit einem Klick eine Größe von vor zwei Jahren.
 * - `istJugend` entscheidet, ob Namen auf einer Seite stehen und wie schnell
 *   Größen veralten. Im Zweifel muss es die vorsichtigere Antwort geben.
 */

afterEach(() => {
  vi.useRealTimers();
});

/** Ein fester Tag, damit „vier Monate" nicht am Testtag hängt. */
function heuteIst(datum: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${datum}T12:00:00Z`));
}

describe("istVeraltet", () => {
  test("ohne Datum gilt eine Größe als veraltet", () => {
    // Wir wissen dann nicht, wie alt sie ist, und raten nicht zugunsten
    // der Bequemlichkeit.
    expect(istVeraltet(undefined, false)).toBe(true);
    expect(istVeraltet("", true)).toBe(true);
  });

  test("ein unlesbares Datum gilt als veraltet", () => {
    expect(istVeraltet("neulich", false)).toBe(true);
  });

  test("Jugend: vier Monate", () => {
    heuteIst("2026-09-17");
    expect(istVeraltet("2026-06-01", true)).toBe(false); // knapp vier Monate
    expect(istVeraltet("2026-05-16", true)).toBe(true); // vier Monate und einen Tag
  });

  test("Erwachsene: zwölf Monate", () => {
    heuteIst("2026-09-17");
    expect(istVeraltet("2026-05-16", false)).toBe(false);
    expect(istVeraltet("2025-09-16", false)).toBe(true);
  });

  test("dieselbe Größe veraltet bei Jugend früher", () => {
    heuteIst("2026-09-17");
    const vorSechsMonaten = "2026-03-17";
    expect(istVeraltet(vorSechsMonaten, true)).toBe(true);
    expect(istVeraltet(vorSechsMonaten, false)).toBe(false);
  });
});

describe("istJugend", () => {
  test.for(["2007", "2015", "2022", "Mädchen"])("%s ist Jugend", (team) => {
    expect(istJugend(team)).toBe(true);
  });

  test.for(["1. Herren", "Ü30 Herren", "Ü40 Team 3", "Damen"])(
    "%s ist kein Jugendteam",
    (team) => {
      expect(istJugend(team)).toBe(false);
    },
  );

  test("ohne Angabe im Zweifel Jugend", () => {
    // Die vorsichtigere Seite: keine Namen, schnelleres Veralten.
    expect(istJugend()).toBe(true);
    expect(istJugend(undefined, undefined)).toBe(true);
  });

  test("ein Mannschaftscode JG… genügt", () => {
    expect(istJugend(undefined, "JG2014-2015")).toBe(true);
    expect(istJugend("1. Herren", "jg2014")).toBe(true);
  });

  test("eine Jugendmannschaft in der Liste genügt", () => {
    // Spielgemeinschaften stehen als Semikolonliste am Deal.
    expect(istJugend("1. Herren;2013")).toBe(true);
  });

  test("2006 ist keine Jugend mehr", () => {
    // Die Grenze steht in docs/datenmodell.md bei 2007.
    expect(istJugend("2006")).toBe(false);
    expect(istJugend("2023")).toBe(false);
  });
});

describe("Größenwerte", () => {
  test("Schuhe haben eine eigene Liste", () => {
    expect(groessenWerte("schuhe")).toContain("47");
    expect(groessenWerte("schuhe")).not.toContain("XL");
  });

  test("„ohne“ hat keine Größen", () => {
    // Ein Ball braucht keine. Das Formular zeigt dann kein Feld.
    expect(groessenWerte("ohne")).toEqual([]);
  });

  test("gefragt wird nur, wozu es ein Feld am Kontakt gibt", () => {
    for (const art of GROESSENARTEN) {
      expect(GROESSEN_FELD[art], art).not.toBeNull();
    }
    expect(GROESSENARTEN).not.toContain("ohne");
  });
});
