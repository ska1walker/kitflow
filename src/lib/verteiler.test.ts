import { da } from "../../test/abruf";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MAIL_GROESSEN, sendeGroessenMails, verteiler } from "./vorgaenge";
import { artikel, kontakt, person, satz } from "../../test/satz";
import { raeumeUmgebung, stelleUmgebung, stelleWelt, type Aufruf } from "../../test/welt";

/**
 * Die Größen-Mail an die Mannschaft (M2a) und die Auswahl davor.
 *
 * Bis hierher verteilte der Trainer die Links von Hand aus M1 — bei Ü40 Team 3
 * wären das 24 gewesen. Diese Mail geht an genau eine Person und trägt genau
 * deren Link. Zwei Dinge dürfen dabei nie passieren:
 *
 *   1. dass jemand eine Mail bekommt, der nicht zum Vorgang gehört
 *   2. dass jemand den Link eines anderen bekommt
 *
 * Beides ließe sich über ein nachgebautes Formular versuchen, denn die IDs
 * stehen als Häkchen im HTML.
 */

const DREI = () =>
  satz({
    artikel: [artikel()],
    personen: [
      person(),
      person({ id: "p2", kontaktId: "222" }),
      person({ id: "p3", kontaktId: "333" }),
    ],
  });

const KONTAKTE = [
  kontakt("111", { firstname: "Anna", email: "anna@example.invalid" }),
  kontakt("222", { firstname: "Bernd", email: "bernd@example.invalid" }),
  // Uwe Christiani und Daniel Klein haben keine Adresse – der Fall ist echt.
  kontakt("333", { firstname: "Uwe", email: "" }),
];

