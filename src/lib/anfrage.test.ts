import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { bestaetigeListe, gibFrei } from "./vorgaenge";
import { alsCsv, baueAnfrage } from "./anfrage";
import { anfrageHaendler } from "./haendler-adressen";
import { artikel, kontakt, person, satz } from "../../test/satz";
import { raeumeUmgebung, stelleUmgebung, stelleWelt, type Welt } from "../../test/welt";

/**
 * M4 · die Anfrage an die Händler.
 *
 * Die einzige Mail, die das Haus verlässt, und die einzige, die niemand
 * zurückholt. Kais Auflage bei der Freigabe war ein Satz: **es gehen keine
 * Spielernamen raus.**
 *
 * Diese Datei prüft vor allem das. Nicht „steht der richtige Name an der
 * richtigen Stelle“, sondern: steht überhaupt irgendwo einer. Alles andere —
 * Stückzahlen, Größen, Nummern — ist Handwerk und darunter geprüft.
 *
 * **Seit dem 18.09.2026 sind es zwei Schritte**: der Trainer bestätigt, die
 * Spartenleitung gibt frei. Erst dann geht M4 raus. Die Tests hier gehen
 * deshalb über `bestaetigenUndFreigeben` — sie prüfen den Inhalt der Anfrage,
 * nicht wer sie auslöst. Dass ohne Freigabe nichts rausgeht, steht in
 * `freigabe.test.ts`.
 */

const HAENDLER =
  "Intersport Uelzen|Herr Hillebrecht|hillebrecht@example.invalid," +
  "11teamsports|Herr Bormann|bormann@example.invalid";

/** Zwei Spieler mit Größen, einer davon im Tor, beide mit auffälligen Namen. */
function welt(mehr: Partial<Welt> = {}) {
  return stelleWelt({
    vorgang: satz({
      nummer: "AUS-2026-001",
      stufe: 1,
      trainerEmail: "trainer@example.invalid",
      lieferadresse: "Am Sportplatz 14",
      artikel: [artikel({ id: "a1", bezeichnung: "Trainingsjacke", groessenart: "oberteil" })],
      personen: [
        person({ id: "p1", kontaktId: "111" }),
        person({ id: "p2", kontaktId: "222", torwart: true, trikotnummer: "1" }),
      ],
    }),
    kontakte: [
      kontakt("111", {
        firstname: "Anna",
        lastname: "Klein",
        trainingsanzug_oberteil: "M",
        initialen: "AK",
      }),
      kontakt("222", {
        firstname: "Bernd",
        lastname: "Großmann",
        trainingsanzug_oberteil: "XL",
        initialen: "BG",
      }),
    ],
    ...mehr,
  });
}

function briefe(aufrufe: { host: string; koerper: unknown }[]) {
  return aufrufe.filter((a) => a.host === "resend").map(
    (a) =>
      a.koerper as {
        to: string[];
        subject: string;
        text: string;
        html: string;
        reply_to?: string;
        attachments?: { filename: string; content: string }[];
      },
  );
}

/**
 * Bestätigen und freigeben — die beiden Schritte, nach denen M4 rausgeht.
 *
 * Die Tests unten interessiert, was in der Anfrage steht. Dass sie ohne den
 * zweiten Schritt liegenbleibt, ist Gegenstand von `freigabe.test.ts`.
 */
async function bestaetigenUndFreigeben(nummer = "AUS-2026-001") {
  await bestaetigeListe(nummer, "Am Sportplatz 14", "");
  return gibFrei(nummer, { art: "mensch", email: "kai@example.invalid" });
}

/** Der Anhang, ausgepackt. */
function anhangText(brief: { attachments?: { content: string }[] }): string {
  const inhalt = brief.attachments?.[0]?.content ?? "";
  return Buffer.from(inhalt, "base64").toString("utf8");
}

