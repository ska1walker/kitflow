import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { bedarfMelden } from "@/app/neu/aktion";
import { darfMelden } from "./bedarf";
import { kontakt, satz } from "../../test/satz";
import { raeumeUmgebung, stelleUmgebung, stelleWelt } from "../../test/welt";

/**
 * Der Riegel an `/neu` — der einzigen Seite ohne Token.
 *
 * Bis hierher konnte jeder, der die Adresse kennt, „2014“ wählen, abschicken
 * und bekam die Vor- und Nachnamen einer ganzen Jugendmannschaft samt
 * gültiger Größen-Links auf die Danke-Seite. Zwei Dinge halten das jetzt auf:
 * die Adresse muss als Kontakt beim Verein stehen, und die Antwort trägt
 * keine Namen mehr.
 *
 * Geprüft wird über die Server Action, also so, wie sie wirklich aufgerufen
 * wird — eine Action ist eine eigene Adresse und lässt sich ohne die Seite
 * erreichen.
 */

const TRAINER = "kai@example.invalid";

function formular(werte: Record<string, string> = {}) {
  const f = new FormData();
  f.set("modus", "vollstaendig");
  f.set("vorname", "Kai");
  f.set("nachname", "Böhm");
  f.set("email", TRAINER);
  f.set("telefon", "0170 1234567");
  f.set("ausstattungsart", "Weitere Ausstattung");
  f.set("groessen_frist", "2026-09-30");
  f.set("lieferadresse", "Am Sportplatz 14");
  f.set("zahlungsregel", "ja");
  f.set("artikel-0-hersteller", "adidas");
  f.set("artikel-0-bezeichnung", "Trainingsjacke");
  f.set("artikel-0-herstellernummer", "10371232");
  f.set("artikel-0-groessenart", "oberteil");
  f.set("artikel-0-stueck", "1");
  f.set("artikel-0-fuer", "alle");
  f.set("artikel-0-beflockung", "Standard");
  for (const [k, v] of Object.entries(werte)) f.set(k, v);
  f.append("teams", "2007");
  return f;
}

/** Der Trainer steht als Kontakt, dazu zwei Spieler der Mannschaft. */
function welt(mehr: Parameters<typeof stelleWelt>[0] = {}) {
  return stelleWelt({
    vorgang: satz({ nummer: "AUS-2026-001", stufe: 1 }),
    kontakte: [
      kontakt("900", {
        firstname: "Kai",
        lastname: "Böhm",
        email: TRAINER,
        team: "2007",
        numemployees: "Spartenleiter;Spieler",
        sparte: "Fußball",
      }),
      kontakt("111", { firstname: "Anna", lastname: "Klein", email: "a@example.invalid", team: "2007" }),
      kontakt("222", { firstname: "Bernd", lastname: "Groß", email: "b@example.invalid", team: "2007" }),
    ],
    naechsteNummer: "AUS-2026-002",
    ...mehr,
  });
}

/** Wurde ein Entwurf geparkt? */
function geparkt(aufrufe: { host: string; methode: string; pfad: string }[]) {
  return aufrufe.some((a) => a.host === "db" && a.pfad === "vorgang_entwurf" && a.methode === "POST");
}

