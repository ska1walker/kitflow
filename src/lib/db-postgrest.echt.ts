import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import {
  aendereVorgang, alleVorgaenge, haengePersonAn, legeVorgangAn, mailsAn, naechsteNummer,
  setzePersonAngaben, setzeStufe, verlauf, vermerke, vermerkeMail, vorgaengeAufStufe,
  vorgangPerNummer, loescheVorgang, setzeAngebot,
} from "./vorgaenge-db";
import { aendere, lese } from "./db";

/** Gegen ein echtes PostgREST auf einem echten Postgres. Kein Papp-Netz. */

let vorgangId = "";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:3344";
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.DIENST;
});
afterAll(async () => {
  if (vorgangId) await loescheVorgang(vorgangId);
});

describe("Die Schicht gegen echtes PostgREST", () => {
  test("die Nummernfunktion antwortet als blanker Text", async () => {
    const n = await naechsteNummer();
    expect(n).toMatch(/^AUS-\d{4}-\d{3}$/);
  });

  test("einen ganzen Vorgang anlegen", async () => {
    const v = await legeVorgangAn({
      mannschaften: ["Ü40 Team 3"],
      mannschaftscode: "UE40-3",
      ausstattungsart: "Weitere Ausstattung",
      stufe: 1,
      trainerName: "Kai Böhm",
      trainerEmail: "kai@example.org",
      groessenarten: ["oberteil", "trainingshose"],
      groessenFrist: "2026-09-30",
      lieferadresse: "Am Sportplatz 14",
      initialenNoetig: true,
      artikel: [
        { hersteller: "adidas", bezeichnung: "Trainingsjacke", herstellernummer: "10371232", groessenart: "oberteil", stueck: 1, beflockung: "Standard" },
        { hersteller: "adidas", bezeichnung: "Trainingshose", herstellernummer: "10371004", groessenart: "trainingshose", stueck: 1, beflockung: "ohne Beflockung" },
      ],
      personen: ["36737235175", "37586406115"],
    });

    expect(v).not.toBeNull();
    vorgangId = v!.id;

    // Genau das war bisher unbelegt: liefert PostgREST die eingebetteten
    // Kinder so, wie die Schicht sie liest?
    expect(v!.artikel).toHaveLength(2);
    expect(v!.artikel.map((a) => a.bezeichnung)).toEqual(["Trainingsjacke", "Trainingshose"]);
    expect(v!.personen).toHaveLength(2);
    expect(v!.initialenNoetig).toBe(true);
    expect(v!.groessenarten).toEqual(["oberteil", "trainingshose"]);
    expect(v!.mannschaften).toEqual(["Ü40 Team 3"]);
    expect(v!.stufe).toBe(1);
  });

  test("und wiederfinden", async () => {
    const gelesen = await vorgangPerNummer((await eineNummer())!);
    expect(gelesen.stand).toBe("da");
    if (gelesen.stand !== "da") return;
    expect(gelesen.vorgang.artikel).toHaveLength(2);
    expect(gelesen.vorgang.artikel[0].groessenart).toBe("oberteil");
    expect(gelesen.vorgang.artikel[0].groesseVon).toBeUndefined();
  });

  test("eine unbekannte Nummer ist unbekannt, nicht gestört", async () => {
    expect((await vorgangPerNummer("AUS-1999-001")).stand).toBe("unbekannt");
  });

  test("Stufe setzen, Trigger zieht stufe_seit nach", async () => {
    const vorher = await vorgangPerNummer((await eineNummer())!);
    if (vorher.stand !== "da") throw new Error("weg");
    expect(await setzeStufe(vorgangId, 2)).toBe(true);
    const nachher = await vorgangPerNummer((await eineNummer())!);
    if (nachher.stand !== "da") throw new Error("weg");
    expect(nachher.vorgang.stufe).toBe(2);
    expect(new Date(nachher.vorgang.stufeSeit).getTime()).toBeGreaterThanOrEqual(
      new Date(vorher.vorgang.stufeSeit).getTime(),
    );
    await setzeStufe(vorgangId, 1);
  });

  test("Felder ändern, in Spaltennamen übersetzt", async () => {
    expect(await aendereVorgang(vorgangId, { listeBestaetigtAm: "2026-09-18", hsDealId: "test-deal-1" })).toBe(true);
    const v = await vorgangPerNummer((await eineNummer())!);
    if (v.stand !== "da") throw new Error("weg");
    expect(v.vorgang.listeBestaetigtAm).toBe("2026-09-18");
    expect(v.vorgang.hsDealId).toBe("test-deal-1");
  });

  test("einen Nachzügler zweimal nachtragen bleibt eine Person", async () => {
    expect(await haengePersonAn(vorgangId, "43341951193")).toBe(true);
    expect(await haengePersonAn(vorgangId, "43341951193")).toBe(true);
    const v = await vorgangPerNummer((await eineNummer())!);
    if (v.stand !== "da") throw new Error("weg");
    expect(v.vorgang.personen).toHaveLength(3);
  });

  test("Torwart und Rückennummer je Vorgang", async () => {
    expect(await setzePersonAngaben(vorgangId, "36737235175", { torwart: true, trikotnummer: "7" })).toBe(true);
    const v = await vorgangPerNummer((await eineNummer())!);
    if (v.stand !== "da") throw new Error("weg");
    const person = v.vorgang.personen.find((p) => p.kontaktId === "36737235175");
    expect(person).toMatchObject({ torwart: true, trikotnummer: "7", ausgeschlossen: false });
  });

  test("eine Person, die es am Vorgang nicht gibt, trifft keine Zeile", async () => {
    expect(await setzePersonAngaben(vorgangId, "999999999", { torwart: true })).toBe(false);
  });

  test("Verlauf schreiben und lesen", async () => {
    await vermerke(vorgangId, { art: "angelegt", text: "Vorgang angelegt", sub: "F1", intern: true, abStufe: 1 });
    await vermerke(vorgangId, { art: "groesse", text: "Größe eingetragen" });
    const eintraege = await verlauf(vorgangId);
    expect(eintraege).toHaveLength(2);
    expect(eintraege![0]).toMatchObject({ art: "angelegt", sub: "F1", intern: true, abStufe: 1 });
    expect(eintraege![1].sub).toBeUndefined();
  });

  test("Mailspuren: umgeleitete zählen nicht", async () => {
    await vermerkeMail(vorgangId, "M2", "36737235175", true);
    expect(await mailsAn(vorgangId, "M2", "36737235175")).toEqual([]);

    await vermerkeMail(vorgangId, "M2", "36737235175", false);
    expect((await mailsAn(vorgangId, "M2", "36737235175"))!.length).toBe(1);

    // Die Mail an den Trainer hat keine Kontakt-ID: `is.null` muss greifen.
    await vermerkeMail(vorgangId, "M1", null);
    expect((await mailsAn(vorgangId, "M1", null))!.length).toBe(1);
    expect(await mailsAn(vorgangId, "M1", "36737235175")).toEqual([]);
  });

  test("Übersicht und Stufenfilter", async () => {
    expect((await alleVorgaenge())!.length).toBeGreaterThan(0);
    expect((await vorgaengeAufStufe(1))!.some((v) => v.id === vorgangId)).toBe(true);
    expect((await vorgaengeAufStufe(7))!.some((v) => v.id === vorgangId)).toBe(false);
  });

  test("Geldbeträge kommen als Zahlen zurück, nicht als Zeichenketten", async () => {
    // Gemessen statt angenommen: ich hatte `numeric` erst als Zeichenkette
    // getippt und den Kommentar „gemessen“ schon geschrieben, bevor ich
    // gemessen hatte. PostgREST 13.0.4 liefert eine JSON-Zahl.
    await aendere("vorgang", { id: `eq.${vorgangId}` }, {
      zusage_sponsor: 250.5,
      angebot_intersport_betrag: 1234.5,
      angebot_intersport_am: "2026-10-02",
      lieferant_gewaehlt: "Intersport Uelzen",
      kaskadenstufe: 2,
      rechnung_abweichung: true,
      erstattung_iban: "DE00 0000 0000 0000 0000 00",
    });

    const v = await vorgangPerNummer((await eineNummer())!);
    if (v.stand !== "da") throw new Error("weg");
    expect(v.vorgang.finanzen.zusageSponsor).toBe(250.5);
    expect(v.vorgang.angebote.intersport).toMatchObject({ betrag: 1234.5, am: "2026-10-02" });
    expect(v.vorgang.lieferantGewaehlt).toBe("Intersport Uelzen");
    expect(v.vorgang.kaskadenstufe).toBe(2);
    expect(v.vorgang.rechnungAbweichung).toBe(true);
    expect(v.vorgang.erstattung.iban).toContain("DE00");
    // Was nie gesetzt wurde, bleibt „nichts“ und wird nicht zu 0.
    expect(v.vorgang.finanzen.eingangVerein).toBeUndefined();
  });

  test("ein negativer Betrag wird von der Datenbank abgewiesen", async () => {
    // Eine Zusage von -500 schlägt sich sonst bis in die Deckungsprüfung durch.
    expect(await aendere("vorgang", { id: `eq.${vorgangId}` }, { zusage_sponsor: -500 })).toBeNull();
  });

  test("eine verletzte Bedingung wird gemeldet, nicht verschluckt", async () => {
    const meldungen: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...t) => meldungen.push(t.map(String).join(" ")));

    const kaputt = await legeVorgangAn({
      mannschaften: ["2014"],
      ausstattungsart: "Trikotsatz",
      stufe: 1,
      // „muetze" gibt es nicht - die Bedingung in der Migration muss greifen.
      artikel: [{ bezeichnung: "Mütze", groessenart: "muetze" as never, stueck: 1 }],
    });

    expect(kaputt).toBeNull();
    expect(meldungen.join("\n")).toContain("23514");
    vi.restoreAllMocks();
  });

  test("und der halbe Vorgang ist wirklich weg", async () => {
    const zeilen = await lese<{ nummer: string }>("vorgang", { select: "nummer", ausstattungsart: "eq.Trikotsatz" });
    expect(zeilen).toEqual([]);
  });
});

