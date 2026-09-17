import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  aendereVorgang,
  alleVorgaenge,
  haengePersonAn,
  legeVorgangAn,
  mailsAn,
  setzePersonAngaben,
  setzeStufe,
  vermerke,
  vorgangPerNummer,
} from "./vorgaenge-db";
import {
  artikelZeile,
  personZeile,
  raeumeUmgebung,
  stelleDb,
  stelleUmgebung,
  vorgangZeile,
} from "../../test/db-fake";

/**
 * Die Vorgangsschicht über der eigenen Datenbank.
 *
 * Zwei Dinge stehen hier im Mittelpunkt, weil sie in dieser Reihenfolge
 * wehtun:
 *
 * 1. **Ein Ausfall ist keine Tatsache.** Genau daran ist kitflow dreimal
 *    hängengeblieben – ein leeres Ergebnis wurde als „gibt es nicht“ gelesen
 *    und ein Vorgang deshalb abgebrochen.
 * 2. **Ein halber Vorgang ist schlimmer als keiner.** PostgREST kennt keine
 *    Transaktion über mehrere Aufrufe; scheitert ein Artikel, muss der Vorgang
 *    wieder weg sein.
 */

const NUMMER = "AUS-2026-002";

beforeEach(() => {
  stelleUmgebung();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  raeumeUmgebung();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Einen Vorgang lesen", () => {
  test("den es gibt", async () => {
    stelleDb({ "GET vorgang": { koerper: [vorgangZeile()] } });

    const e = await vorgangPerNummer("AUS-2026-001");

    expect(e.stand).toBe("da");
    if (e.stand !== "da") return;
    expect(e.vorgang.nummer).toBe("AUS-2026-001");
    expect(e.vorgang.stufe).toBe(1);
    expect(e.vorgang.mannschaften).toEqual(["Ü40 Team 3"]);
  });

  test("den es nicht gibt", async () => {
    stelleDb({ "GET vorgang": { koerper: [] } });
    expect((await vorgangPerNummer("AUS-2026-999")).stand).toBe("unbekannt");
  });

  test("bei einer Störung ist es keine falsche Nummer", async () => {
    // Sonst liest der Trainer „Dieser Link funktioniert nicht“ und sucht einen
    // Fehler bei sich, während in Wahrheit die Datenbank schweigt.
    stelleDb({ "GET vorgang": { status: 500 } });
    expect((await vorgangPerNummer("AUS-2026-001")).stand).toBe("gestoert");
  });

  test("eine Zeile mit unbekannter Stufe gilt als Störung, nicht als fehlend", async () => {
    stelleDb({ "GET vorgang": { koerper: [vorgangZeile({ stufe: 42 })] } });
    expect((await vorgangPerNummer("AUS-2026-001")).stand).toBe("gestoert");
  });

  test("leere Spalten werden zu „nicht gesetzt“", async () => {
    stelleDb({ "GET vorgang": { koerper: [vorgangZeile({ sponsor: null, mannschaftscode: "" })] } });

    const e = await vorgangPerNummer("AUS-2026-001");
    if (e.stand !== "da") throw new Error("kein Vorgang");
    expect(e.vorgang.sponsor).toBeUndefined();
    expect(e.vorgang.mannschaftscode).toBeUndefined();
  });

  test("Artikel kommen in der Reihenfolge, in der sie gemeldet wurden", async () => {
    stelleDb({
      "GET vorgang": {
        koerper: [
          vorgangZeile({
            vorgang_artikel: [
              artikelZeile({ id: "a2", reihenfolge: 1, bezeichnung: "Trainingshose" }),
              artikelZeile({ id: "a1", reihenfolge: 0, bezeichnung: "Trainingsjacke" }),
            ],
          }),
        ],
      },
    });

    const e = await vorgangPerNummer("AUS-2026-001");
    if (e.stand !== "da") throw new Error("kein Vorgang");
    expect(e.vorgang.artikel.map((a) => a.bezeichnung)).toEqual([
      "Trainingsjacke",
      "Trainingshose",
    ]);
  });

  test("Personen tragen nur ihre HubSpot-ID", async () => {
    stelleDb({
      "GET vorgang": {
        koerper: [vorgangZeile({ vorgang_person: [personZeile({ torwart: true })] })],
      },
    });

    const e = await vorgangPerNummer("AUS-2026-001");
    if (e.stand !== "da") throw new Error("kein Vorgang");
    expect(e.vorgang.personen).toEqual([
      {
        id: "p1",
        kontaktId: "36737235175",
        ausgeschlossen: false,
        torwart: true,
        trikotnummer: undefined,
      },
    ]);
  });

  test("Vorgang, Artikel und Personen kosten einen Aufruf", async () => {
    const { netz } = stelleDb({ "GET vorgang": { koerper: [vorgangZeile()] } });

    await vorgangPerNummer("AUS-2026-001");

    expect(netz).toHaveBeenCalledTimes(1);
    expect(String(netz.mock.calls[0][0])).toContain("vorgang_artikel");
  });
});

