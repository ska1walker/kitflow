import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { erinnerungslauf } from "./erinnerung";
import { kontakt, person, satz } from "../../test/satz";
import { raeumeUmgebung, stelleUmgebung, stelleWelt, type Welt } from "../../test/welt";

/**
 * Der Erinnerungslauf (M2).
 *
 * Das ist der einzige Mailweg in kitflow, den **kein Mensch auslöst**. Bei
 * allem anderen sitzt jemand davor und sieht, was rausgeht; hier läuft es
 * nachts durch. Ein Fehler wird deshalb nicht bemerkt, sondern zugestellt — an
 * 26 Leute, und bei einer Jugendmannschaft an deren Eltern.
 *
 * Geprüft wird darum jede einzelne Grenze, und zwar von beiden Seiten: dass
 * sie greift **und** dass sie nicht zu viel greift. Eine Bremse, die immer
 * bremst, sieht in einem Test genauso aus wie eine, die richtig bremst.
 */

const HEUTE = new Date("2026-09-20T16:00:00Z");

/** Zwei Leute in der Mannschaft, beide ohne Größe, beide mit Adresse. */
function welt(mehr: Partial<Welt> = {}) {
  return stelleWelt({
    vorgang: satz({
      nummer: "AUS-2026-001",
      stufe: 1,
      groessenFrist: "2026-09-30",
      personen: [person({ id: "p1", kontaktId: "111" }), person({ id: "p2", kontaktId: "222" })],
    }),
    kontakte: [
      kontakt("111", { firstname: "Anna", lastname: "Klein", email: "a@example.invalid" }),
      kontakt("222", { firstname: "Bernd", lastname: "Groß", email: "b@example.invalid" }),
    ],
    // Beide haben die erste Größen-Mail vor einer Woche bekommen.
    mails: [
      { art: "groessen", hs_kontakt_id: "111", gesendet_am: "2026-09-13T10:00:00Z" },
      { art: "groessen", hs_kontakt_id: "222", gesendet_am: "2026-09-13T10:00:00Z" },
    ],
    ...mehr,
  });
}

/** Die Mails, die wirklich bei Resend landeten. */
function briefe(aufrufe: { host: string; koerper: unknown }[]) {
  return aufrufe
    .filter((a) => a.host === "resend")
    .map((a) => a.koerper as { to: string[]; subject: string; text: string });
}

/** Was in `mail_versand` vermerkt wurde. */
function vermerkt(aufrufe: { host: string; methode: string; pfad: string; koerper: unknown }[]) {
  return aufrufe
    .filter((a) => a.host === "db" && a.pfad === "mail_versand" && a.methode === "POST")
    .map((a) => a.koerper as { art: string; hs_kontakt_id: string; umgeleitet: boolean });
}

