import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ergaenzeVorgang, ladeVoranfrage, type ErgaenzungEingabe } from "./ergaenzen";
import { artikel, kontakt, satz } from "../../test/satz";
import { raeumeUmgebung, stelleUmgebung, stelleWelt } from "../../test/welt";

/**
 * F1b · aus einer Voranfrage wird ein laufender Vorgang.
 *
 * Hier passieren die meisten Schreibvorgänge am Stück: Artikel nachbessern,
 * Fristen setzen, die Mannschaft anhängen, die Stufe wechseln. Zwei Dinge
 * entscheiden sich dabei:
 *
 * - Eine gescheiterte Kontaktsuche ist keine leere Mannschaft. Hier hängt
 *   sogar mehr daran als in F1, weil der Vorgang schon existiert.
 * - Die Personen müssen vor dem Stufenwechsel dran sein. Ein Vorgang auf
 *   „Größen laufen“ ohne die Leute, die eintragen sollen, wäre für einen
 *   Moment eine Lüge.
 */

function voranfrage() {
  return satz({
    stufe: 0,
    personenGeschaetzt: 26,
    groessenFrist: undefined,
    lieferadresse: undefined,
    artikel: [
      artikel({ id: "a1", bezeichnung: "Trainingsjacke", herstellernummer: undefined, farbe: undefined }),
      artikel({ id: "a2", bezeichnung: "Trainingshose", groessenart: "trainingshose", herstellernummer: undefined, farbe: undefined }),
    ],
  });
}

function eingabe(mehr: Partial<ErgaenzungEingabe> = {}): ErgaenzungEingabe {
  return {
    groessenFrist: "2026-09-30",
    lieferadresse: "Am Sportplatz 14",
    initialenNoetig: true,
    sponsor: "Beispiel GmbH",
    hinweise: "bitte gesammelt liefern",
    artikel: [
      {
        artikelId: "a1",
        herstellernummer: "10371232",
        farbe: "schwarz",
        fuer: "alle",
        beflockung: "Standard",
        beflockungAbweichend: "",
      },
      {
        artikelId: "a2",
        herstellernummer: "10371004",
        farbe: "schwarz",
        fuer: "alle",
        beflockung: "Ohne",
        beflockungAbweichend: "",
      },
    ],
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

describe("Was F1b vorfindet", () => {
  test("die Artikel in der Reihenfolge der Meldung, mit fehlender Nummer als Platzhalter", async () => {
    stelleWelt({ vorgang: voranfrage() });

    const v = await ladeVoranfrage("AUS-2026-001");

    expect(v?.artikel.map((a) => a.bezeichnung)).toEqual(["Trainingsjacke", "Trainingshose"]);
    expect(v?.artikel[0].platzhalter).toBe(true);
    expect(v?.personenGeschaetzt).toBe(26);
  });

  test("einen Vorgang, der keine Voranfrage mehr ist, gibt es hier nicht", async () => {
    // Sonst wechselte die Stufe ein zweites Mal und die Kontakte kämen doppelt.
    stelleWelt({ vorgang: satz({ stufe: 1 }) });
    expect(await ladeVoranfrage("AUS-2026-001")).toBeNull();
  });

  test("und eine Störung ist kein fehlender Vorgang, sondern gar keine Antwort", async () => {
    stelleWelt({ vorgang: voranfrage(), dbGestoert: true });
    expect(await ladeVoranfrage("AUS-2026-001")).toBeNull();
  });
});

describe("Was F1b schreibt", () => {
  test("die echten Artikelnummern, Farbe und Beflockung", async () => {
    const { aufrufe } = stelleWelt({ vorgang: voranfrage(), kontakte: [kontakt("111")] });

    await ergaenzeVorgang("AUS-2026-001", eingabe());

    const patches = aufrufe.filter((a) => a.pfad === "vorgang_artikel" && a.methode === "PATCH");
    expect(patches).toHaveLength(2);
    expect(patches[0].koerper).toMatchObject({ herstellernummer: "10371232", farbe: "schwarz" });
    // „Ohne“ wird zum Klartext, der auch in der Händleranfrage steht.
    expect(patches[1].koerper).toMatchObject({ beflockung: "ohne Beflockung" });
  });

  test("Frist, Lieferadresse, Initialen-Häkchen und Hinweis", async () => {
    const { aufrufe } = stelleWelt({ vorgang: voranfrage(), kontakte: [kontakt("111")] });

    await ergaenzeVorgang("AUS-2026-001", eingabe());

    const patch = aufrufe.find((a) => a.pfad === "vorgang" && a.methode === "PATCH");
    expect(patch?.koerper).toMatchObject({
      groessen_frist: "2026-09-30",
      lieferadresse: "Am Sportplatz 14",
      initialen_noetig: true,
      hinweis_haendler: "bitte gesammelt liefern",
    });
  });
});

describe("Wohin der Vorgang danach geht", () => {
  test("mit Leuten auf Stufe 1 – und die Leute sind vorher dran", async () => {
    const { aufrufe } = stelleWelt({
      vorgang: voranfrage(),
      kontakte: [kontakt("111"), kontakt("222")],
    });

    const ergebnis = await ergaenzeVorgang("AUS-2026-001", eingabe());

    expect(ergebnis?.ohnePersonen).toBe(false);
    expect(ergebnis?.personen).toHaveLength(2);

    const personenZuerst = aufrufe.findIndex((a) => a.pfad === "vorgang_person" && a.methode === "POST");
    const stufeDanach = aufrufe.findIndex(
      (a) => a.pfad === "vorgang" && a.methode === "PATCH" && "stufe" in (a.koerper as object),
    );
    expect(personenZuerst).toBeGreaterThanOrEqual(0);
    expect(stufeDanach).toBeGreaterThan(personenZuerst);
  });

  test("ohne Leute auf Abgebrochen", async () => {
    const { aufrufe } = stelleWelt({ vorgang: voranfrage(), kontakte: [] });

    const ergebnis = await ergaenzeVorgang("AUS-2026-001", eingabe());

    expect(ergebnis?.ohnePersonen).toBe(true);
    const stufe = aufrufe.find(
      (a) => a.pfad === "vorgang" && a.methode === "PATCH" && "stufe" in (a.koerper as object),
    );
    expect(stufe?.koerper).toMatchObject({ stufe: 9, abbruch_bei: 0 });
  });

  test("bei gescheiterter Suche nirgendwohin", async () => {
    // Derselbe Fix wie in F1, hier gewichtiger: der Vorgang existiert schon.
    const { aufrufe } = stelleWelt({
      vorgang: voranfrage(),
      kontakte: [kontakt("111")],
      hubspotGestoert: true,
    });

    expect(await ergaenzeVorgang("AUS-2026-001", eingabe())).toBeNull();

    const stufe = aufrufe.find(
      (a) => a.pfad === "vorgang" && a.methode === "PATCH" && "stufe" in (a.koerper as object),
    );
    expect(stufe).toBeUndefined();
  });
});
