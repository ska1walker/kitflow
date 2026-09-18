import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { satz } from "../../test/satz";
import { raeumeUmgebung, stelleUmgebung, stelleWelt } from "../../test/welt";

/**
 * Der Stufenwechsel auf `/sparte` — der einzige Schreibweg hinter der Anmeldung.
 *
 * Zwei Dinge sind hier zu prüfen, und das zweite ist das wichtigere:
 *
 * 1. Er tut, was er soll: Stufe setzen, Verlauf schreiben, Spiegel nachziehen.
 * 2. **Er prüft selbst.** Eine Server Action ist eine eigene Adresse. Wer sie
 *    kennt, kann sie ohne die Seite aufrufen, und der `proxy` sieht davon
 *    nichts — der schützt den Seitenaufruf und tut das ausdrücklich
 *    optimistisch. Ginge die Action ungeprüft durch, wäre der ganze Login eine
 *    Kulisse.
 *
 * `anmeldung.ts` ist dafür durch eine Attrappe ersetzt: es zieht `server-only`
 * und `next/headers` herein und spräche mit Supabase. Was hier zählt, ist allein
 * die Antwort auf „wer ist angemeldet“.
 */

const wer = vi.hoisted(() => ({ email: null as string | null }));

vi.mock("@/lib/anmeldung", () => ({
  spartenLeitung: async () => wer.email,
  authClient: async () => null,
}));

import { stufeSetzen } from "@/app/sparte/aktion";

function formular(werte: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(werte)) f.set(k, v);
  return f;
}

function welt() {
  return stelleWelt({ vorgang: satz({ nummer: "AUS-2026-001", stufe: 1 }) });
}

/** Wurde die Stufe wirklich geschrieben? */
function gesetzt(aufrufe: { host: string; methode: string; pfad: string; koerper: unknown }[]) {
  return aufrufe.find(
    (a) =>
      a.host === "db" &&
      a.pfad === "vorgang" &&
      a.methode === "PATCH" &&
      typeof a.koerper === "object" &&
      a.koerper !== null &&
      "stufe" in a.koerper,
  );
}

beforeEach(() => {
  stelleUmgebung();
  wer.email = "kai@example.invalid";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  raeumeUmgebung();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Ohne Anmeldung geht nichts", () => {
  test("wer nicht angemeldet ist, schreibt nicht", async () => {
    wer.email = null;
    const { aufrufe } = welt();

    const stand = await stufeSetzen({ stand: "leer" }, formular({ vorgang: "AUS-2026-001", stufe: "3" }));

    expect(stand.stand).toBe("fehler");
    expect(stand.stand === "fehler" && stand.text).toContain("angemeldet");
    // Nicht nur die Antwort zählt: es darf auch nichts geschrieben worden sein.
    expect(gesetzt(aufrufe)).toBeUndefined();
    expect(aufrufe.some((a) => a.pfad === "ereignis")).toBe(false);
  });

  test("die Prüfung steht vor allem anderen", async () => {
    // Auch mit unsinnigem Formular darf die Antwort nicht verraten, ob es den
    // Vorgang gibt — sonst wäre die Action eine Auskunft für Unangemeldete.
    wer.email = null;
    welt();

    const stand = await stufeSetzen({ stand: "leer" }, formular({ vorgang: "", stufe: "" }));

    expect(stand.stand === "fehler" && stand.text).toContain("angemeldet");
  });
});