beforeEach(() => {
  stelleUmgebung();
  process.env.RESEND_API_KEY = "zz-test";
  process.env.KITFLOW_BASIS = "https://zz.example.invalid";
  process.env.HAENDLER = HAENDLER;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  raeumeUmgebung();
  delete process.env.RESEND_API_KEY;
  delete process.env.KITFLOW_BASIS;
  delete process.env.HAENDLER;
  delete process.env.MAIL_NUR_AN;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Kein Spielername verlässt den Verein", () => {
  test("nicht in der Mail an die Händler", async () => {
    const { aufrufe } = welt();

    await bestaetigenUndFreigeben();

    const anHaendler = briefe(aufrufe).filter((b) =>
      b.to[0].includes("hillebrecht") || b.to[0].includes("bormann"),
    );
    expect(anHaendler.length).toBeGreaterThan(0);
    for (const b of anHaendler) {
      for (const name of ["Anna", "Klein", "Bernd", "Großmann"]) {
        expect(b.text, `„${name}“ steht im Text an ${b.to[0]}`).not.toContain(name);
        expect(b.html, `„${name}“ steht im HTML an ${b.to[0]}`).not.toContain(name);
        expect(b.subject).not.toContain(name);
      }
    }
  });

  test("und nicht im Anhang", async () => {
    // Der Entwurf sah dort je eine Zeile pro Person vor, mit Vor- und
    // Nachnamen. Genau das ist raus.
    const { aufrufe } = welt();

    await bestaetigenUndFreigeben();

    const csv = anhangText(briefe(aufrufe).find((b) => b.attachments) ?? {});
    expect(csv.length).toBeGreaterThan(0);
    for (const name of ["Anna", "Klein", "Bernd", "Großmann"]) {
      expect(csv, `„${name}“ steht im Anhang`).not.toContain(name);
    }
    expect(csv).not.toContain("Vorname");
    expect(csv).not.toContain("Nachname");
  });

  test("auch die Trainer-Adresse steht nicht in der Tabelle", async () => {
    const { aufrufe } = welt();
    await bestaetigenUndFreigeben();

    const csv = anhangText(briefe(aufrufe).find((b) => b.attachments) ?? {});
    expect(csv).not.toContain("@example.invalid");
  });

  test("die Mail sagt ausdrücklich, dass keine Namen dabei sind", async () => {
    // Damit der Händler nicht nachfragt und der Verein nicht doch eine Liste
    // hinterherschickt.
    const { aufrufe } = welt();
    await bestaetigenUndFreigeben();

    expect(briefe(aufrufe)[0].text).toContain("keine Namen");
  });
});

describe("Was stattdessen drinsteht", () => {
  test("Stück, Größe, Nummer und Initialen", async () => {
    const { aufrufe } = stelleWelt({
      vorgang: satz({
        nummer: "AUS-2026-001",
        stufe: 1,
        ausstattungsart: "Trikotsatz",
        initialenNoetig: true,
        trainerEmail: "trainer@example.invalid",
        artikel: [artikel({ id: "a1", bezeichnung: "Trikot", groessenart: "trikot" })],
        personen: [person({ id: "p1", kontaktId: "111", trikotnummer: "7" })],
      }),
      kontakte: [kontakt("111", { firstname: "Anna", trikot: "M", initialen: "AK" })],
    });

    await bestaetigenUndFreigeben();

    const csv = anhangText(briefe(aufrufe).find((b) => b.attachments) ?? {});
    expect(csv).toContain("Rueckennummer");
    expect(csv).toContain("Initialen");
    expect(csv).toContain('"7"');
    expect(csv).toContain('"AK"');
    expect(csv).toContain('"M"');
  });

  test("ohne Trikotsatz keine Nummernspalte", async () => {
    // Bei Trainingsjacken druckt niemand eine Rückennummer auf.
    const { aufrufe } = welt();

    await bestaetigenUndFreigeben();

    const csv = anhangText(briefe(aufrufe).find((b) => b.attachments) ?? {});
    expect(csv).not.toContain("Rueckennummer");
  });

  test("wer keine Größe hat, steht nicht in der Anfrage", async () => {
    // Eine Zeile ohne Größe kann kein Händler bepreisen, und geraten wird nicht.
    const { aufrufe } = welt({
      kontakte: [
        kontakt("111", { firstname: "Anna", trainingsanzug_oberteil: "M" }),
        kontakt("222", { firstname: "Bernd" }),
      ],
    });

    await bestaetigenUndFreigeben();

    const csv = anhangText(briefe(aufrufe).find((b) => b.attachments) ?? {});
    // Kopfzeile plus genau eine Datenzeile.
    expect(csv.trim().split("\r\n")).toHaveLength(2);
  });
});

