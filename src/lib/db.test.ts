import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { aendere, db, dbAktiv, lese, leseEine, rufe, schreibe } from "./db";
import { BASIS, raeumeUmgebung, stelleDb, stelleUmgebung } from "../../test/db-fake";

/**
 * Die Zugriffsschicht auf die eigene Datenbank.
 *
 * Geprüft wird das, was wehtut, wenn es bricht: dass ein Ausfall nicht als
 * Tatsache durchgeht, dass nichts wiederholt wird, was etwas verändert, und
 * dass kein Schlüssel und keine Personendaten in einem Log landen.
 */

beforeEach(() => {
  stelleUmgebung();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  raeumeUmgebung();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Ohne Zugangsdaten", () => {
  test("ist die Datenbank nicht aktiv", () => {
    raeumeUmgebung();
    expect(dbAktiv()).toBe(false);
  });

  test("wird nicht einmal gefragt", async () => {
    raeumeUmgebung();
    const { netz } = stelleDb({});

    expect(await lese("vorgang", {})).toBeNull();
    expect(netz).not.toHaveBeenCalled();
  });

  test("reicht die Adresse allein nicht", () => {
    raeumeUmgebung();
    process.env.NEXT_PUBLIC_SUPABASE_URL = BASIS;
    expect(dbAktiv()).toBe(false);
  });

  test("tut es auch SUPABASE_URL", () => {
    raeumeUmgebung();
    process.env.SUPABASE_URL = BASIS;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
    expect(dbAktiv()).toBe(true);
  });
});

describe("Wie gefragt wird", () => {
  test("Adresse, Schlüssel und Prefer stehen dran", async () => {
    const { netz } = stelleDb({ "GET vorgang": { koerper: [] } });

    await lese("vorgang", { nummer: "eq.AUS-2026-001" });

    const [url, o] = netz.mock.calls[0];
    expect(String(url)).toBe(`${BASIS}/rest/v1/vorgang?select=*&nummer=eq.AUS-2026-001`);
    const kopf = new Headers((o as RequestInit).headers as HeadersInit);
    expect(kopf.get("apikey")).toBe("dienst-schluessel");
    expect(kopf.get("Authorization")).toBe("Bearer dienst-schluessel");
    // Ohne das kommt bei POST und PATCH nur ein leerer Rumpf zurück.
    expect(kopf.get("Prefer")).toContain("return=representation");
  });

  test("ein Schrägstrich zu viel in der Adresse stört nicht", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = `${BASIS}/`;
    const { netz } = stelleDb({ "GET vorgang": { koerper: [] } });

    await lese("vorgang", {});

    expect(String(netz.mock.calls[0][0])).toBe(`${BASIS}/rest/v1/vorgang?select=*`);
  });

  test("Sonderzeichen werden kodiert, nicht durchgereicht", async () => {
    const { netz } = stelleDb({ "GET vorgang": { koerper: [] } });

    await lese("vorgang", { mannschaften: "cs.{Ü40 Team 3}" });

    const url = String(netz.mock.calls[0][0]);
    expect(url).not.toContain("Ü40 Team 3");
    expect(url).toContain("%C3%9C40");
  });

  test("ohne Rumpf ist es ein GET, mit Rumpf ein POST", async () => {
    const { aufrufe } = stelleDb({
      "GET vorgang": { koerper: [] },
      "POST vorgang": { koerper: [] },
    });

    await lese("vorgang", {});
    await schreibe("vorgang", { nummer: "AUS-2026-002" });

    expect(aufrufe.map((a) => a.methode)).toEqual(["GET", "POST"]);
  });

  test("„schon da ist auch gut“ nennt auch die Spalten", async () => {
    const { aufrufe } = stelleDb({ "POST vorgang_person": { koerper: [] } });

    await schreibe(
      "vorgang_person",
      { vorgang_id: "v1" },
      { ignoriereDoppelte: "vorgang_id,hs_kontakt_id" },
    );

    expect(aufrufe[0].prefer).toContain("resolution=ignore-duplicates");
    // Gemessen an PostgREST 13: ohne `on_conflict` schaut es nur auf den
    // Primärschlüssel und antwortet auf die zweite Zeile mit 409. Das Prefer
    // allein sieht aus, als täte es etwas.
    expect(aufrufe[0].suche.on_conflict).toBe("vorgang_id,hs_kontakt_id");
  });
});