describe("Angemeldet", () => {
  test("die Stufe wird gesetzt", async () => {
    const { aufrufe } = welt();

    const stand = await stufeSetzen({ stand: "leer" }, formular({ vorgang: "AUS-2026-001", stufe: "3" }));

    expect(stand.stand).toBe("fertig");
    expect(stand.stand === "fertig" && stand.titel).toBe("Angebote da");
    expect(gesetzt(aufrufe)?.koerper).toMatchObject({ stufe: 3 });
  });

  test("wer es war, steht im Verlauf – und nur intern", async () => {
    // Der Sinn des Logins ist, dass das nicht mehr anonym passiert.
    const { aufrufe } = welt();

    await stufeSetzen({ stand: "leer" }, formular({ vorgang: "AUS-2026-001", stufe: "3" }));

    const eintrag = aufrufe.find((a) => a.pfad === "ereignis" && a.methode === "POST");
    expect(eintrag?.koerper).toMatchObject({
      art: "stufe-gesetzt",
      sub: "kai@example.invalid",
      intern: true,
    });
  });

  test("ein Abbruch merkt sich, wo der Vorgang stand", async () => {
    // Ohne `abbruch_bei` liesse sich ein abgebrochener Vorgang nicht wieder
    // aufnehmen – dieselbe Regel wie beim Abbruch einer Voranfrage.
    const { aufrufe } = welt();

    await stufeSetzen({ stand: "leer" }, formular({ vorgang: "AUS-2026-001", stufe: "9" }));

    expect(gesetzt(aufrufe)?.koerper).toMatchObject({ stufe: 9, abbruch_bei: 1 });
  });

  test("ein normaler Wechsel setzt kein abbruch_bei", async () => {
    const { aufrufe } = welt();

    await stufeSetzen({ stand: "leer" }, formular({ vorgang: "AUS-2026-001", stufe: "3" }));

    expect(gesetzt(aufrufe)?.koerper).not.toHaveProperty("abbruch_bei");
  });
});

describe("Was das Formular nicht durchsetzen kann", () => {
  test("eine Stufe, die es nicht gibt, wird abgewiesen", async () => {
    const { aufrufe } = welt();

    const stand = await stufeSetzen({ stand: "leer" }, formular({ vorgang: "AUS-2026-001", stufe: "42" }));

    expect(stand.stand === "fehler" && stand.text).toContain("Stufe");
    expect(gesetzt(aufrufe)).toBeUndefined();
  });

  test.for(["", " ", "drei", "-1", "1.5"] as const)(
    "„%s“ ist keine Stufe",
    async (wert) => {
      const { aufrufe } = welt();
      const stand = await stufeSetzen({ stand: "leer" }, formular({ vorgang: "AUS-2026-001", stufe: wert }));
      expect(stand.stand).toBe("fehler");
      expect(gesetzt(aufrufe)).toBeUndefined();
    },
  );

  test("ein Vorgang, den es nicht gibt", async () => {
    const { aufrufe } = welt();

    const stand = await stufeSetzen({ stand: "leer" }, formular({ vorgang: "AUS-2026-999", stufe: "3" }));

    expect(stand.stand === "fehler" && stand.text).toContain("gibt es nicht");
    expect(gesetzt(aufrufe)).toBeUndefined();
  });

  test("dieselbe Stufe noch einmal ändert nichts", async () => {
    const { aufrufe } = welt();

    const stand = await stufeSetzen({ stand: "leer" }, formular({ vorgang: "AUS-2026-001", stufe: "1" }));

    expect(stand.stand === "fehler" && stand.text).toContain("steht schon");
    expect(gesetzt(aufrufe)).toBeUndefined();
  });
});

describe("Wenn die Datenbank schweigt", () => {
  test("das ist kein unbekannter Vorgang", async () => {
    // Derselbe Unterschied, der kitflow schon viermal wehgetan hat: ein Ausfall
    // darf nie als Tatsache gelesen werden.
    const { aufrufe } = stelleWelt({
      vorgang: satz({ nummer: "AUS-2026-001", stufe: 1 }),
      dbGestoert: true,
    });

    const stand = await stufeSetzen({ stand: "leer" }, formular({ vorgang: "AUS-2026-001", stufe: "3" }));

    expect(stand.stand === "fehler" && stand.text).toContain("nicht an die Daten");
    expect(stand.stand === "fehler" && stand.text).not.toContain("gibt es nicht");
    expect(gesetzt(aufrufe)).toBeUndefined();
  });
});
