import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fuerSpieler, ladeVorgang, nachtragbarePersonen, trageNach } from "./vorgaenge";
import { artikel, kontakt, person, satz } from "../../test/satz";
import { raeumeUmgebung, stelleUmgebung, stelleWelt } from "../../test/welt";

/**
 * Die Statusseite und das Nachtragen.
 *
 * Die drei Stände müssen auseinandergehalten werden: `da`, `unbekannt` und
 * `gestoert`. Eine Störung sah für den Trainer einmal aus wie ein toter Link —
 * er suchte den Fehler bei sich, während in Wahrheit niemand antwortete.
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

describe("Den Vorgang gibt es", () => {
  test("kommt er mit Nummer, Stufe und Personenzahl zurück", async () => {
    stelleWelt({
      vorgang: satz({
        artikel: [artikel()],
        personen: [person(), person({ id: "p2", kontaktId: "222" })],
      }),
      kontakte: [kontakt("111"), kontakt("222", { firstname: "Uwe" })],
    });

    const e = await ladeVorgang("AUS-2026-001");

    expect(e.stand).toBe("da");
    if (e.stand !== "da") return;
    expect(e.vorgang.nummer).toBe("AUS-2026-001");
    expect(e.vorgang.stufe).toBe(1);
    expect(e.vorgang.groessenGesamt).toBe(2);
  });

  test("die Artikel kommen aus der Datenbank", async () => {
    stelleWelt({
      vorgang: satz({ artikel: [artikel()], personen: [person()] }),
      kontakte: [kontakt("111")],
    });

    const e = await ladeVorgang("AUS-2026-001");
    if (e.stand !== "da") throw new Error("kein Vorgang");
    expect(e.vorgang.artikel[0]).toMatchObject({
      name: "adidas Trainingsjacke",
      herstellernummer: "10371232",
    });
  });

  test("wer seine Größe eingetragen hat, zählt mit", async () => {
    stelleWelt({
      vorgang: satz({
        artikel: [artikel()],
        personen: [person(), person({ id: "p2", kontaktId: "222" })],
      }),
      kontakte: [
        kontakt("111", { trainingsanzug_oberteil: "L" }),
        kontakt("222", { firstname: "Uwe", lastname: "Christiani" }),
      ],
    });

    const e = await ladeVorgang("AUS-2026-001");
    if (e.stand !== "da") throw new Error("kein Vorgang");
    expect(e.vorgang.groessenEingetragen).toBe(1);
    expect(e.vorgang.fehlendeGroessen).toEqual(["Uwe Christiani"]);
  });

  test("bei einer Jugendmannschaft steht kein Name auf der Seite", async () => {
    stelleWelt({
      vorgang: satz({ mannschaften: ["2014"], artikel: [artikel()], personen: [person()] }),
      kontakte: [kontakt("111", { firstname: "Ben", lastname: "Morche" })],
    });

    const e = await ladeVorgang("AUS-2026-001");
    if (e.stand !== "da") throw new Error("kein Vorgang");
    expect(e.vorgang.fehlendeGroessen).toEqual([]);
  });
});

describe("Den Vorgang gibt es nicht", () => {
  test("eine unbekannte Nummer heißt „unbekannt“", async () => {
    stelleWelt({ vorgang: satz() });
    expect((await ladeVorgang("AUS-2026-999")).stand).toBe("unbekannt");
  });

  test("gar keine Nummer auch", async () => {
    stelleWelt({ vorgang: satz() });
    expect((await ladeVorgang(undefined)).stand).toBe("unbekannt");
  });
});

describe("Eine Störung ist kein toter Link", () => {
  test("schweigt die Datenbank, heißt das „gestoert“", async () => {
    stelleWelt({ vorgang: satz(), dbGestoert: true });
    expect((await ladeVorgang("AUS-2026-001")).stand).toBe("gestoert");
  });

  test("schweigt HubSpot, ebenso", async () => {
    // Sonst stünde da „0 von 0 eingetragen“, wo in Wahrheit 26 Leute warten.
    stelleWelt({
      vorgang: satz({ personen: [person()] }),
      kontakte: [kontakt("111")],
      hubspotGestoert: true,
    });
    expect((await ladeVorgang("AUS-2026-001")).stand).toBe("gestoert");
  });

  test("ein Vorgang ohne Personen ist dagegen in Ordnung", async () => {
    // Die Voranfrage: es gibt noch niemanden zu fragen.
    stelleWelt({ vorgang: satz({ stufe: 0, personenGeschaetzt: 26 }) });

    const e = await ladeVorgang("AUS-2026-001");
    expect(e.stand).toBe("da");
    if (e.stand !== "da") return;
    expect(e.vorgang.untertitel).toContain("geschätzt 26 Personen");
  });
});

describe("Was ein Spieler sehen darf", () => {
  test("keine anderen Namen und keine internen Einträge", async () => {
    stelleWelt({
      vorgang: satz({ artikel: [artikel()], personen: [person()] }),
      kontakte: [kontakt("111")],
      ereignisse: [
        { zeitpunkt: "2026-09-18T09:00:00+00:00", art: "x", text: "intern", sub: null, intern: true, ab_stufe: 1 },
        { zeitpunkt: "2026-09-18T09:05:00+00:00", art: "y", text: "offen", sub: null, intern: false, ab_stufe: 1 },
      ],
    });

    const e = await ladeVorgang("AUS-2026-001");
    if (e.stand !== "da") throw new Error("kein Vorgang");

    const fuerIhn = fuerSpieler(e.vorgang);
    expect(fuerIhn.fehlendeGroessen).toEqual([]);
    // Die Größenfrist bleibt: sie betrifft ihn selbst. Der interne Eintrag
    // dagegen ist für Trainer und Spartenleitung.
    expect(fuerIhn.verlauf.map((v) => v.text)).toContain("offen");
    expect(fuerIhn.verlauf.map((v) => v.text)).not.toContain("intern");
    expect(e.vorgang.verlauf.map((v) => v.text)).toContain("intern");
  });
});

describe("Nachtragen", () => {
  test("zeigt nur, wer zur Mannschaft gehört und noch nicht dabei ist", async () => {
    stelleWelt({
      vorgang: satz({ personen: [person()] }),
      kontakte: [kontakt("111"), kontakt("222", { firstname: "Uwe", lastname: "Christiani" })],
    });

    const nachtrag = await nachtragbarePersonen("AUS-2026-001");
    expect(nachtrag?.personen).toEqual([{ id: "222", name: "Uwe Christiani" }]);
  });

  test("gibt es nur auf Stufe 1", async () => {
    // Später wäre ein Nachzügler eine Zeile in einer bestätigten Liste.
    stelleWelt({ vorgang: satz({ stufe: 2, personen: [person()] }), kontakte: [kontakt("111")] });
    expect(await nachtragbarePersonen("AUS-2026-001")).toBeNull();
  });

  test("eine fremde ID kommt nicht durch", async () => {
    const { aufrufe } = stelleWelt({
      vorgang: satz({ personen: [person()] }),
      kontakte: [kontakt("111")],
    });

    const ergebnis = await trageNach("AUS-2026-001", "999");

    expect(ergebnis.ok).toBe(false);
    expect(aufrufe.some((a) => a.pfad === "vorgang_person" && a.methode === "POST")).toBe(false);
  });

  test("wer dazugehört, wird angehängt und steht im Verlauf", async () => {
    const { aufrufe } = stelleWelt({
      vorgang: satz({ personen: [person()] }),
      kontakte: [kontakt("111"), kontakt("222", { firstname: "Uwe", lastname: "Christiani" })],
    });

    const ergebnis = await trageNach("AUS-2026-001", "222");

    expect(ergebnis).toEqual({ ok: true, name: "Uwe Christiani" });
    expect(aufrufe.some((a) => a.pfad === "vorgang_person" && a.methode === "POST")).toBe(true);
    const vermerk = aufrufe.find((a) => a.pfad === "ereignis" && a.methode === "POST");
    expect((vermerk?.koerper as Record<string, unknown>).art).toBe("nachtrag");
  });

  test("scheitert die Suche, zeigt die Karte lieber gar nichts", async () => {
    // Statt zu behaupten, alle hingen schon am Vorgang.
    stelleWelt({
      vorgang: satz({ personen: [person()] }),
      kontakte: [kontakt("111")],
      hubspotGestoert: true,
    });
    expect(await nachtragbarePersonen("AUS-2026-001")).toBeNull();
  });
});