/** Die Nummer des angelegten Vorgangs. */
async function eineNummer(): Promise<string | undefined> {
  const zeilen = await lese<{ nummer: string }>("vorgang", { select: "nummer", id: `eq.${vorgangId}` });
  return zeilen?.[0]?.nummer;
}

/**
 * Die Spalten aus Migration 005 und 006 gegen das echte Schema.
 *
 * Das Papp-Netz spiegelt hier nur meine eigenen Annahmen zurueck. Was es
 * grundsaetzlich nicht finden kann: ob `not null default false` einen fehlenden
 * Wert wirklich auffaengt, ob PostgREST das eingebettete `bild` am Kind
 * mitliefert, und ob „entfernen" als NULL oder als leerer String ankommt.
 * Genau in dieser Luecke sass beim letzten Mal `on_conflict`.
 */
describe("Wappen, Sponsorlogo und Artikelbild gegen echtes PostgREST", () => {
  let id = "";

  afterAll(async () => {
    if (id) await loescheVorgang(id);
  });

  test("angelegt mit Wappen-Haken, Logo und Artikelbild", async () => {
    const v = await legeVorgangAn({
      mannschaften: ["Ü40 Team 3"],
      ausstattungsart: "Weitere Ausstattung",
      stufe: 1,
      wappenMit: true,
      artikel: [
        {
          bezeichnung: "Trainingsjacke",
          groessenart: "oberteil",
          stueck: 1,
          bild: "artikel/a1.png",
        },
      ],
    });
    expect(v).not.toBeNull();
    id = v!.id;

    expect(v!.wappenMit).toBe(true);
    // Das Kind kommt im selben Aufruf mit (`vorgang_artikel(*)`). Faellt `bild`
    // aus der Einbettung, zeigt F2 nie ein Foto — ohne dass irgendwo ein Fehler
    // entstuende.
    expect(v!.artikel[0].bild).toBe("artikel/a1.png");
  });

  test("ohne Angabe ist der Haken aus, nicht null", async () => {
    const v = await legeVorgangAn({
      mannschaften: ["Ü40 Team 3"],
      ausstattungsart: "Weitere Ausstattung",
      stufe: 1,
    });
    expect(v).not.toBeNull();
    expect(v!.wappenMit).toBe(false);
    await loescheVorgang(v!.id);
  });

  test("das Logo laesst sich setzen und wieder lesen", async () => {
    expect(await aendereVorgang(id, { sponsorLogo: "sponsor/v1.png" })).toBe(true);

    const zeilen = await lese<{ sponsor_logo: string | null }>("vorgang", {
      select: "sponsor_logo",
      id: `eq.${id}`,
    });
    expect(zeilen?.[0]?.sponsor_logo).toBe("sponsor/v1.png");
  });

  test("entfernen schreibt NULL und keinen leeren String", async () => {
    expect(await aendereVorgang(id, { sponsorLogo: "" })).toBe(true);

    const zeilen = await lese<{ sponsor_logo: string | null }>("vorgang", {
      select: "sponsor_logo",
      id: `eq.${id}`,
    });
    // Der Unterschied faellt beim Lesen nicht auf (`wert` macht aus beidem
    // undefined) — wohl aber jeder kuenftigen Abfrage mit `is.null`.
    expect(zeilen?.[0]?.sponsor_logo).toBeNull();
  });

  test("die Datenbank weist einen fehlenden Haken ab", async () => {
    // `not null` steht im Schema, nicht im Code. Faellt es weg, merkt es nur
    // ein Lauf wie dieser.
    expect(await aendere("vorgang", { id: `eq.${id}` }, { wappen_mit: null })).toBeNull();
  });
});