beforeEach(() => {
  stelleUmgebung();
  process.env.RESEND_API_KEY = "zz-test";
  process.env.KITFLOW_BASIS = "https://zz.example.invalid";
  delete process.env.MAIL_NUR_AN;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  raeumeUmgebung();
  delete process.env.RESEND_API_KEY;
  delete process.env.KITFLOW_BASIS;
  delete process.env.MAIL_NUR_AN;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Die Briefe, die bei Resend ankämen. */
function briefe(aufrufe: Aufruf[]) {
  return aufrufe
    .filter((a) => a.host === "resend")
    .map((a) => a.koerper as { to: string[]; subject: string; text: string; html: string });
}

describe("Wer zur Auswahl steht", () => {
  test("die Mannschaft mit Adresse, Größe und letzter Mail", async () => {
    stelleWelt({
      vorgang: DREI(),
      kontakte: [
        kontakt("111", { firstname: "Anna", email: "anna@example.invalid", trikot: "L" }),
        kontakt("222", { firstname: "Bernd", email: "bernd@example.invalid" }),
        kontakt("333", { firstname: "Uwe", email: "" }),
      ],
      mails: [
        { art: MAIL_GROESSEN, hs_kontakt_id: "222", gesendet_am: "2026-09-17T08:00:00+00:00" },
      ],
    });

    const liste = da(await verteiler("AUS-2026-001"));

    expect(liste.empfaenger).toEqual([
      { person: "111", name: "Anna Böhm", hatAdresse: true, zuletzt: "", hatGroesse: true },
      {
        person: "222",
        name: "Bernd Böhm",
        hatAdresse: true,
        zuletzt: "2026-09-17T08:00:00+00:00",
        hatGroesse: false,
      },
      { person: "333", name: "Uwe Böhm", hatAdresse: false, zuletzt: "", hatGroesse: false },
    ]);
  });

  test("sortiert nach Namen, nicht nach der Laune von HubSpot", async () => {
    // Die Suche gibt die Kontakte in beliebiger Reihenfolge zurück, und sie
    // wechselt zwischen zwei Besuchen. Wer 26 Haken setzt, will die Liste
    // zweimal gleich vorfinden.
    stelleWelt({
      vorgang: DREI(),
      kontakte: [
        kontakt("111", { firstname: "Uwe", email: "u@example.invalid" }),
        kontakt("222", { firstname: "Anna", email: "a@example.invalid" }),
        kontakt("333", { firstname: "Bernd", email: "b@example.invalid" }),
      ],
    });

    const liste = da(await verteiler("AUS-2026-001"));
    expect(liste.empfaenger.map((e) => e.name)).toEqual([
      "Anna Böhm",
      "Bernd Böhm",
      "Uwe Böhm",
    ]);
  });

  test("die Adressen selbst stehen nirgends drin", async () => {
    // Die Karte läuft im Browser. Eine Mannschaftsliste mit E-Mail-Adressen
    // wäre genau das, was CLAUDE.md ausschließt.
    stelleWelt({ vorgang: DREI(), kontakte: KONTAKTE });

    const liste = da(await verteiler("AUS-2026-001"));
    expect(JSON.stringify(liste)).not.toContain("anna@example.invalid");
  });

  test("eine umgeleitete Testmail zählt nicht als verschickt", async () => {
    // Sonst bekäme beim ersten scharfen Lauf niemand eine Mail, weil die
    // Probeläufe alle in Kais Postfach als „schon erledigt“ stünden.
    stelleWelt({
      vorgang: DREI(),
      kontakte: KONTAKTE,
      mails: [
        {
          art: MAIL_GROESSEN,
          hs_kontakt_id: "111",
          gesendet_am: "2026-09-17T08:00:00+00:00",
          umgeleitet: true,
        },
      ],
    });

    const liste = da(await verteiler("AUS-2026-001"));
    expect(liste.empfaenger[0].zuletzt).toBe("");
  });

  test("wer ausgeschlossen ist, steht gar nicht zur Wahl", async () => {
    stelleWelt({
      vorgang: satz({
        artikel: [artikel()],
        personen: [person(), person({ id: "p2", kontaktId: "222", ausgeschlossen: true })],
      }),
      kontakte: KONTAKTE,
    });

    const liste = da(await verteiler("AUS-2026-001"));
    expect(liste.empfaenger.map((e) => e.person)).toEqual(["111"]);
  });

  test("schweigt die Datenbank zum Verschickten, gibt es keine Liste", async () => {
    // Eine Liste, in der niemand als angeschrieben steht, verführt zum
    // zweiten Versand an die ganze Mannschaft.
    //
    // Nur die Mailspur schweigt: Vorgang und Kontakte kommen an. Mit
    // `dbGestoert` wäre der Vorgang schon vorher gescheitert — der Test stand
    // zuerst so da und sagte nichts über die Stelle, die er prüfen soll.
    stelleWelt({ vorgang: DREI(), kontakte: KONTAKTE, mailsGestoert: true });
    expect((await verteiler("AUS-2026-001")).stand).toBe("gestoert");
  });
});

describe("Was rausgeht", () => {
  test("jeder bekommt genau seinen eigenen Link", async () => {
    const { aufrufe } = stelleWelt({ vorgang: DREI(), kontakte: KONTAKTE });

    const ergebnis = await sendeGroessenMails("AUS-2026-001", ["111", "222"]);

    expect(ergebnis).toMatchObject({ ok: true, verschickt: 2, fehlgeschlagen: 0 });
    const post = briefe(aufrufe);
    expect(post).toHaveLength(2);
    expect(post[0].to).toEqual(["anna@example.invalid"]);
    expect(post[0].text).toContain("/g/AUS-2026-001/111?t=");
    expect(post[0].text).not.toContain("/g/AUS-2026-001/222?t=");
    expect(post[1].to).toEqual(["bernd@example.invalid"]);
    expect(post[1].text).toContain("/g/AUS-2026-001/222?t=");
  });

  test("die Mail nennt Mannschaft, Größenart und Frist", async () => {
    const { aufrufe } = stelleWelt({ vorgang: DREI(), kontakte: KONTAKTE });

    await sendeGroessenMails("AUS-2026-001", ["111"]);

    const post = briefe(aufrufe)[0];
    expect(post.subject).toBe("Ü40 Team 3: Größe bitte bis 30.09. eintragen");
    expect(post.text).toContain("Hallo Anna");
    expect(post.text).toContain("Oberteil");
  });

  test("eine fremde ID bekommt nichts", async () => {
    // Die IDs stehen als Häkchen im HTML. Wer eine andere einträgt, darf damit
    // keine Mail an einen beliebigen Kontakt auslösen.
    const { aufrufe } = stelleWelt({ vorgang: DREI(), kontakte: KONTAKTE });

    const ergebnis = await sendeGroessenMails("AUS-2026-001", ["999"]);

    expect(ergebnis).toEqual({ ok: false, grund: "niemand" });
    expect(briefe(aufrufe)).toHaveLength(0);
  });

  test("wer ausgeschlossen ist, bekommt auch dann nichts, wenn er angehakt wird", async () => {
    const { aufrufe } = stelleWelt({
      vorgang: satz({
        artikel: [artikel()],
        personen: [person({ ausgeschlossen: true })],
      }),
      kontakte: KONTAKTE,
    });

    expect(await sendeGroessenMails("AUS-2026-001", ["111"])).toEqual({
      ok: false,
      grund: "niemand",
    });
    expect(briefe(aufrufe)).toHaveLength(0);
  });

  test("ohne Adresse geht nichts raus, und es zählt als fehlgeschlagen", async () => {
    const { aufrufe } = stelleWelt({ vorgang: DREI(), kontakte: KONTAKTE });

    const ergebnis = await sendeGroessenMails("AUS-2026-001", ["111", "333"]);

    expect(ergebnis).toMatchObject({ ok: true, verschickt: 1, fehlgeschlagen: 1 });
    expect(briefe(aufrufe)).toHaveLength(1);
  });

  test("nach der Größenphase geht keine Mail mehr raus", async () => {
    const { aufrufe } = stelleWelt({
      vorgang: satz({ stufe: 2, artikel: [artikel()], personen: [person()] }),
      kontakte: KONTAKTE,
    });

    expect(await sendeGroessenMails("AUS-2026-001", ["111"])).toEqual({ ok: false, grund: "zu" });
    expect(briefe(aufrufe)).toHaveLength(0);
  });

  test("jede verschickte Mail wird vermerkt", async () => {
    const { aufrufe } = stelleWelt({ vorgang: DREI(), kontakte: KONTAKTE });

    await sendeGroessenMails("AUS-2026-001", ["111", "222"]);

    const vermerke = aufrufe.filter((a) => a.pfad === "mail_versand" && a.methode === "POST");
    expect(vermerke.map((v) => v.koerper)).toEqual([
      { vorgang_id: "v1", art: MAIL_GROESSEN, hs_kontakt_id: "111", umgeleitet: false },
      { vorgang_id: "v1", art: MAIL_GROESSEN, hs_kontakt_id: "222", umgeleitet: false },
    ]);
  });

  test("mit gesetzter Bremse geht alles an eine Adresse – und wird als umgeleitet vermerkt", async () => {
    process.env.MAIL_NUR_AN = "boehm.kai@gmail.com";
    const { aufrufe } = stelleWelt({ vorgang: DREI(), kontakte: KONTAKTE });

    const ergebnis = await sendeGroessenMails("AUS-2026-001", ["111", "222"]);

    expect(ergebnis).toMatchObject({ ok: true, umgeleitetAn: "boehm.kai@gmail.com" });
    for (const post of briefe(aufrufe)) expect(post.to).toEqual(["boehm.kai@gmail.com"]);
    const vermerke = aufrufe.filter((a) => a.pfad === "mail_versand" && a.methode === "POST");
    expect(vermerke.every((v) => (v.koerper as { umgeleitet: boolean }).umgeleitet)).toBe(true);
  });

  test("lehnt Resend eine Adresse ab, reißt sie die übrigen nicht mit", async () => {
    const { aufrufe } = stelleWelt({ vorgang: DREI(), kontakte: KONTAKTE, resendGestoert: true });

    const ergebnis = await sendeGroessenMails("AUS-2026-001", ["111", "222"]);

    expect(ergebnis).toMatchObject({ ok: true, verschickt: 0, fehlgeschlagen: 2 });
    // Beide wurden versucht – der erste Fehlschlag hat den zweiten nicht verhindert.
    expect(briefe(aufrufe)).toHaveLength(2);
    expect(aufrufe.filter((a) => a.pfad === "mail_versand" && a.methode === "POST")).toHaveLength(0);
  });

  test("ohne Resend-Schlüssel wird gar nichts erst versucht", async () => {
    delete process.env.RESEND_API_KEY;
    const { aufrufe } = stelleWelt({ vorgang: DREI(), kontakte: KONTAKTE });

    expect(await sendeGroessenMails("AUS-2026-001", ["111"])).toEqual({
      ok: false,
      grund: "kein-versand",
    });
    expect(aufrufe).toHaveLength(0);
  });

  test("der Verlauf hält den Versand fest, ohne Namen zu nennen", async () => {
    // Der Verlauf steht auch auf der Spieler-Ansicht (CLAUDE.md).
    const { aufrufe } = stelleWelt({ vorgang: DREI(), kontakte: KONTAKTE });

    await sendeGroessenMails("AUS-2026-001", ["111", "222"]);

    const eintrag = aufrufe.find((a) => a.pfad === "ereignis" && a.methode === "POST");
    const koerper = eintrag?.koerper as { text: string };
    expect(koerper.text).toBe("Größen-Mail an 2 Personen verschickt");
    expect(koerper.text).not.toContain("Anna");
  });
});