describe("An wen sie geht", () => {
  test("an jeden hinterlegten Händler, einzeln", async () => {
    const { aufrufe } = welt();

    const ergebnis = await bestaetigenUndFreigeben();

    expect(ergebnis.anHaendler).toBe(2);
    const adressen = briefe(aufrufe).map((b) => b.to[0]);
    expect(adressen).toContain("hillebrecht@example.invalid");
    expect(adressen).toContain("bormann@example.invalid");
  });

  test("mit der richtigen Anrede je Händler", async () => {
    const { aufrufe } = welt();
    await bestaetigenUndFreigeben();

    const an = (adresse: string) => briefe(aufrufe).find((b) => b.to[0] === adresse)?.text ?? "";
    expect(an("hillebrecht@example.invalid")).toContain("Sehr geehrter Herr Hillebrecht");
    expect(an("bormann@example.invalid")).toContain("Sehr geehrter Herr Bormann");
  });

  test("Antworten gehen zum Verein, nicht an kitflow", async () => {
    const { aufrufe } = welt();
    await bestaetigenUndFreigeben();

    expect(briefe(aufrufe)[0].reply_to).toContain("@");
  });

  test("der Trainer bekommt M5", async () => {
    const { aufrufe } = welt();
    await bestaetigenUndFreigeben();

    const anTrainer = briefe(aufrufe).find((b) => b.to[0] === "trainer@example.invalid");
    expect(anTrainer?.subject).toContain("Anfrage an die Händler verschickt");
    expect(anTrainer?.text).toContain("Intersport Uelzen und 11teamsports");
  });
});

describe("Ohne hinterlegte Händler", () => {
  test("geht nichts raus, und die Bestätigung gilt trotzdem", async () => {
    // Der Trainer hat seinen Teil getan. Ihn dafür scheitern zu lassen wäre
    // falsch – die Spartenleitung sieht den Vorgang liegen.
    //
    // Es wird auch keine Freigabe erbeten: ohne Händler gäbe es nichts
    // freizugeben, und eine Anfrage, die ins Leere liefe, ist keine Aufgabe.
    delete process.env.HAENDLER;
    const { aufrufe } = welt();

    const ergebnis = await bestaetigeListe("AUS-2026-001", "Am Sportplatz 14", "");

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.ohneHaendler).toBe(true);
    expect(ergebnis.anHaendler).toBe(0);
    expect(ergebnis.wartetAufFreigabe).toBe(false);
    expect(briefe(aufrufe)).toHaveLength(0);
  });

  test("und die Stufe bleibt stehen", async () => {
    // „Anfrage raus“ ohne verschickte Anfrage wäre eine Behauptung.
    delete process.env.HAENDLER;
    const { aufrufe } = welt();

    await bestaetigeListe("AUS-2026-001", "Am Sportplatz 14", "");

    const stufe = aufrufe.find(
      (a) =>
        a.pfad === "vorgang" &&
        a.methode === "PATCH" &&
        typeof a.koerper === "object" &&
        a.koerper !== null &&
        "stufe" in a.koerper,
    );
    expect(stufe).toBeUndefined();
  });

  test("ein Eintrag ohne Adresse zählt nicht als Händler", async () => {
    process.env.HAENDLER = "Intersport Uelzen|Herr Hillebrecht|,11teamsports||bormann@example.invalid";
    expect(anfrageHaendler().map((h) => h.email)).toEqual(["bormann@example.invalid"]);
  });

  test("ohne Anrede steht die neutrale da", async () => {
    process.env.HAENDLER = "11teamsports||bormann@example.invalid";
    expect(anfrageHaendler()[0].anrede).toBe("Sehr geehrte Damen und Herren");
  });
});

