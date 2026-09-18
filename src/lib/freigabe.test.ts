import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { bestaetigeListe, gibFrei, lehneAb } from "./vorgaenge";
import { rufText } from "./freigabe";
import { artikel, kontakt, person, satz } from "../../test/satz";
import { raeumeUmgebung, stelleUmgebung, stelleWelt, type Welt } from "../../test/welt";

/**
 * Die Freigabe der Händleranfrage.
 *
 * **Der Satz, um den es geht:** ohne Freigabe der Spartenleitung geht keine
 * Mail an die Händler. Bis zum 18.09.2026 löste die Bestätigung des Trainers
 * M4 unmittelbar aus; das war die einzige Mail, die kitflow nach draußen
 * schickt, an zwei echte Geschäftspartner, und nicht zurückzuholen.
 *
 * Die Tests hier prüfen drei Dinge, in dieser Reihenfolge nach Gewicht:
 *
 * 1. Ohne Freigabe geht **nichts** raus.
 * 2. Zweimal freigeben verschickt **nicht** zweimal.
 * 3. Telegram und Todoist dürfen ausfallen, ohne dass die Freigabe verlorengeht.
 */

const HAENDLER = "11teamsports|Herr Bormann|bormann@example.invalid";
const WER = { art: "mensch" as const, email: "kai@example.invalid" };

function welt(mehr: Partial<Welt> = {}) {
  return stelleWelt({
    vorgang: satz({
      nummer: "AUS-2026-001",
      stufe: 1,
      trainerEmail: "trainer@example.invalid",
      lieferadresse: "Am Sportplatz 14",
      artikel: [artikel({ id: "a1", bezeichnung: "Trainingsjacke", groessenart: "oberteil" })],
      personen: [person({ id: "p1", kontaktId: "111" })],
    }),
    kontakte: [kontakt("111", { firstname: "Anna", trainingsanzug_oberteil: "M" })],
    ...mehr,
  });
}

type Brief = { to: string[]; subject: string; text: string };

function briefe(aufrufe: { host: string; koerper: unknown }[]): Brief[] {
  return aufrufe.filter((a) => a.host === "resend").map((a) => a.koerper as Brief);
}

function anHaendler(aufrufe: { host: string; koerper: unknown }[]): Brief[] {
  return briefe(aufrufe).filter((b) => b.to[0] === "bormann@example.invalid");
}

/** Wie oft die Stufe gesetzt wurde – „Anfrage raus“ ist Stufe 2. */
function stufenwechsel(aufrufe: { pfad: string; methode: string; koerper: unknown }[]) {
  return aufrufe.filter(
    (a) =>
      a.pfad === "vorgang" &&
      a.methode === "PATCH" &&
      typeof a.koerper === "object" &&
      a.koerper !== null &&
      "stufe" in a.koerper,
  );
}

/** Die PATCH-Aufrufe, die den Freigabe-Stand setzen. */
function freigabeWechsel(aufrufe: { pfad: string; methode: string; koerper: unknown }[]) {
  return aufrufe
    .filter(
      (a) =>
        a.pfad === "vorgang" &&
        a.methode === "PATCH" &&
        typeof a.koerper === "object" &&
        a.koerper !== null &&
        "freigabe_stand" in a.koerper,
    )
    .map((a) => a.koerper as Record<string, unknown>);
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
  delete process.env.TELEGRAM_TOKEN;
  delete process.env.TELEGRAM_CHAT;
  delete process.env.TODOIST_TOKEN;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Ohne Freigabe geht nichts an die Händler", () => {
  test("die Bestätigung allein verschickt keine Anfrage", async () => {
    const { aufrufe } = welt();

    const ergebnis = await bestaetigeListe("AUS-2026-001", "Am Sportplatz 14", "");

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.wartetAufFreigabe).toBe(true);
    expect(ergebnis.anHaendler).toBe(0);
    expect(anHaendler(aufrufe)).toHaveLength(0);
  });

  test("und die Stufe bleibt auf „Größen laufen“", async () => {
    // „Anfrage raus“ an einem Vorgang, zu dem kein Händler etwas bekam, wäre
    // eine Behauptung – und niemand sähe mehr hin.
    const { aufrufe } = welt();

    await bestaetigeListe("AUS-2026-001", "Am Sportplatz 14", "");

    expect(stufenwechsel(aufrufe)).toHaveLength(0);
  });

  test("der Vorgang steht danach auf „Freigabe offen“", async () => {
    const { aufrufe } = welt();

    await bestaetigeListe("AUS-2026-001", "Am Sportplatz 14", "");

    expect(freigabeWechsel(aufrufe)).toContainEqual(
      expect.objectContaining({ freigabe_stand: "offen" }),
    );
  });

  test("der Trainer erfährt, dass es zur Freigabe geht", async () => {
    // Sonst steht er vor einer bestätigten Liste, bei der nichts passiert.
    const { aufrufe } = welt();

    const ergebnis = await bestaetigeListe("AUS-2026-001", "Am Sportplatz 14", "");

    // Die Auskunft steht im Rückgabewert, den F3 anzeigt – nicht in einer Mail.
    expect(ergebnis.wartetAufFreigabe).toBe(true);
    expect(briefe(aufrufe)).toHaveLength(0);
  });
});