/** Wurde in der Datenbank ein Vorgang angelegt? */
function angelegt(aufrufe: { host: string; methode: string; pfad: string }[]) {
  return aufrufe.some((a) => a.host === "db" && a.pfad === "vorgang" && a.methode === "POST");
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Wer einen Vorgang anlegen darf", () => {
  test("eine Adresse, die der Verein nicht kennt, legt nichts an", async () => {
    const { aufrufe } = welt();

    const ergebnis = await bedarfMelden(
      { stand: "leer" },
      formular({ email: "fremder@example.invalid" }),
    );

    expect(ergebnis.stand).toBe("fehler");
    expect(ergebnis.stand === "fehler" && ergebnis.text).toContain("kennt der Verein nicht");
    expect(angelegt(aufrufe)).toBe(false);
    expect(aufrufe.some((a) => a.host === "resend")).toBe(false);
  });

  test("eine bekannte Adresse kommt durch – und legt trotzdem nichts an", async () => {
    // Seit dem Bestaetigungsklick entsteht beim Abschicken nur ein Entwurf.
    // Der Vorgang folgt erst auf den Klick in der Mail.
    const { aufrufe } = welt();

    const ergebnis = await bedarfMelden({ stand: "leer" }, formular());

    expect(ergebnis.stand).toBe("bestaetigen");
    expect(angelegt(aufrufe)).toBe(false);
    expect(geparkt(aufrufe)).toBe(true);
    expect(aufrufe.some((a) => a.host === "resend")).toBe(true);
  });

  test("ein Mitglied ohne Funktion darf nicht melden", async () => {
    // Bis hierher reichte „Kontakt beim Verein“. Das ist jedes Mitglied, auch
    // jedes Kind — und wer durchkommt, sieht die Namen einer ganzen Mannschaft.
    const { aufrufe } = stelleWelt({
      vorgang: satz({ nummer: "AUS-2026-001", stufe: 1 }),
      kontakte: [
        kontakt("901", { email: "spieler@example.invalid", numemployees: "Spieler", sparte: "Fußball" }),
      ],
      naechsteNummer: "AUS-2026-002",
    });

    const ergebnis = await bedarfMelden({ stand: "leer" }, formular({ email: "spieler@example.invalid" }));

    expect(ergebnis.stand === "fehler" && ergebnis.text).toContain("nicht als Trainerin");
    expect(angelegt(aufrufe)).toBe(false);
  });

  test("ein Trainer einer anderen Sparte auch nicht", async () => {
    // Die Spartenleiter und Trainer der anderen Sparten stehen im selben
    // Portal. Ausstattung der Fußballsparte geht sie nichts an.
    const { aufrufe } = stelleWelt({
      vorgang: satz({ nummer: "AUS-2026-001", stufe: 1 }),
      kontakte: [
        kontakt("902", { email: "handball@example.invalid", numemployees: "Trainer", sparte: "Handball" }),
      ],
      naechsteNummer: "AUS-2026-002",
    });

    const ergebnis = await bedarfMelden({ stand: "leer" }, formular({ email: "handball@example.invalid" }));

    expect(ergebnis.stand === "fehler" && ergebnis.text).toContain("nicht als Trainerin");
    expect(angelegt(aufrufe)).toBe(false);
  });

  test("die Spartenleitung Fußball darf – sonst sperrt sich Kai selbst aus", async () => {
    // Kai steht in HubSpot als „Spartenleiter;Spieler“, nicht als Trainer.
    const { aufrufe } = welt();

    expect((await bedarfMelden({ stand: "leer" }, formular())).stand).toBe("bestaetigen");
    expect(geparkt(aufrufe)).toBe(true);
  });

  test("schweigt HubSpot, ist das keine unbekannte Adresse", async () => {
    // Der Unterschied, der kitflow schon dreimal wehgetan hat: ein Ausfall
    // darf nie als Tatsache gelesen werden. Sonst sperrt ein Rate-Limit jeden
    // Trainer aus und sagt ihm auch noch, er sei kein Mitglied.
    const { aufrufe } = welt({ hubspotGestoert: true });

    const ergebnis = await bedarfMelden({ stand: "leer" }, formular());

    expect(ergebnis.stand).toBe("fehler");
    expect(ergebnis.stand === "fehler" && ergebnis.text).toContain("nicht an die Mitgliederdaten");
    expect(angelegt(aufrufe)).toBe(false);
  });
});

describe("Die Regel selbst", () => {
  // Klein und ohne Netz: was die Funktion im Verein hergibt, entscheidet, wer
  // an die Namen einer Mannschaft kommt.
  const faelle: [string, string, string, boolean][] = [
    ["Trainer", "Trainer", "Fußball", true],
    ["Trainer und Spieler", "Spieler;Trainer", "Fußball", true],
    ["Spartenleiter Fußball", "Spartenleiter;Spieler", "Fußball", true],
    ["nur Spieler", "Spieler", "Fußball", false],
    ["Betreuer", "Betreuer", "Fußball", false],
    ["Trainer im Handball", "Trainer", "Handball", false],
    ["Trainer in beiden Sparten", "Trainer", "Handball;Fußball", true],
    ["gar keine Funktion", "", "Fußball", false],
    ["Funktion ohne Sparte", "Trainer", "", false],
  ];

  for (const [name, funktion, sparte, erwartet] of faelle) {
    test(`${name}: ${erwartet ? "darf" : "darf nicht"}`, () => {
      expect(darfMelden({ funktion, sparte })).toBe(erwartet);
    });
  }
});
