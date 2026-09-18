import { da } from "../../test/abruf";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ladeGroessenAbfrage, ladeListe } from "./vorgaenge";
import { artikel, kontakt, person, satz } from "../../test/satz";
import { raeumeUmgebung, stelleUmgebung, stelleWelt } from "../../test/welt";

/**
 * Die Stelle, an der F2 und F3 übereinstimmen müssen.
 *
 * Seit dem Umzug rufen beide denselben Helfer (`gefragteArten` in
 * `ansicht.ts`), und der ist dort einzeln geprüft. Was hier bleibt, ist der
 * Durchlauf: kommt die Antwort auch wirklich in beiden Formularen an?
 *
 * Auseinanderlaufen wäre teuer — das Formular fragte etwas anderes, als die
 * Liste anzeigt, und der Trainer bestätigt eine Liste mit leeren Spalten.
 */

beforeEach(() => {
  stelleUmgebung();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  raeumeUmgebung();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Ein Vorgang mit Artikeln", () => {
  test("F2 und F3 fragen dieselben Größen", async () => {
    stelleWelt({
      vorgang: satz({
        artikel: [artikel(), artikel({ id: "a2", groessenart: "trainingshose" })],
        personen: [person()],
      }),
      kontakte: [kontakt("111")],
    });

    const f2 = da(await ladeGroessenAbfrage("AUS-2026-001", "111"));
    const f3 = da(await ladeListe("AUS-2026-001"));

    expect(f2.fragen.map((f) => f.art)).toEqual(["oberteil", "trainingshose"]);
    expect(f3.arten.map((a) => a.art)).toEqual(["oberteil", "trainingshose"]);
  });

  test("ein Artikel ohne Größe wird nicht gefragt", async () => {
    stelleWelt({
      vorgang: satz({
        artikel: [artikel(), artikel({ id: "a2", groessenart: "ohne", bezeichnung: "Ball" })],
        personen: [person()],
      }),
      kontakte: [kontakt("111")],
    });

    const f2 = da(await ladeGroessenAbfrage("AUS-2026-001", "111"));
    expect(f2.fragen.map((f) => f.art)).toEqual(["oberteil"]);
  });
});

describe("Ein Größencheck ohne Artikel", () => {
  test("gefragt wird, was am Vorgang steht — in F2 wie in F3", async () => {
    stelleWelt({
      vorgang: satz({
        ausstattungsart: "Nur Größen erfassen",
        groessenarten: ["trikot", "schuhe"],
        personen: [person()],
      }),
      kontakte: [kontakt("111")],
    });

    const f2 = da(await ladeGroessenAbfrage("AUS-2026-001", "111"));
    const f3 = da(await ladeListe("AUS-2026-001"));

    expect(f2.fragen.map((f) => f.art)).toEqual(["trikot", "schuhe"]);
    expect(f3.arten.map((a) => a.art)).toEqual(["trikot", "schuhe"]);
    expect(f2.nurGroessen).toBe(true);
    expect(f3.nurGroessen).toBe(true);
  });

  test("und die Liste zeigt dann nur die eine Prüfung", async () => {
    // Ein Größencheck geht an keinen Händler.
    stelleWelt({
      vorgang: satz({
        ausstattungsart: "Nur Größen erfassen",
        groessenarten: ["trikot"],
        personen: [person()],
      }),
      kontakte: [kontakt("111", { trikot: "L" })],
    });

    const f3 = da(await ladeListe("AUS-2026-001"));
    expect(f3.pruefungen.map((p) => p.nr)).toEqual([2]);
  });
});
