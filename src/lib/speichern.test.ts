import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  ladeGroessenAbfrage,
  ladeTrainerAbfrage,
  speichereGroessen,
  speichereTrainerAngaben,
} from "./vorgaenge";
import { artikel, kontakt, person, satz } from "../../test/satz";
import { raeumeUmgebung, stelleUmgebung, stelleWelt } from "../../test/welt";

/**
 * Die beiden Wege, auf denen ein Fremder etwas schreiben kann.
 *
 * Beide hängen nur an einem signierten Link — einen Login gibt es nicht. Ein
 * Formular lässt sich nachbauen, deshalb wird hier nichts übernommen, was
 * nicht vorher als Frage rausging.
 *
 * Seit dem Umzug geht die Schreiberei in zwei Richtungen: Größen und Initialen
 * gehören der Person und bleiben in HubSpot; Rückennummer, Ausschluss und
 * Torwart gelten nur für diesen Vorgang und stehen in der Datenbank.
 */

const HEUTE = "2026-09-18";

function welt(mehr: Parameters<typeof stelleWelt>[0] = {}) {
  return stelleWelt({
    vorgang: satz({
      ausstattungsart: "Trikotsatz",
      artikel: [artikel({ groessenart: "trikot" })],
      personen: [person()],
    }),
    kontakte: [kontakt("111")],
    ...mehr,
  });
}