describe("Alle Vorgänge", () => {
  test("keine heißt keine", async () => {
    stelleDb({ "GET vorgang": { koerper: [] } });
    expect(await alleVorgaenge()).toEqual([]);
  });

  test("eine Störung heißt nicht „keine“", async () => {
    // Auf der Seite der Spartenleitung wäre eine leere Liste eine Behauptung.
    stelleDb({ "GET vorgang": { status: 503 } });
    expect(await alleVorgaenge()).toBeNull();
  });

  test("eine kaputte Zeile wirft nicht die anderen weg", async () => {
    stelleDb({
      "GET vorgang": {
        koerper: [vorgangZeile({ stufe: 99 }), vorgangZeile({ id: "v2", nummer: NUMMER })],
      },
    });

    const zeilen = await alleVorgaenge();
    expect(zeilen?.map((v) => v.nummer)).toEqual([NUMMER]);
  });
});

describe("Einen Vorgang anlegen", () => {
  const neu = {
    mannschaften: ["Ü40 Team 3"],
    ausstattungsart: "Weitere Ausstattung",
    stufe: 1 as const,
    trainerEmail: "kai@example.org",
    artikel: [{ bezeichnung: "Trainingsjacke", groessenart: "oberteil" as const, stueck: 1 }],
    personen: ["36737235175"],
  };

  test("Nummer, Vorgang, Artikel, Personen – in dieser Reihenfolge", async () => {
    const { aufrufe } = stelleDb({
      "POST rpc/naechste_vorgangsnummer": { koerper: NUMMER },
      "POST vorgang": { koerper: [vorgangZeile({ id: "v9", nummer: NUMMER })] },
      "POST vorgang_artikel": { koerper: [artikelZeile()] },
      "POST vorgang_person": { koerper: [personZeile()] },
      "GET vorgang": { koerper: [vorgangZeile({ id: "v9", nummer: NUMMER })] },
    });

    const vorgang = await legeVorgangAn(neu);
    expect(aufrufe[3].suche.on_conflict).toBe("vorgang_id,hs_kontakt_id");

    expect(vorgang?.nummer).toBe(NUMMER);
    expect(aufrufe.map((a) => a.pfad)).toEqual([
      "rpc/naechste_vorgangsnummer",
      "vorgang",
      "vorgang_artikel",
      "vorgang_person",
      "vorgang",
    ]);
  });

  test("ohne Nummer entsteht gar nichts", async () => {
    const { aufrufe } = stelleDb({ "POST rpc/naechste_vorgangsnummer": { status: 500 } });

    expect(await legeVorgangAn(neu)).toBeNull();
    expect(aufrufe.map((a) => a.pfad)).toEqual(["rpc/naechste_vorgangsnummer"]);
  });

  test("scheitert ein Artikel, wird der Vorgang zurückgenommen", async () => {
    const { aufrufe } = stelleDb({
      "POST rpc/naechste_vorgangsnummer": { koerper: NUMMER },
      "POST vorgang": { koerper: [vorgangZeile({ id: "v9", nummer: NUMMER })] },
      "POST vorgang_artikel": { status: 400, koerper: { code: "23514" } },
      "DELETE vorgang": { koerper: [] },
    });

    expect(await legeVorgangAn(neu)).toBeNull();

    const geloescht = aufrufe.find((a) => a.methode === "DELETE");
    expect(geloescht?.suche.id).toBe("eq.v9");
    // Personen dürfen dann gar nicht mehr angehängt werden.
    expect(aufrufe.some((a) => a.pfad === "vorgang_person")).toBe(false);
  });

  test("scheitert eine Person, ebenso", async () => {
    const { aufrufe } = stelleDb({
      "POST rpc/naechste_vorgangsnummer": { koerper: NUMMER },
      "POST vorgang": { koerper: [vorgangZeile({ id: "v9", nummer: NUMMER })] },
      "POST vorgang_artikel": { koerper: [artikelZeile()] },
      "POST vorgang_person": { status: 500 },
      "DELETE vorgang": { koerper: [] },
    });

    expect(await legeVorgangAn(neu)).toBeNull();
    expect(aufrufe.some((a) => a.methode === "DELETE")).toBe(true);
  });

  test("scheitert auch das Zurücknehmen, wird es gemeldet", async () => {
    const meldungen: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...t) => meldungen.push(t.map(String).join(" ")));

    stelleDb({
      "POST rpc/naechste_vorgangsnummer": { koerper: NUMMER },
      "POST vorgang": { koerper: [vorgangZeile({ id: "v9", nummer: NUMMER })] },
      "POST vorgang_artikel": { status: 500 },
      "DELETE vorgang": { status: 500 },
    });

    expect(await legeVorgangAn(neu)).toBeNull();
    // Still verschwinden darf so etwas nie: der Vorgang steht noch da.
    expect(meldungen.join("\n")).toContain("halb angelegt");
  });

  test("ein Vorgang ohne Artikel und ohne Personen ist erlaubt", async () => {
    // Die Voranfrage: es gibt noch nichts zu fragen und niemanden zu fragen.
    const { aufrufe } = stelleDb({
      "POST rpc/naechste_vorgangsnummer": { koerper: NUMMER },
      "POST vorgang": { koerper: [vorgangZeile({ id: "v9", nummer: NUMMER, stufe: 0 })] },
      "GET vorgang": { koerper: [vorgangZeile({ id: "v9", nummer: NUMMER, stufe: 0 })] },
    });

    const vorgang = await legeVorgangAn({
      mannschaften: ["2014"],
      ausstattungsart: "Trikotsatz",
      stufe: 0,
    });

    expect(vorgang?.stufe).toBe(0);
    expect(aufrufe.some((a) => a.pfad === "vorgang_artikel")).toBe(false);
  });

  test("die Spalten heißen so, wie die Migration sie nennt", async () => {
    const { aufrufe } = stelleDb({
      "POST rpc/naechste_vorgangsnummer": { koerper: NUMMER },
      "POST vorgang": { koerper: [vorgangZeile()] },
      "POST vorgang_artikel": { koerper: [] },
      "POST vorgang_person": { koerper: [] },
      "GET vorgang": { koerper: [vorgangZeile()] },
    });

    await legeVorgangAn({ ...neu, initialenNoetig: true, groessenFrist: "2026-09-30" });

    const zeile = aufrufe[1].koerper as Record<string, unknown>;
    expect(zeile).toMatchObject({
      nummer: NUMMER,
      trainer_email: "kai@example.org",
      initialen_noetig: true,
      groessen_frist: "2026-09-30",
      mannschaften: ["Ü40 Team 3"],
    });
    const artikel = (aufrufe[2].koerper as Record<string, unknown>[])[0];
    expect(artikel).toMatchObject({ groessenart: "oberteil", fuer: "alle", reihenfolge: 0 });
  });

  test("eine leere Frist wird nicht als leerer Text geschrieben", async () => {
    // Postgres nimmt „“ als Datum nicht an; das Formular liefert es aber so.
    const { aufrufe } = stelleDb({
      "POST rpc/naechste_vorgangsnummer": { koerper: NUMMER },
      "POST vorgang": { koerper: [vorgangZeile()] },
      "GET vorgang": { koerper: [vorgangZeile()] },
    });

    await legeVorgangAn({ mannschaften: [], ausstattungsart: "Trikotsatz", stufe: 0, groessenFrist: "" });

    expect((aufrufe[1].koerper as Record<string, unknown>).groessen_frist).toBeNull();
  });
});