/**
 * Die Angebote gegen das echte Schema.
 *
 * `setzeAngebot` baut seine Spaltennamen aus dem Händler zusammen
 * (`angebot_${haendler}_betrag`). Genau das kann das Papp-Netz nicht prüfen: es
 * nimmt jeden Namen an, den ich ihm gebe, und spiegelt meine eigene Annahme
 * zurück. Ein Tippfehler — „11teamsports" gegen „elfteamsports" — schriebe hier
 * stumm ins Leere, und auf der Seite stünde weiter kein Betrag.
 */
describe("Angebote gegen echtes PostgREST", () => {
  let id = "";

  beforeAll(async () => {
    const v = await legeVorgangAn({
      mannschaften: ["Ü40 Team 3"],
      ausstattungsart: "Weitere Ausstattung",
      stufe: 2,
    });
    id = v!.id;
  });
  afterAll(async () => {
    if (id) await loescheVorgang(id);
  });

  test("beide Haendler schreiben in ihre eigenen Spalten", async () => {
    expect(
      await setzeAngebot(id, "intersport", {
        betrag: 840.5,
        am: "2026-10-02",
        gueltigBis: "2026-11-02",
        lieferzeit: "3 Wochen",
        abweichung: "Farbe nur in Marine",
        datei: "angebot/x-intersport.pdf",
      }),
    ).toBe(true);
    expect(await setzeAngebot(id, "11teamsports", { betrag: 799 })).toBe(true);

    const ab = await vorgangPerNummer((await lese<{ nummer: string }>("vorgang", {
      select: "nummer", id: `eq.${id}`,
    }))![0].nummer);
    if (ab.stand !== "da") throw new Error("Vorgang weg");

    expect(ab.vorgang.angebote.intersport.betrag).toBe(840.5);
    expect(ab.vorgang.angebote.intersport.lieferzeit).toBe("3 Wochen");
    expect(ab.vorgang.angebote.intersport.datei).toBe("angebot/x-intersport.pdf");
    // Der zweite Haendler darf den ersten nicht ueberschrieben haben.
    expect(ab.vorgang.angebote.elfteamsports.betrag).toBe(799);
    expect(ab.vorgang.angebote.elfteamsports.lieferzeit).toBeUndefined();
  });

  test("ein leeres Feld streicht, ein fehlendes laesst stehen", async () => {
    await setzeAngebot(id, "intersport", { abweichung: "" });

    const zeilen = await lese<{
      angebot_intersport_abweichung: string | null;
      angebot_intersport_lieferzeit: string | null;
    }>("vorgang", { select: "angebot_intersport_abweichung,angebot_intersport_lieferzeit", id: `eq.${id}` });

    expect(zeilen?.[0]?.angebot_intersport_abweichung).toBeNull();
    // Nicht mitgeschickt, also unangetastet.
    expect(zeilen?.[0]?.angebot_intersport_lieferzeit).toBe("3 Wochen");
  });

  test("der Betrag laesst sich zuruecknehmen", async () => {
    await setzeAngebot(id, "11teamsports", { betrag: null });
    const zeilen = await lese<{ angebot_11teamsports_betrag: number | null }>("vorgang", {
      select: "angebot_11teamsports_betrag", id: `eq.${id}`,
    });
    expect(zeilen?.[0]?.angebot_11teamsports_betrag).toBeNull();
  });

  test("der gewaehlte Haendler laesst sich setzen", async () => {
    expect(await aendereVorgang(id, { lieferantGewaehlt: "Intersport Uelzen" })).toBe(true);
    const zeilen = await lese<{ lieferant_gewaehlt: string | null }>("vorgang", {
      select: "lieferant_gewaehlt", id: `eq.${id}`,
    });
    expect(zeilen?.[0]?.lieferant_gewaehlt).toBe("Intersport Uelzen");
  });
});