describe("Mit Freigabe", () => {
  test("geht die Anfrage raus und die Stufe wandert", async () => {
    const { aufrufe } = welt();
    await bestaetigeListe("AUS-2026-001", "Am Sportplatz 14", "");

    const ergebnis = await gibFrei("AUS-2026-001", WER);

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.anHaendler).toBe(1);
    expect(anHaendler(aufrufe)).toHaveLength(1);
    expect(stufenwechsel(aufrufe)[0]?.koerper).toMatchObject({ stufe: 2 });
  });

  test("steht im Verlauf, wer freigegeben hat", async () => {
    // Der Sinn des Logins ist, dass eine Mail nach draußen nicht anonym
    // ausgelöst wird.
    const { aufrufe } = welt();
    await bestaetigeListe("AUS-2026-001", "Am Sportplatz 14", "");
    await gibFrei("AUS-2026-001", WER);

    const eintraege = aufrufe
      .filter((a) => a.pfad === "ereignis" && a.methode === "POST")
      .map((a) => a.koerper as { art: string; sub: string | null });
    const erteilt = eintraege.find((e) => e.art === "freigabe_erteilt");
    expect(erteilt?.sub).toBe("kai@example.invalid");
  });

  test("eine Regel steht genauso im Verlauf wie ein Mensch", async () => {
    // Die Freigabe soll später automatisch durchlaufen. Dann darf im Verlauf
    // nicht plötzlich niemand mehr stehen.
    const { aufrufe } = welt();
    await bestaetigeListe("AUS-2026-001", "Am Sportplatz 14", "");
    await gibFrei("AUS-2026-001", { art: "regel", name: "unter 500 Euro" });

    const eintraege = aufrufe
      .filter((a) => a.pfad === "ereignis" && a.methode === "POST")
      .map((a) => a.koerper as { art: string; sub: string | null });
    const erteilt = eintraege.find((e) => e.art === "freigabe_erteilt");
    expect(erteilt?.sub).toBe("Regel: unter 500 Euro");
  });

  test("zweimal freigeben verschickt nicht zweimal", async () => {
    // Zwei Klicks auf denselben Vorgang wären zwei Anfragen beim Händler, und
    // die zweite wäre nicht zu erklären.
    const { aufrufe } = welt();
    await bestaetigeListe("AUS-2026-001", "Am Sportplatz 14", "");

    const erste = await gibFrei("AUS-2026-001", WER);
    const zweite = await gibFrei("AUS-2026-001", WER);

    expect(erste.ok).toBe(true);
    expect(zweite.ok).toBe(false);
    expect(zweite.grund).toBe("nicht_offen");
    expect(anHaendler(aufrufe)).toHaveLength(1);
  });

  test("ohne vorherige Bestätigung geht gar nichts", async () => {
    // Der Stand ist „keine“, nicht „offen“. Wer das zusammenwirft, kann eine
    // Anfrage an einem Vorgang auslösen, den nie jemand geprüft hat.
    const { aufrufe } = welt();

    const ergebnis = await gibFrei("AUS-2026-001", WER);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.grund).toBe("nicht_offen");
    expect(anHaendler(aufrufe)).toHaveLength(0);
  });

  test("schlägt der Versand fehl, gilt die Freigabe nicht als erteilt", async () => {
    // Eine Freigabe, nach der nichts passiert ist, wäre schlimmer als gar
    // keine: sie verschwindet aus der Liste, und niemand sieht mehr hin.
    const { aufrufe } = welt({ resendGestoert: true });
    await bestaetigeListe("AUS-2026-001", "Am Sportplatz 14", "");

    const ergebnis = await gibFrei("AUS-2026-001", WER);

    expect(ergebnis.ok).toBe(false);
    expect(freigabeWechsel(aufrufe)).not.toContainEqual(
      expect.objectContaining({ freigabe_stand: "freigegeben" }),
    );
    expect(stufenwechsel(aufrufe)).toHaveLength(0);
  });
});