describe("Ändern", () => {
  test("die Stufe", async () => {
    const { aufrufe } = stelleDb({ "PATCH vorgang": { koerper: [vorgangZeile({ stufe: 2 })] } });

    expect(await setzeStufe("v1", 2)).toBe(true);
    expect(aufrufe[0].koerper).toEqual({ stufe: 2 });
    expect(aufrufe[0].suche.id).toBe("eq.v1");
  });

  test("beim Abbruch bleibt stehen, wo der Vorgang war", async () => {
    const { aufrufe } = stelleDb({ "PATCH vorgang": { koerper: [vorgangZeile({ stufe: 9 })] } });

    await setzeStufe("v1", 9, 4);

    expect(aufrufe[0].koerper).toEqual({ stufe: 9, abbruch_bei: 4 });
  });

  test("eine Stufe, die keine Zeile trifft, gilt als nicht gesetzt", async () => {
    stelleDb({ "PATCH vorgang": { koerper: [] } });
    expect(await setzeStufe("gibtsnicht", 2)).toBe(false);
  });

  test("einzelne Felder, übersetzt in Spaltennamen", async () => {
    const { aufrufe } = stelleDb({ "PATCH vorgang": { koerper: [vorgangZeile()] } });

    await aendereVorgang("v1", { listeBestaetigtAm: "2026-09-18", hsDealId: "123" });

    expect(aufrufe[0].koerper).toEqual({ liste_bestaetigt_am: "2026-09-18", hs_deal_id: "123" });
  });

  test("nichts zu ändern heißt: nicht fragen", async () => {
    const { netz } = stelleDb({});
    expect(await aendereVorgang("v1", {})).toBe(true);
    expect(netz).not.toHaveBeenCalled();
  });
});