beforeEach(() => {
  stelleUmgebung();
  process.env.RESEND_API_KEY = "zz-test";
  process.env.KITFLOW_BASIS = "https://zz.example.invalid";
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

describe("Der normale Fall", () => {
  test("wer noch keine Größe hat, wird erinnert", async () => {
    const { aufrufe } = welt();

    const lauf = await erinnerungslauf(HEUTE);

    expect(lauf.ok && lauf.bericht.verschickt).toBe(2);
    const post = briefe(aufrufe);
    expect(post).toHaveLength(2);
    expect(post.map((b) => b.to[0]).sort()).toEqual(["a@example.invalid", "b@example.invalid"]);
  });

  test("jeder bekommt nur seinen eigenen Link", async () => {
    // Der Link trägt die Personen-ID. Wer den falschen bekommt, ändert fremde
    // Größen.
    const { aufrufe } = welt();
    await erinnerungslauf(HEUTE);

    const [anna, bernd] = briefe(aufrufe).sort((a, b) => a.to[0].localeCompare(b.to[0]));
    expect(anna.text).toContain("/g/AUS-2026-001/111");
    expect(anna.text).not.toContain("/g/AUS-2026-001/222");
    expect(bernd.text).toContain("/g/AUS-2026-001/222");
    expect(bernd.text).not.toContain("/g/AUS-2026-001/111");
  });

  test("keine fremden Namen in der Mail", async () => {
    // Sie erreicht Eltern; wer sonst in der Mannschaft ist, geht sie nichts an.
    const { aufrufe } = welt();
    await erinnerungslauf(HEUTE);

    const [anna] = briefe(aufrufe).sort((a, b) => a.to[0].localeCompare(b.to[0]));
    expect(anna.text).toContain("Anna");
    expect(anna.text).not.toContain("Bernd");
    // Auch kein Nachname, nicht einmal der eigene.
    expect(anna.text).not.toContain("Klein");
  });

  test("der Versand wird je Person vermerkt", async () => {
    const { aufrufe } = welt();
    await erinnerungslauf(HEUTE);

    const spuren = vermerkt(aufrufe);
    expect(spuren).toHaveLength(2);
    expect(spuren.every((s) => s.art === "erinnerung")).toBe(true);
    expect(spuren.map((s) => s.hs_kontakt_id).sort()).toEqual(["111", "222"]);
  });

  test("der Verlauf nennt keine Namen", async () => {
    // Er steht auch auf der Spieler-Ansicht.
    const { aufrufe } = welt();
    await erinnerungslauf(HEUTE);

    const eintrag = aufrufe.find(
      (a) => a.pfad === "ereignis" && a.methode === "POST",
    )?.koerper as { text: string } | undefined;
    expect(eintrag?.text).toBe("Erinnerung an 2 Personen verschickt");
    expect(eintrag?.text).not.toContain("Anna");
  });
});

describe("Höchstens zwei", () => {
  test("nach einer Erinnerung kommt die zweite", async () => {
    const { aufrufe } = welt({
      mails: [
        { art: "groessen", hs_kontakt_id: "111", gesendet_am: "2026-09-10T10:00:00Z" },
        { art: "erinnerung", hs_kontakt_id: "111", gesendet_am: "2026-09-14T10:00:00Z" },
      ],
    });

    const lauf = await erinnerungslauf(HEUTE);

    expect(lauf.ok && lauf.bericht.verschickt).toBe(1);
    // Die zweite sagt, dass sie die letzte ist – sonst legt man sie weg.
    expect(briefe(aufrufe)[0].subject).toContain("Letzte Erinnerung");
    expect(briefe(aufrufe)[0].text).toContain("letzte Erinnerung");
  });

  test("nach zwei Erinnerungen kommt keine dritte", async () => {
    const { aufrufe } = welt({
      mails: [
        { art: "groessen", hs_kontakt_id: "111", gesendet_am: "2026-09-01T10:00:00Z" },
        { art: "erinnerung", hs_kontakt_id: "111", gesendet_am: "2026-09-05T10:00:00Z" },
        { art: "erinnerung", hs_kontakt_id: "111", gesendet_am: "2026-09-10T10:00:00Z" },
      ],
    });

    const lauf = await erinnerungslauf(HEUTE);

    expect(lauf.ok && lauf.bericht.verschickt).toBe(0);
    expect(lauf.ok && lauf.bericht.uebersprungen["genug-erinnert"]).toBe(1);
    expect(briefe(aufrufe)).toHaveLength(0);
  });

  test("zweimal am selben Tag gestartet schickt nicht zweimal", async () => {
    // Ein Lauf, der von Hand nachgestoßen wird, darf nichts verdoppeln.
    const { aufrufe } = welt();
    await erinnerungslauf(HEUTE);
    const nachDemErsten = briefe(aufrufe).length;

    // Der zweite Lauf sieht die Spuren des ersten.
    const zweite = welt({
      mails: [
        { art: "groessen", hs_kontakt_id: "111", gesendet_am: "2026-09-13T10:00:00Z" },
        { art: "groessen", hs_kontakt_id: "222", gesendet_am: "2026-09-13T10:00:00Z" },
        { art: "erinnerung", hs_kontakt_id: "111", gesendet_am: "2026-09-20T16:00:00Z" },
        { art: "erinnerung", hs_kontakt_id: "222", gesendet_am: "2026-09-20T16:00:00Z" },
      ],
    });
    const lauf = await erinnerungslauf(HEUTE);

    expect(nachDemErsten).toBe(2);
    expect(lauf.ok && lauf.bericht.verschickt).toBe(0);
    expect(briefe(zweite.aufrufe)).toHaveLength(0);
  });
});

describe("Mindestens drei Tage Abstand", () => {
  test("zwei Tage nach der letzten Mail geht nichts raus", async () => {
    const { aufrufe } = welt({
      mails: [{ art: "groessen", hs_kontakt_id: "111", gesendet_am: "2026-09-18T10:00:00Z" }],
    });

    const lauf = await erinnerungslauf(HEUTE);

    expect(lauf.ok && lauf.bericht.verschickt).toBe(0);
    expect(lauf.ok && lauf.bericht.uebersprungen["zu-frisch"]).toBe(1);
    expect(briefe(aufrufe)).toHaveLength(0);
  });

  test("drei Tage danach schon", async () => {
    const { aufrufe } = welt({
      mails: [{ art: "groessen", hs_kontakt_id: "111", gesendet_am: "2026-09-17T10:00:00Z" }],
    });

    const lauf = await erinnerungslauf(HEUTE);

    expect(lauf.ok && lauf.bericht.verschickt).toBe(1);
    expect(briefe(aufrufe)).toHaveLength(1);
  });

  test("der Abstand zählt auch zur ersten Größen-Mail", async () => {
    // Sonst käme einen Tag nach der Größen-Mail schon die Erinnerung. Die
    // Erinnerung ist alt genug, die Größen-Mail nicht.
    const { aufrufe } = welt({
      mails: [
        { art: "erinnerung", hs_kontakt_id: "111", gesendet_am: "2026-09-01T10:00:00Z" },
        { art: "groessen", hs_kontakt_id: "111", gesendet_am: "2026-09-19T10:00:00Z" },
      ],
    });

    const lauf = await erinnerungslauf(HEUTE);

    expect(lauf.ok && lauf.bericht.uebersprungen["zu-frisch"]).toBe(1);
    expect(briefe(aufrufe)).toHaveLength(0);
  });
});

describe("Nie nach der Frist", () => {
  test("am Tag der Frist noch", async () => {
    const { aufrufe } = welt({
      vorgang: satz({
        stufe: 1,
        groessenFrist: "2026-09-20",
        personen: [person({ id: "p1", kontaktId: "111" })],
      }),
      mails: [{ art: "groessen", hs_kontakt_id: "111", gesendet_am: "2026-09-13T10:00:00Z" }],
    });

    const lauf = await erinnerungslauf(HEUTE);

    expect(lauf.ok && lauf.bericht.verschickt).toBe(1);
    expect(briefe(aufrufe)[0].text).toContain("Heute ist der letzte Tag");
  });

  test("einen Tag danach nicht mehr", async () => {
    const { aufrufe } = welt({
      vorgang: satz({
        stufe: 1,
        groessenFrist: "2026-09-19",
        personen: [person({ id: "p1", kontaktId: "111" })],
      }),
    });

    const lauf = await erinnerungslauf(HEUTE);

    expect(lauf.ok && lauf.bericht.verschickt).toBe(0);
    // Der Vorgang wird gar nicht erst angesehen.
    expect(lauf.ok && lauf.bericht.vorgaenge).toBe(0);
    expect(briefe(aufrufe)).toHaveLength(0);
  });

  test("ohne Frist gibt es nichts zu erinnern", async () => {
    const { aufrufe } = welt({
      vorgang: satz({
        stufe: 1,
        groessenFrist: undefined,
        personen: [person({ id: "p1", kontaktId: "111" })],
      }),
    });

    const lauf = await erinnerungslauf(HEUTE);

    expect(lauf.ok && lauf.bericht.vorgaenge).toBe(0);
    expect(briefe(aufrufe)).toHaveLength(0);
  });

  test("die Mail sagt, wie viel Zeit bleibt", async () => {
    const { aufrufe } = welt();
    await erinnerungslauf(HEUTE);

    // 20.09. bis 30.09. sind zehn Tage.
    expect(briefe(aufrufe)[0].text).toContain("Noch 10 Tage");
    expect(briefe(aufrufe)[0].text).toContain("30.09.");
  });
});

describe("Wen der Lauf auslässt", () => {
  test("wer schon eingetragen hat", async () => {
    const { aufrufe } = welt({
      kontakte: [
        kontakt("111", {
          firstname: "Anna",
          email: "a@example.invalid",
          trainingsanzug_oberteil: "M",
        }),
        kontakt("222", { firstname: "Bernd", email: "b@example.invalid" }),
      ],
    });

    const lauf = await erinnerungslauf(HEUTE);

    expect(lauf.ok && lauf.bericht.uebersprungen["hat-groesse"]).toBe(1);
    expect(briefe(aufrufe).map((b) => b.to[0])).toEqual(["b@example.invalid"]);
  });

  test("wer keine Adresse hat", async () => {
    const { aufrufe } = welt({
      kontakte: [
        kontakt("111", { firstname: "Anna" }),
        kontakt("222", { firstname: "Bernd", email: "b@example.invalid" }),
      ],
    });

    const lauf = await erinnerungslauf(HEUTE);

    expect(lauf.ok && lauf.bericht.uebersprungen["keine-adresse"]).toBe(1);
    expect(briefe(aufrufe)).toHaveLength(1);
  });

  test("wer nie eine erste Mail bekommen hat", async () => {
    // Eine „Erinnerung" an jemanden, der nie einen Link bekam, wäre die erste
    // Ansprache überhaupt – und klänge wie ein Vorwurf. Der Fall tritt ein:
    // der Trainer wählt aus, wen er anschreibt, und Nachzügler kommen dazu.
    const { aufrufe } = welt({
      mails: [{ art: "groessen", hs_kontakt_id: "111", gesendet_am: "2026-09-13T10:00:00Z" }],
    });

    const lauf = await erinnerungslauf(HEUTE);

    expect(lauf.ok && lauf.bericht.uebersprungen["nie-angeschrieben"]).toBe(1);
    expect(briefe(aufrufe).map((b) => b.to[0])).toEqual(["a@example.invalid"]);
  });

  test("wer aus dem Vorgang genommen wurde", async () => {
    const { aufrufe } = welt({
      vorgang: satz({
        stufe: 1,
        groessenFrist: "2026-09-30",
        personen: [
          person({ id: "p1", kontaktId: "111" }),
          person({ id: "p2", kontaktId: "222", ausgeschlossen: true }),
        ],
      }),
    });

    const lauf = await erinnerungslauf(HEUTE);

    expect(lauf.ok && lauf.bericht.verschickt).toBe(1);
    expect(briefe(aufrufe).map((b) => b.to[0])).toEqual(["a@example.invalid"]);
  });

  test("Vorgänge auf einer anderen Stufe", async () => {
    // Auf Stufe 2 ist die Liste schon raus; eine Erinnerung forderte dazu auf,
    // etwas einzutragen, das niemand mehr ändern kann.
    const { aufrufe } = welt({
      vorgang: satz({
        stufe: 2,
        groessenFrist: "2026-09-30",
        personen: [person({ id: "p1", kontaktId: "111" })],
      }),
    });

    const lauf = await erinnerungslauf(HEUTE);

    expect(lauf.ok && lauf.bericht.vorgaenge).toBe(0);
    expect(briefe(aufrufe)).toHaveLength(0);
  });
});

describe("Die Testbremse zählt nicht als Erinnerung", () => {
  test("eine umgeleitete Mail wird als umgeleitet vermerkt", async () => {
    // Sonst bliebe beim ersten scharfen Lauf die Hälfte ohne Erinnerung: die
    // Mail lag in Kais Postfach, nicht im Postfach des Spielers.
    process.env.MAIL_NUR_AN = "kai@example.invalid";
    const { aufrufe } = welt();

    const lauf = await erinnerungslauf(HEUTE);

    expect(lauf.ok && lauf.bericht.umgeleitet).toBe(true);
    expect(briefe(aufrufe).every((b) => b.to[0] === "kai@example.invalid")).toBe(true);
    expect(vermerkt(aufrufe).every((s) => s.umgeleitet === true)).toBe(true);
  });

  test("eine umgeleitete Erinnerung sperrt die echte nicht", async () => {
    // `mailsAn` liest nur, was wirklich ankam (`umgeleitet=is.false`).
    const { aufrufe } = welt({
      mails: [
        { art: "groessen", hs_kontakt_id: "111", gesendet_am: "2026-09-13T10:00:00Z" },
        {
          art: "erinnerung",
          hs_kontakt_id: "111",
          gesendet_am: "2026-09-19T10:00:00Z",
          umgeleitet: true,
        },
      ],
    });

    const lauf = await erinnerungslauf(HEUTE);

    // Die umgeleitete zählt weder gegen das Höchstmaß noch für den Abstand.
    expect(lauf.ok && lauf.bericht.verschickt).toBe(1);
    expect(briefe(aufrufe)[0].subject).not.toContain("Letzte");
  });
});

describe("Wenn etwas ausfällt", () => {
  test("schweigt die Datenbank, läuft gar nichts", async () => {
    const { aufrufe } = welt({ dbGestoert: true });

    const lauf = await erinnerungslauf(HEUTE);

    expect(lauf.ok).toBe(false);
    expect(!lauf.ok && lauf.grund).toBe("gestoert");
    expect(briefe(aufrufe)).toHaveLength(0);
  });

  test("schweigt HubSpot, geht dieser Vorgang leer aus – statt alle zu erinnern", async () => {
    const { aufrufe } = welt({ hubspotGestoert: true });

    const lauf = await erinnerungslauf(HEUTE);

    expect(lauf.ok && lauf.bericht.verschickt).toBe(0);
    expect(briefe(aufrufe)).toHaveLength(0);
  });

  test("schweigt die Mailspur, wird niemand erinnert", async () => {
    // Der gefährlichste Fall: „konnte nicht fragen" als „noch keine Mail" zu
    // lesen hieße, die dritte Erinnerung zu schicken.
    const { aufrufe } = welt({ mailsGestoert: true });

    const lauf = await erinnerungslauf(HEUTE);

    expect(lauf.ok && lauf.bericht.verschickt).toBe(0);
    expect(lauf.ok && lauf.bericht.fehlgeschlagen).toBe(2);
    expect(briefe(aufrufe)).toHaveLength(0);
  });

  test("ohne Resend-Schlüssel läuft nichts an", async () => {
    delete process.env.RESEND_API_KEY;
    const { aufrufe } = welt();

    const lauf = await erinnerungslauf(HEUTE);

    expect(!lauf.ok && lauf.grund).toBe("kein-versand");
    expect(aufrufe).toHaveLength(0);
  });

  test("lehnt Resend eine Adresse ab, reißt sie die anderen nicht mit", async () => {
    const { aufrufe } = welt({ resendGestoert: true });

    const lauf = await erinnerungslauf(HEUTE);

    expect(lauf.ok && lauf.bericht.verschickt).toBe(0);
    expect(lauf.ok && lauf.bericht.fehlgeschlagen).toBe(2);
    // Nichts vermerkt: sonst gilt als erinnert, wer keine Mail hat.
    expect(vermerkt(aufrufe)).toHaveLength(0);
  });
});