describe("Ablehnen", () => {
  test("stoppt die Anfrage und sagt dem Trainer warum", async () => {
    const { aufrufe } = welt();
    await bestaetigeListe("AUS-2026-001", "Am Sportplatz 14", "");

    const ergebnis = await lehneAb("AUS-2026-001", WER, "Erst den Sponsor klären");

    expect(ergebnis.ok).toBe(true);
    expect(anHaendler(aufrufe)).toHaveLength(0);
    const anTrainer = briefe(aufrufe).find((b) => b.to[0] === "trainer@example.invalid");
    expect(anTrainer?.text).toContain("Erst den Sponsor klären");
  });

  test("der Grund steht am Vorgang", async () => {
    const { aufrufe } = welt();
    await bestaetigeListe("AUS-2026-001", "Am Sportplatz 14", "");
    await lehneAb("AUS-2026-001", WER, "Erst den Sponsor klären");

    expect(freigabeWechsel(aufrufe)).toContainEqual(
      expect.objectContaining({
        freigabe_stand: "abgelehnt",
        freigabe_grund: "Erst den Sponsor klären",
      }),
    );
  });

  test("nach dem Ablehnen lässt sich nicht mehr freigeben", async () => {
    const { aufrufe } = welt();
    await bestaetigeListe("AUS-2026-001", "Am Sportplatz 14", "");
    await lehneAb("AUS-2026-001", WER, "Erst den Sponsor klären");

    const ergebnis = await gibFrei("AUS-2026-001", WER);

    expect(ergebnis.ok).toBe(false);
    expect(anHaendler(aufrufe)).toHaveLength(0);
  });
});

describe("Ein Stand, den niemand kennt", () => {
  test("gilt als „keine“ und nicht als Freigabe", async () => {
    // Ein Tippfehler in der Spalte, eine künftige Migration mit einem fünften
    // Wert, eine Zeile aus der Zeit vor Migration 004: keiner dieser Fälle darf
    // als Freigabe durchgehen. Die Richtung des Zweifels ist hier entscheidend.
    const { aufrufe } = welt({
      vorgang: satz({
        nummer: "AUS-2026-001",
        stufe: 1,
        trainerEmail: "trainer@example.invalid",
        artikel: [artikel({ id: "a1", groessenart: "oberteil" })],
        personen: [person({ id: "p1", kontaktId: "111" })],
        freigabe: { stand: "quatsch" as never },
      }),
    });

    const ergebnis = await gibFrei("AUS-2026-001", WER);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.grund).toBe("nicht_offen");
    expect(anHaendler(aufrufe)).toHaveLength(0);
  });
});