describe("Personen am Vorgang", () => {
  test("zweimal nachtragen bleibt eine Person", async () => {
    const { aufrufe } = stelleDb({ "POST vorgang_person": { koerper: [] } });

    expect(await haengePersonAn("v1", "36737235175")).toBe(true);
    expect(aufrufe[0].prefer).toContain("resolution=ignore-duplicates");
    // Ohne die Spalten laesst PostgREST den zweiten Nachtrag mit 409 auflaufen.
    expect(aufrufe[0].suche.on_conflict).toBe("vorgang_id,hs_kontakt_id");
  });

  test("Torwart und Rückennummer gelten je Vorgang", async () => {
    const { aufrufe } = stelleDb({ "PATCH vorgang_person": { koerper: [personZeile()] } });

    await setzePersonAngaben("v1", "36737235175", { torwart: true, trikotnummer: "7" });

    expect(aufrufe[0].suche).toMatchObject({
      vorgang_id: "eq.v1",
      hs_kontakt_id: "eq.36737235175",
    });
    expect(aufrufe[0].koerper).toEqual({ torwart: true, trikotnummer: "7" });
  });

  test("eine geleerte Rückennummer wird gelöscht, nicht leer geschrieben", async () => {
    const { aufrufe } = stelleDb({ "PATCH vorgang_person": { koerper: [personZeile()] } });

    await setzePersonAngaben("v1", "36737235175", { trikotnummer: "" });

    expect(aufrufe[0].koerper).toEqual({ trikotnummer: null });
  });

  test("ausgeschlossen darf ausdrücklich auf false gesetzt werden", async () => {
    // `if (angaben.ausgeschlossen)` hätte das Zurücknehmen verschluckt.
    const { aufrufe } = stelleDb({ "PATCH vorgang_person": { koerper: [personZeile()] } });

    await setzePersonAngaben("v1", "36737235175", { ausgeschlossen: false });

    expect(aufrufe[0].koerper).toEqual({ ausgeschlossen: false });
  });
});

describe("Verlauf und Mailspuren", () => {
  test("ein fehlgeschlagener Verlaufseintrag hält niemanden auf", async () => {
    stelleDb({ "POST ereignis": { status: 500 } });
    await expect(vermerke("v1", { art: "angelegt", text: "Vorgang angelegt" })).resolves.toBeUndefined();
  });

  test("Erinnerungen fragen nur nach dem, was wirklich ankam", async () => {
    const { aufrufe } = stelleDb({ "GET mail_versand": { koerper: [] } });

    await mailsAn("v1", "M2", "36737235175");

    // Eine von MAIL_NUR_AN umgeleitete Mail lag in Kais Postfach, nicht im
    // Postfach des Spielers – sie darf nicht als Erinnerung zählen.
    expect(aufrufe[0].suche.umgeleitet).toBe("is.false");
    expect(aufrufe[0].suche.hs_kontakt_id).toBe("eq.36737235175");
  });

  test("eine Mail an den Trainer hat keine Kontakt-ID", async () => {
    const { aufrufe } = stelleDb({ "GET mail_versand": { koerper: [] } });

    await mailsAn("v1", "M1", null);

    expect(aufrufe[0].suche.hs_kontakt_id).toBe("is.null");
  });

  test("eine Störung heißt nicht „noch nichts verschickt“", async () => {
    // Sonst erinnert der tägliche Lauf denselben Menschen zweimal.
    stelleDb({ "GET mail_versand": { status: 500 } });
    expect(await mailsAn("v1", "M2", "36737235175")).toBeNull();
  });
});