beforeEach(() => {
  stelleUmgebung();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${HEUTE}T12:00:00Z`));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  raeumeUmgebung();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Die PATCHes am Kontakt in HubSpot. */
function kontaktPatches(aufrufe: { host: string; methode: string; pfad: string; koerper: unknown }[]) {
  return aufrufe
    .filter((a) => a.host === "hubspot" && a.methode === "PATCH" && a.pfad.includes("/contacts/"))
    .map((a) => (a.koerper as { properties: Record<string, string> }).properties);
}

describe("Der Spieler trägt seine Größe ein", () => {
  test("die gefragte Größe landet am Kontakt, mit Bestätigungsdatum", async () => {
    const { aufrufe } = welt();
    const abfrage = (await ladeGroessenAbfrage("AUS-2026-001", "111"))!;

    expect(await speichereGroessen(abfrage, { trikot: "L" })).toEqual({ ok: true });

    expect(kontaktPatches(aufrufe)[0]).toEqual({
      trikot: "L",
      groesse_zuletzt_bestaetigt_am: HEUTE,
    });
  });

  test("eine Größe, die es nicht gibt, wird abgewiesen – ohne zu schreiben", async () => {
    const { aufrufe } = welt();
    const abfrage = (await ladeGroessenAbfrage("AUS-2026-001", "111"))!;

    expect(await speichereGroessen(abfrage, { trikot: "Riesig" })).toEqual({ ok: false });
    expect(kontaktPatches(aufrufe)).toHaveLength(0);
  });

  test("ein Feld, das gar nicht gefragt wurde, wird nicht übernommen", async () => {
    // Ein Formular laesst sich nachbauen.
    const { aufrufe } = welt();
    const abfrage = (await ladeGroessenAbfrage("AUS-2026-001", "111"))!;

    await speichereGroessen(abfrage, { trikot: "L", schuhgroesse: "47" });

    expect(kontaktPatches(aufrufe)[0]).not.toHaveProperty("schuhgroesse");
  });

  test("gar nichts eingetragen schreibt gar nichts", async () => {
    const { aufrufe } = welt();
    const abfrage = (await ladeGroessenAbfrage("AUS-2026-001", "111"))!;

    expect(await speichereGroessen(abfrage, {})).toEqual({ ok: false });
    expect(kontaktPatches(aufrufe)).toHaveLength(0);
  });

  test("wer ausgeschlossen ist, kommt gar nicht erst zum Formular", async () => {
    welt({
      vorgang: satz({
        artikel: [artikel()],
        personen: [person({ ausgeschlossen: true })],
      }),
    });
    expect(await ladeGroessenAbfrage("AUS-2026-001", "111")).toBeNull();
  });

  test("wer nicht am Vorgang hängt, auch nicht", async () => {
    welt();
    expect(await ladeGroessenAbfrage("AUS-2026-001", "999")).toBeNull();
  });
});

describe("Initialen", () => {
  test("werden verlangt, wenn der Vorgang sie aufdruckt", async () => {
    const { aufrufe } = welt({
      vorgang: satz({
        initialenNoetig: true,
        artikel: [artikel({ groessenart: "trikot" })],
        personen: [person()],
      }),
    });
    const abfrage = (await ladeGroessenAbfrage("AUS-2026-001", "111"))!;

    expect(abfrage.initialenNoetig).toBe(true);
    expect(await speichereGroessen(abfrage, { trikot: "L" })).toMatchObject({ ok: false });
    expect(kontaktPatches(aufrufe)).toHaveLength(0);

    expect(await speichereGroessen(abfrage, { trikot: "L", initialen: "KB" })).toEqual({ ok: true });
    expect(kontaktPatches(aufrufe)[0].initialen).toBe("KB");
  });

  test("zu lang oder mit Sonderzeichen wird abgewiesen – die Grenze kommt von HubSpot", async () => {
    const { aufrufe } = welt({
      vorgang: satz({
        initialenNoetig: true,
        artikel: [artikel({ groessenart: "trikot" })],
        personen: [person()],
      }),
    });
    const abfrage = (await ladeGroessenAbfrage("AUS-2026-001", "111"))!;

    expect(await speichereGroessen(abfrage, { trikot: "L", initialen: "ZZZZ" })).toMatchObject({ ok: false });
    expect(await speichereGroessen(abfrage, { trikot: "L", initialen: "K.B" })).toMatchObject({ ok: false });
    expect(kontaktPatches(aufrufe)).toHaveLength(0);
  });

  test("ohne Häkchen werden sie auch nicht übernommen", async () => {
    const { aufrufe } = welt();
    const abfrage = (await ladeGroessenAbfrage("AUS-2026-001", "111"))!;

    await speichereGroessen(abfrage, { trikot: "L", initialen: "KB" });
    expect(kontaktPatches(aufrufe)[0]).not.toHaveProperty("initialen");
  });
});

describe("Der Trainer trägt für jemanden nach", () => {
  test("die Rückennummer steht am Vorgang, nicht am Menschen", async () => {
    // Naechste Runde kann sie jemand anders tragen.
    const { aufrufe } = welt();
    const abfrage = (await ladeTrainerAbfrage("AUS-2026-001", "111"))!;

    const ergebnis = await speichereTrainerAngaben(abfrage, {
      groessen: {},
      nummer: "7",
      initialen: "",
      ausgeschlossen: false,
      torwart: true,
    });

    expect(ergebnis.ok).toBe(true);
    const angaben = aufrufe.find((a) => a.pfad === "vorgang_person" && a.methode === "PATCH");
    expect(angaben?.koerper).toMatchObject({ trikotnummer: "7", torwart: true, ausgeschlossen: false });
    // Ohne Groesse wird am Kontakt gar nichts angefasst.
    expect(kontaktPatches(aufrufe)).toHaveLength(0);
  });

  test("eine Nummer außerhalb von 1 bis 99 wird abgewiesen", async () => {
    const { aufrufe } = welt();
    const abfrage = (await ladeTrainerAbfrage("AUS-2026-001", "111"))!;

    const ergebnis = await speichereTrainerAngaben(abfrage, {
      groessen: {},
      nummer: "100",
      initialen: "",
      ausgeschlossen: false,
      torwart: false,
    });

    expect(ergebnis).toMatchObject({ ok: false });
    expect(aufrufe.some((a) => a.pfad === "vorgang_person" && a.methode === "PATCH")).toBe(false);
  });

  test("eine doppelte Nummer nennt, wer sie schon hat", async () => {
    welt({
      vorgang: satz({
        ausstattungsart: "Trikotsatz",
        artikel: [artikel({ groessenart: "trikot" })],
        personen: [person(), person({ id: "p2", kontaktId: "222", trikotnummer: "7" })],
      }),
      kontakte: [kontakt("111"), kontakt("222", { firstname: "Uwe", lastname: "Christiani" })],
    });
    const abfrage = (await ladeTrainerAbfrage("AUS-2026-001", "111"))!;

    const ergebnis = await speichereTrainerAngaben(abfrage, {
      groessen: {},
      nummer: "7",
      initialen: "",
      ausgeschlossen: false,
      torwart: false,
    });

    expect(ergebnis.fehler).toContain("Uwe Christiani");
  });

  test("das Bestätigungsdatum nur, wenn wirklich eine Größe angefasst wurde", async () => {
    // Sonst liesse eine fremde Bestaetigung eine alte Groesse frisch aussehen.
    const { aufrufe } = welt();
    const abfrage = (await ladeTrainerAbfrage("AUS-2026-001", "111"))!;

    await speichereTrainerAngaben(abfrage, {
      groessen: { trikot: "L" },
      nummer: "",
      initialen: "",
      ausgeschlossen: false,
      torwart: false,
    });

    expect(kontaktPatches(aufrufe)[0]).toMatchObject({
      trikot: "L",
      groesse_zuletzt_bestaetigt_am: HEUTE,
    });
  });

  test("ein Ausschluss lässt sich zurücknehmen", async () => {
    const { aufrufe } = welt({
      vorgang: satz({
        artikel: [artikel({ groessenart: "trikot" })],
        personen: [person({ ausgeschlossen: true })],
      }),
    });
    // Der Trainer kommt an das Formular, auch wenn die Person ausgeschlossen ist.
    const abfrage = (await ladeTrainerAbfrage("AUS-2026-001", "111"))!;
    expect(abfrage.ausgeschlossen).toBe(true);

    await speichereTrainerAngaben(abfrage, {
      groessen: {},
      nummer: "",
      initialen: "",
      ausgeschlossen: false,
      torwart: false,
    });

    const angaben = aufrufe.find((a) => a.pfad === "vorgang_person" && a.methode === "PATCH");
    expect(angaben?.koerper).toMatchObject({ ausgeschlossen: false });
  });
});