describe("Nach dem Versand", () => {
  test("wandert der Vorgang auf „Anfrage raus“", async () => {
    const { aufrufe } = welt();

    await bestaetigenUndFreigeben();

    const stufe = aufrufe.find(
      (a) =>
        a.pfad === "vorgang" &&
        a.methode === "PATCH" &&
        typeof a.koerper === "object" &&
        a.koerper !== null &&
        "stufe" in a.koerper,
    );
    expect(stufe?.koerper).toMatchObject({ stufe: 2 });
  });

  test("schlägt der Versand an alle fehl, bleibt die Stufe stehen", async () => {
    // Sonst stünde „Anfrage raus“ an einem Vorgang, zu dem kein Händler je
    // etwas bekommen hat.
    const { aufrufe } = welt({ resendGestoert: true });

    const ergebnis = await bestaetigenUndFreigeben();

    expect(ergebnis.anHaendler).toBe(0);
    const stufe = aufrufe.find(
      (a) =>
        a.pfad === "vorgang" &&
        a.methode === "PATCH" &&
        typeof a.koerper === "object" &&
        a.koerper !== null &&
        "stufe" in a.koerper,
    );
    expect(stufe).toBeUndefined();
  });

  test("ein Größencheck geht an keinen Händler", async () => {
    // Er bestellt nichts. Eine Anfrage wäre dort sinnlos.
    const { aufrufe } = stelleWelt({
      vorgang: satz({
        nummer: "AUS-2026-001",
        stufe: 1,
        ausstattungsart: "Nur Größen erfassen",
        groessenarten: ["oberteil"],
        artikel: [],
        trainerEmail: "trainer@example.invalid",
        personen: [person({ id: "p1", kontaktId: "111" })],
      }),
      kontakte: [kontakt("111", { firstname: "Anna", trainingsanzug_oberteil: "M" })],
    });

    const ergebnis = await bestaetigeListe("AUS-2026-001", "", "");

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.anHaendler).toBe(0);
    expect(ergebnis.ohneHaendler).toBe(false);
    expect(briefe(aufrufe)).toHaveLength(0);
  });
});

describe("Die CSV selbst", () => {
  const roh = {
    zeilen: [
      {
        artikel: 'adidas "Tiro"',
        hersteller: "adidas",
        herstellernummer: "10371232",
        farbe: "schwarz",
        groesse: "M",
        stueck: 1,
        nummer: "7",
        initialen: "AK",
        beflockung: "Standard",
      },
    ],
    summen: [{ artikel: 'adidas "Tiro"', groesse: "M", stueck: 1 }],
    gesamtStueck: 1,
  };

  test("Anführungszeichen im Artikelnamen zerlegen die Datei nicht", () => {
    const csv = alsCsv(roh, true, true);
    expect(csv).toContain('"adidas ""Tiro"""');
    // Kopf plus eine Zeile, nicht mehr.
    expect(csv.trim().split("\r\n")).toHaveLength(2);
  });

  test("sie beginnt mit einem BOM, damit Excel Spalten erkennt", () => {
    expect(alsCsv(roh, true, true).startsWith("﻿")).toBe(true);
  });

  test("ohne Nummer und Initialen fehlen die Spalten ganz", () => {
    const csv = alsCsv(roh, false, false);
    expect(csv).not.toContain("Rueckennummer");
    expect(csv).not.toContain("Initialen");
    expect(csv).not.toContain('"AK"');
  });
});

describe("Die Summen", () => {
  test("zählen gleiche Artikel und Größen zusammen", () => {
    const liste = {
      trikotsatz: false,
      initialenNoetig: false,
      zeilen: [
        { torwart: false, nummer: "", initialen: "", groessen: [{ art: "oberteil" as const, label: "Oberteil", wert: "M" }] },
        { torwart: false, nummer: "", initialen: "", groessen: [{ art: "oberteil" as const, label: "Oberteil", wert: "M" }] },
        { torwart: false, nummer: "", initialen: "", groessen: [{ art: "oberteil" as const, label: "Oberteil", wert: "L" }] },
      ],
    } as unknown as Parameters<typeof baueAnfrage>[0];

    const anfrage = baueAnfrage(liste, [
      { id: "a1", bezeichnung: "Jacke", groessenart: "oberteil", fuer: "alle", stueck: 1 },
    ]);

    expect(anfrage.gesamtStueck).toBe(3);
    expect(anfrage.summen).toEqual([
      { artikel: "Jacke", groesse: "L", stueck: 1 },
      { artikel: "Jacke", groesse: "M", stueck: 2 },
    ]);
  });

  test("zwei Stück je Person werden zweimal gezählt", () => {
    const liste = {
      trikotsatz: false,
      initialenNoetig: false,
      zeilen: [
        { torwart: false, nummer: "", initialen: "", groessen: [{ art: "oberteil" as const, label: "Oberteil", wert: "M" }] },
      ],
    } as unknown as Parameters<typeof baueAnfrage>[0];

    const anfrage = baueAnfrage(liste, [
      { id: "a1", bezeichnung: "Jacke", groessenart: "oberteil", fuer: "alle", stueck: 2 },
    ]);

    expect(anfrage.gesamtStueck).toBe(2);
  });
});
