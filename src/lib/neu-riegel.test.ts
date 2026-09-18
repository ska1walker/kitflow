import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { bedarfMelden } from "@/app/neu/aktion";
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
      kontakt("900", { firstname: "Kai", lastname: "Böhm", email: TRAINER, team: "2007" }),
      kontakt("111", { firstname: "Anna", lastname: "Klein", email: "a@example.invalid", team: "2007" }),
      kontakt("222", { firstname: "Bernd", lastname: "Groß", email: "b@example.invalid", team: "2007" }),
    ],
    naechsteNummer: "AUS-2026-002",
    ...mehr,
  });
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

  test("eine bekannte Adresse kommt durch", async () => {
    const { aufrufe } = welt();

    const ergebnis = await bedarfMelden({ stand: "leer" }, formular());

    expect(ergebnis.stand).toBe("fertig");
    expect(angelegt(aufrufe)).toBe(true);
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

describe("Was die Danke-Seite zu sehen bekommt", () => {
  test("keine Namen und keine persönlichen Links", async () => {
    welt();
    const ergebnis = await bedarfMelden({ stand: "leer" }, formular());

    expect(ergebnis.stand).toBe("fertig");
    if (ergebnis.stand !== "fertig") return;

    expect(ergebnis.ergebnis.personen).toEqual([]);
    const text = JSON.stringify(ergebnis.ergebnis);
    expect(text).not.toContain("Anna");
    expect(text).not.toContain("Klein");
    // Auch kein Größen-Link: er trägt die Personen-ID und öffnet fremde Größen.
    expect(text).not.toContain("/g/");
  });

  test("die Zahl steht trotzdem da", async () => {
    // Ohne sie stünde auf der Seite „es geht um 0 Spielerinnen und Spieler“.
    welt();
    const ergebnis = await bedarfMelden({ stand: "leer" }, formular());

    expect(ergebnis.stand === "fertig" && ergebnis.ergebnis.anzahl).toBe(3);
  });

  test("der Status-Link des Trainers bleibt – er ist seiner", async () => {
    welt();
    const ergebnis = await bedarfMelden({ stand: "leer" }, formular());

    expect(ergebnis.stand === "fertig" && ergebnis.ergebnis.trainerStatus).toContain("/v/");
  });
});