describe("Eine erneute Bestätigung", () => {
  test("löscht die Unterschrift der vorigen Entscheidung", async () => {
    // Sonst trüge eine geänderte Liste noch die Freigabe der alten.
    const { aufrufe } = welt();
    await bestaetigeListe("AUS-2026-001", "Am Sportplatz 14", "");
    await lehneAb("AUS-2026-001", WER, "Erst den Sponsor klären");

    await bestaetigeListe("AUS-2026-001", "Am Sportplatz 14", "");

    // Alle vier Spalten wandern mit. Würde nur der Stand gesetzt, bliebe der
    // Grund der Ablehnung an einem Vorgang stehen, der gerade neu zur Freigabe
    // geht — und die Karte auf /sparte zeigte einen Einwand, den es nicht mehr
    // gibt.
    const letzte = freigabeWechsel(aufrufe).at(-1);
    expect(letzte).toEqual({
      freigabe_stand: "offen",
      freigabe_von: null,
      freigabe_am: null,
      freigabe_grund: null,
    });
  });
});

describe("Telegram und Todoist", () => {
  test("werden gerufen, wenn eine Freigabe offen ist", async () => {
    process.env.TELEGRAM_TOKEN = "zz-token";
    process.env.TELEGRAM_CHAT = "-100";
    process.env.TODOIST_TOKEN = "zz-todoist";
    const { aufrufe } = welt();

    await bestaetigeListe("AUS-2026-001", "Am Sportplatz 14", "");

    expect(aufrufe.some((a) => a.host === "telegram")).toBe(true);
    expect(aufrufe.some((a) => a.host === "todoist")).toBe(true);
  });

  test("fallen sie aus, wartet die Freigabe trotzdem", async () => {
    // Der Zustand lebt in der Datenbank. Wer ihn in Telegram vermutet,
    // verliert eine Freigabe, sobald jemand die Nachricht wegwischt.
    process.env.TELEGRAM_TOKEN = "zz-token";
    process.env.TELEGRAM_CHAT = "-100";
    process.env.TODOIST_TOKEN = "zz-todoist";
    const { aufrufe } = welt({ meldenGestoert: true });

    const ergebnis = await bestaetigeListe("AUS-2026-001", "Am Sportplatz 14", "");

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.wartetAufFreigabe).toBe(true);
    expect(freigabeWechsel(aufrufe)).toContainEqual(
      expect.objectContaining({ freigabe_stand: "offen" }),
    );
  });

  test("und der Ausfall steht im Verlauf", async () => {
    // Stille sähe aus wie „nichts zu tun“.
    process.env.TELEGRAM_TOKEN = "zz-token";
    process.env.TELEGRAM_CHAT = "-100";
    const { aufrufe } = welt({ meldenGestoert: true });

    await bestaetigeListe("AUS-2026-001", "Am Sportplatz 14", "");

    const arten = aufrufe
      .filter((a) => a.pfad === "ereignis" && a.methode === "POST")
      .map((a) => (a.koerper as { art: string }).art);
    expect(arten).toContain("freigabe_ruf_fehler");
  });

  test("ist keines von beiden eingerichtet, steht auch das im Verlauf", async () => {
    const { aufrufe } = welt();

    await bestaetigeListe("AUS-2026-001", "Am Sportplatz 14", "");

    const arten = aufrufe
      .filter((a) => a.pfad === "ereignis" && a.methode === "POST")
      .map((a) => (a.koerper as { art: string }).art);
    expect(arten).toContain("freigabe_ruf_aus");
  });
});

describe("Was in der Nachricht steht", () => {
  const ruf = {
    nummer: "AUS-2026-001",
    mannschaft: "D-Jugend 2014",
    gegenstand: "Trikotsatz",
    stueck: 42,
    haendler: 2,
    link: "https://zz.example.invalid/sparte",
  };

  test("Nummer, Mannschaft, Stückzahl und der Link", () => {
    const text = rufText(ruf);
    expect(text).toContain("AUS-2026-001");
    expect(text).toContain("D-Jugend 2014");
    expect(text).toContain("42 Stück");
    expect(text).toContain("2 Händler");
    expect(text).toContain("https://zz.example.invalid/sparte");
  });

  test("ohne Link fehlt die Zeile, statt leer dazustehen", () => {
    expect(rufText({ ...ruf, link: "" })).not.toContain("http");
  });

  test("ein Händler heißt „einen Händler“, nicht „1 Händler“", () => {
    expect(rufText({ ...ruf, haendler: 1 })).toContain("einen Händler");
  });
});
