import { da } from "../../test/abruf";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ladeListe } from "./vorgaenge";
import { artikel, kontakt, person, satz } from "../../test/satz";
import { raeumeUmgebung, stelleUmgebung, stelleWelt } from "../../test/welt";

/**
 * Die Liste, die der Trainer prüft — und was die Prüfungen daraus machen.
 *
 * Die sechs Prüfungen selbst sind in `ansicht.test.ts` einzeln geprüft, mit
 * jedem Mangel. Hier geht es um das, was nur der Durchlauf zeigt: ob `ladeListe`
 * die Zeilen richtig zusammensetzt, bevor sie geprüft werden. Eine Größe, die
 * am falschen Kontakt landet, macht jede Prüfung wertlos.
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

describe("Woraus die Zeilen entstehen", () => {
  test("Größen vom Kontakt, Rückennummer und Torwart vom Vorgang", async () => {
    stelleWelt({
      vorgang: satz({
        ausstattungsart: "Trikotsatz",
        artikel: [artikel({ groessenart: "trikot" })],
        personen: [person({ trikotnummer: "7", torwart: true })],
      }),
      kontakte: [kontakt("111", { trikot: "L", firstname: "Kai", lastname: "Böhm" })],
    });

    const liste = da(await ladeListe("AUS-2026-001"));

    expect(liste.zeilen).toHaveLength(1);
    expect(liste.zeilen[0]).toMatchObject({
      name: "Kai Böhm",
      nummer: "7",
      torwart: true,
    });
    expect(liste.zeilen[0].groessen).toEqual([{ art: "trikot", label: "Trikot", wert: "L" }]);
  });

  test("wer ausgeschlossen ist, steht gar nicht in der Liste", async () => {
    stelleWelt({
      vorgang: satz({
        artikel: [artikel()],
        personen: [person(), person({ id: "p2", kontaktId: "222", ausgeschlossen: true })],
      }),
      kontakte: [kontakt("111"), kontakt("222", { firstname: "Uwe", lastname: "Christiani" })],
    });

    const liste = da(await ladeListe("AUS-2026-001"));
    expect(liste.zeilen.map((z) => z.person)).toEqual(["111"]);
  });

  test("die Initialen-Spalte gibt es nur mit dem Häkchen aus F1", async () => {
    const welt = {
      vorgang: satz({ artikel: [artikel()], personen: [person()] }),
      kontakte: [kontakt("111", { initialen: "KB" })],
    };
    stelleWelt(welt);
    expect(da(await ladeListe("AUS-2026-001")).zeilen[0].initialen).toBe("");

    vi.unstubAllGlobals();
    stelleWelt({ ...welt, vorgang: satz({ ...welt.vorgang, initialenNoetig: true }) });
    expect(da(await ladeListe("AUS-2026-001")).zeilen[0].initialen).toBe("KB");
  });

  test("jede Zeile trägt ihren eigenen signierten Link", async () => {
    stelleWelt({
      vorgang: satz({ artikel: [artikel()], personen: [person()] }),
      kontakte: [kontakt("111")],
    });

    const liste = da(await ladeListe("AUS-2026-001"));
    expect(liste.zeilen[0].aendern).toContain("/b/AUS-2026-001/111");
  });
});

describe("Was die Prüfungen daraus machen", () => {
  test("eine fehlende Größe fällt auf und nennt den Namen", async () => {
    // Bei Jugendmannschaften stehen hier Namen: der Trainer muss wissen,
    // wessen Größe fehlt. Die Seite hängt an seinem eigenen Link.
    stelleWelt({
      vorgang: satz({ mannschaften: ["2014"], artikel: [artikel()], personen: [person()] }),
      kontakte: [kontakt("111", { firstname: "Ben", lastname: "Morche" })],
    });

    const liste = da(await ladeListe("AUS-2026-001"));
    const zwei = liste.pruefungen.find((p) => p.nr === 2);
    expect(zwei?.stand).toBe("gefallen");
    expect(zwei?.details).toEqual(["Ben Morche: Oberteil fehlt"]);
  });

  test("eine doppelte Rückennummer beim Trikotsatz auch", async () => {
    stelleWelt({
      vorgang: satz({
        ausstattungsart: "Trikotsatz",
        artikel: [artikel({ groessenart: "trikot" })],
        personen: [person({ trikotnummer: "7" }), person({ id: "p2", kontaktId: "222", trikotnummer: "7" })],
      }),
      kontakte: [
        kontakt("111", { trikot: "L", firstname: "Kai", lastname: "Böhm" }),
        kontakt("222", { trikot: "M", firstname: "Uwe", lastname: "Christiani" }),
      ],
    });

    const liste = da(await ladeListe("AUS-2026-001"));
    const drei = liste.pruefungen.find((p) => p.nr === 3);
    expect(drei?.details).toEqual(["Rückennummer 7 doppelt: Kai Böhm und Uwe Christiani"]);
  });

  test("ein vollständiger Vorgang hat keine gefallene Prüfung", async () => {
    stelleWelt({
      vorgang: satz({ artikel: [artikel()], personen: [person()] }),
      kontakte: [kontakt("111", { trainingsanzug_oberteil: "L", groesse_zuletzt_bestaetigt_am: "2026-09-18" })],
    });

    const liste = da(await ladeListe("AUS-2026-001"));
    expect(liste.pruefungen.filter((p) => p.stand === "gefallen")).toEqual([]);
  });
});

describe("Wann es gar keine Liste gibt", () => {
  test("zu einer unbekannten Nummer", async () => {
    stelleWelt({});
    expect((await ladeListe("AUS-2026-999")).stand).toBe("unbekannt");
  });

  test("und wenn die Datenbank schweigt", async () => {
    stelleWelt({ vorgang: satz(), dbGestoert: true });
    expect((await ladeListe("AUS-2026-001")).stand).toBe("gestoert");
  });

  test("auch wenn HubSpot die Namen nicht hergibt", async () => {
    // Sonst stünde da eine Liste ohne Namen und ohne Größen, und der Trainer
    // bestätigte sie.
    stelleWelt({
      vorgang: satz({ artikel: [artikel()], personen: [person()] }),
      kontakte: [kontakt("111")],
      hubspotGestoert: true,
    });
    expect((await ladeListe("AUS-2026-001")).stand).toBe("gestoert");
  });
});
