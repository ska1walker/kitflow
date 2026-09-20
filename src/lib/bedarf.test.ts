import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { meldeBedarf, type BedarfEingabe } from "./bedarf";
import { kontakt } from "../../test/satz";
import { raeumeUmgebung, stelleUmgebung, stelleWelt } from "../../test/welt";

/**
 * F1 · Bedarf melden.
 *
 * Der teuerste Fehler steckt hier nicht im Anlegen, sondern im Abbrechen: eine
 * gescheiterte Kontaktsuche darf nicht als „zu dieser Mannschaft ist niemand
 * hinterlegt“ durchgehen. Das stand einmal so im Code, schickte den Vorgang
 * auf Stufe 9 und schrieb dem Trainer etwas, das bei einem Rate-Limit schlicht
 * gelogen war — und nicht zurückzunehmen.
 */

function eingabe(mehr: Partial<BedarfEingabe> = {}): BedarfEingabe {
  return {
    modus: "vollstaendig",
    vorname: "Kai",
    nachname: "Böhm",
    email: "kai@example.org",
    telefon: "",
    teams: ["Ü40 Team 3"],
    mannschaftscode: "",
    ausstattungsart: "Weitere Ausstattung",
    artikel: [
      {
        hersteller: "adidas",
        bezeichnung: "Trainingsjacke",
        herstellernummer: "10371232",
        farbe: "schwarz",
        groessenart: "oberteil",
        stueck: 1,
        fuer: "alle",
        beflockung: "Standard",
        beflockungAbweichend: "",
        groesseVon: "",
        groesseBis: "",
      },
    ],
    groessenarten: [],
    personenZahl: 0,
    groessenFrist: "2026-09-30",
    lieferadresse: "Am Sportplatz 14",
    initialenNoetig: false,
    wunschtermin: "",
    wappenMit: false,
    sponsor: "",
    hinweise: "",
    ...mehr,
  };
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

describe("Wenn die Mannschaft Leute hat", () => {
  test("läuft der Vorgang auf Stufe 1 und alle hängen dran", async () => {
    const { aufrufe } = stelleWelt({
      kontakte: [kontakt("111"), kontakt("222", { firstname: "Uwe" })],
      naechsteNummer: "AUS-2026-007",
    });

    const ergebnis = await meldeBedarf(eingabe());

    expect(ergebnis?.vorgang).toBe("AUS-2026-007");
    expect(ergebnis?.ohnePersonen).toBe(false);
    expect(ergebnis?.personen).toHaveLength(2);

    const angelegt = aufrufe.find((a) => a.host === "db" && a.pfad === "vorgang" && a.methode === "POST");
    expect(angelegt?.koerper).toMatchObject({
      nummer: "AUS-2026-007",
      stufe: 1,
      mannschaften: ["Ü40 Team 3"],
      trainer_email: "kai@example.org",
      groessen_frist: "2026-09-30",
    });
  });

  test("die Artikel stehen als Zeilen am Vorgang, mit Beflockung im Klartext", async () => {
    const { aufrufe } = stelleWelt({ kontakte: [kontakt("111")] });

    await meldeBedarf(eingabe({ artikel: [{ ...eingabe().artikel[0], beflockung: "Ohne", beflockungAbweichend: "" }] }));

    const artikelZeilen = aufrufe.find((a) => a.pfad === "vorgang_artikel");
    expect((artikelZeilen?.koerper as Record<string, unknown>[])[0]).toMatchObject({
      bezeichnung: "Trainingsjacke",
      herstellernummer: "10371232",
      groessenart: "oberteil",
      beflockung: "ohne Beflockung",
    });
  });

  test("jede Person bekommt ihren eigenen Größen-Link", async () => {
    stelleWelt({ kontakte: [kontakt("111")] });

    const ergebnis = await meldeBedarf(eingabe());
    expect(ergebnis?.personen[0].groessen).toContain("/g/AUS-2026-001/111");
  });
});

describe("Wenn die Mannschaft wirklich leer ist", () => {
  test("entsteht ein Vorgang, und er ist abgebrochen", async () => {
    const { aufrufe } = stelleWelt({ kontakte: [] });

    const ergebnis = await meldeBedarf(eingabe());

    expect(ergebnis?.ohnePersonen).toBe(true);
    const angelegt = aufrufe.find((a) => a.pfad === "vorgang" && a.methode === "POST");
    expect((angelegt?.koerper as Record<string, unknown>).stufe).toBe(9);
  });
});

describe("Wenn die Suche scheitert", () => {
  test("entsteht gar nichts", async () => {
    // Nicht „ein abgebrochener Vorgang", sondern keiner: das Formular sagt
    // dann „bitte in einer Minute noch einmal".
    const { aufrufe } = stelleWelt({ kontakte: [kontakt("111")], hubspotGestoert: true });

    expect(await meldeBedarf(eingabe())).toBeNull();
    expect(aufrufe.some((a) => a.host === "db" && a.methode === "POST")).toBe(false);
  });

  test("und auch nicht, wenn die Datenbank schweigt", async () => {
    stelleWelt({ kontakte: [kontakt("111")], dbGestoert: true });
    expect(await meldeBedarf(eingabe())).toBeNull();
  });
});

describe("Die Voranfrage", () => {
  test("legt auf Stufe 0 an und fragt noch niemanden", async () => {
    const { aufrufe } = stelleWelt({ kontakte: [kontakt("111")] });

    const ergebnis = await meldeBedarf(eingabe({ modus: "voranfrage", personenZahl: 26 }));

    const angelegt = aufrufe.find((a) => a.pfad === "vorgang" && a.methode === "POST");
    expect((angelegt?.koerper as Record<string, unknown>).stufe).toBe(0);
    expect((angelegt?.koerper as Record<string, unknown>).personen_geschaetzt).toBe(26);
    // Es gibt nichts zu fragen, also wird auch niemand gesucht.
    expect(aufrufe.some((a) => a.host === "hubspot" && a.pfad.includes("contacts/search"))).toBe(false);
    expect(ergebnis?.personen).toEqual([]);
    expect(ergebnis?.ergaenzen).toContain("/e/AUS-2026-001");
  });
});

describe("Ein Vorgang für genau eine Person", () => {
  test("hängt nur sie dran und übernimmt ihre Mannschaft", async () => {
    // Sonst gälte der Vorgang vorsichtshalber als Jugend: Größen veralteten
    // nach vier statt zwölf Monaten und die Seite nennt keine Namen.
    const { aufrufe } = stelleWelt({ kontakte: [kontakt("111"), kontakt("222")] });

    const ergebnis = await meldeBedarf(
      eingabe({ person: { hatAdresse: true, id: "222", name: "Uwe Christiani", team: "Ü40 Team 3", funktion: "Spieler", sparte: "Fußball" } }),
    );

    expect(ergebnis?.personen).toHaveLength(1);
    const angelegt = aufrufe.find((a) => a.pfad === "vorgang" && a.methode === "POST");
    expect((angelegt?.koerper as Record<string, unknown>).mannschaften).toEqual(["Ü40 Team 3"]);
    // Nach Mannschaft wird dann gar nicht gesucht.
    expect(aufrufe.some((a) => a.host === "hubspot" && a.pfad.includes("contacts/search"))).toBe(false);
  });
});

describe("Der Spiegel im CRM", () => {
  test("wird geschrieben, hält den Vorgang aber nicht auf", async () => {
    const { aufrufe } = stelleWelt({ kontakte: [kontakt("111")] });

    await meldeBedarf(eingabe());

    expect(aufrufe.some((a) => a.host === "hubspot" && a.pfad.includes("/objects/deals"))).toBe(true);
  });

  test("und die Personen hängen danach am Deal", async () => {
    // Hier steckte ein echter Fehler: die Deal-ID entsteht erst beim Spiegeln,
    // der Aufrufer hielt aber noch den Satz von vorher. Im CRM stand ein Deal
    // mit null Kontakten -- aufgefallen erst beim Durchlauf im Browser.
    const { aufrufe } = stelleWelt({ kontakte: [kontakt("111"), kontakt("222")] });

    await meldeBedarf(eingabe());

    const verknuepft = aufrufe.filter(
      (a) => a.host === "hubspot" && a.pfad.includes("/associations/default/contacts/"),
    );
    expect(verknuepft).toHaveLength(2);
  });

  test("scheitert er, entsteht der Vorgang trotzdem", async () => {
    // Die Datenbank ist die Wahrheit, HubSpot nur die Sicht darauf. Nur: ohne
    // HubSpot findet die Kontaktsuche auch niemanden – deshalb hier über eine
    // Person, die schon feststeht.
    const { aufrufe } = stelleWelt({ kontakte: [], naechsteNummer: "AUS-2026-009" });

    const ergebnis = await meldeBedarf(
      eingabe({ person: { hatAdresse: true, id: "222", name: "Uwe Christiani", team: "Ü40 Team 3", funktion: "Spieler", sparte: "Fußball" } }),
    );

    expect(ergebnis?.vorgang).toBe("AUS-2026-009");
    expect(aufrufe.some((a) => a.pfad === "vorgang" && a.methode === "POST")).toBe(true);
  });
});