describe("Leer ist nicht dasselbe wie kaputt", () => {
  test("keine Zeile heißt: es gibt keine", async () => {
    stelleDb({ "GET vorgang": { koerper: [] } });
    expect(await lese("vorgang", {})).toEqual([]);
  });

  test("ein Fehler heißt: konnte nicht fragen", async () => {
    stelleDb({ "GET vorgang": { status: 400, koerper: { code: "42703" } } });
    expect(await lese("vorgang", {})).toBeNull();
  });

  test("leseEine unterscheidet beides", async () => {
    stelleDb({ "GET vorgang": { koerper: [] } });
    expect(await leseEine("vorgang", {})).toBeUndefined();

    vi.unstubAllGlobals();
    stelleDb({ "GET vorgang": { status: 500 } });
    expect(await leseEine("vorgang", {})).toBeNull();
  });

  test("eine leere Antwort ohne Rumpf ist kein Fehler", async () => {
    // Bei DELETE schickt PostgREST je nach Prefer gar nichts zurück.
    stelleDb({ "DELETE vorgang": { status: 204 } });
    expect(await db({ pfad: "vorgang", methode: "DELETE", suche: { id: "eq.v1" } })).toBeNull();
  });
});

describe("Wiederholen – aber nur, was nichts verändert", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  test("ein Rate-Limit beim Lesen wird wiederholt", async () => {
    const { netz } = stelleDb({
      "GET vorgang": [{ status: 429, wartet: 0 }, { koerper: [{ id: "v1" }] }],
    });

    const zeilen = await lese<{ id: string }>("vorgang", {});

    expect(netz).toHaveBeenCalledTimes(2);
    expect(zeilen).toEqual([{ id: "v1" }]);
  });

  test("nach drei Versuchen ist Schluss", async () => {
    const { netz } = stelleDb({ "GET vorgang": { status: 503, wartet: 0 } });

    expect(await lese("vorgang", {})).toBeNull();
    expect(netz).toHaveBeenCalledTimes(3);
  });

  test("ein Schreibversuch wird NIE wiederholt", async () => {
    // Zwei Versuche legten zwei Vorgänge an – schlimmer als der Fehler selbst.
    const { netz } = stelleDb({ "POST vorgang": { status: 503, wartet: 0 } });

    expect(await schreibe("vorgang", { nummer: "AUS-2026-002" })).toBeNull();
    expect(netz).toHaveBeenCalledTimes(1);
  });

  test("auch die Nummernfunktion nicht", async () => {
    // Sie sieht aus wie ein Lesen, erhöht aber den Zähler.
    const { netz } = stelleDb({ "POST rpc/naechste_vorgangsnummer": { status: 500, wartet: 0 } });

    expect(await rufe("naechste_vorgangsnummer")).toBeNull();
    expect(netz).toHaveBeenCalledTimes(1);
  });

  test("ein PATCH nicht", async () => {
    const { netz } = stelleDb({ "PATCH vorgang": { status: 500, wartet: 0 } });

    expect(await aendere("vorgang", { id: "eq.v1" }, { stufe: 2 })).toBeNull();
    expect(netz).toHaveBeenCalledTimes(1);
  });

  test("ein fachlicher Fehler wird nicht wiederholt", async () => {
    // 400 heißt: die Anfrage ist falsch. Sie wird beim dritten Mal nicht richtig.
    const { netz } = stelleDb({ "GET vorgang": { status: 400, koerper: { code: "42703" } } });

    expect(await lese("vorgang", {})).toBeNull();
    expect(netz).toHaveBeenCalledTimes(1);
  });
});

describe("Was im Log landet", () => {
  test("weder Schlüssel noch Personendaten", async () => {
    const meldungen: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...teile) => {
      meldungen.push(teile.map(String).join(" "));
    });

    stelleDb({
      "GET vorgang_person": {
        status: 409,
        koerper: {
          code: "23505",
          message: "duplicate key",
          // PostgREST nennt hier die verletzte Zeile mitsamt Werten.
          details: "Key (vorgang_id, hs_kontakt_id)=(v1, 36737235175) already exists.",
        },
      },
    });

    await lese("vorgang_person", {});

    const alles = meldungen.join("\n");
    expect(alles).toContain("23505");
    expect(alles).not.toContain("dienst-schluessel");
    expect(alles).not.toContain("36737235175");
  });

  test("auch dann nicht, wenn die Datenbank gar nicht antwortet", async () => {
    const meldungen: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...teile) => {
      meldungen.push(teile.map(String).join(" "));
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("getaddrinfo ENOTFOUND");
      }),
    );

    expect(await schreibe("vorgang", { nummer: "AUS-2026-002" })).toBeNull();
    expect(meldungen.join("\n")).not.toContain("dienst-schluessel");
  });
});

describe("Nexts Dynamik-Signal", () => {
  test("wird durchgereicht statt geschluckt", async () => {
    // Sonst würde die Route fälschlich statisch – der Fehler gehört nicht uns.
    const signal = Object.assign(new Error("dynamic"), { digest: "DYNAMIC_SERVER_USAGE" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw signal;
      }),
    );

    await expect(lese("vorgang", {})).rejects.toBe(signal);
  });
});
