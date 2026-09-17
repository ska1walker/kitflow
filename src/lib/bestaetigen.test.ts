import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { listeBestaetigen } from "@/app/b/[vorgang]/aktion";
import { signiere } from "./links";
import { artikel, deal, kontakt, stelleHubSpot, stufenId } from "../../test/hubspot-fake";

/**
 * Das Ende der Kette: der Trainer bestätigt die Liste.
 *
 * Danach ginge die Anfrage an beide Händler — heute noch nicht, weil M4 nicht
 * gebaut ist. Trotzdem ist das die Stelle, an der eine falsche Liste teuer
 * wird: die Prüfungen entscheiden, nicht das Häkchen.
 *
 * Geprüft wird über die Server Action, also so, wie sie wirklich aufgerufen
 * wird — Actions sind eigene Adressen und lassen sich ohne die Seite erreichen.
 */

const HEUTE = "2026-09-17";

function formular(werte: Record<string, string> = {}) {
  const f = new FormData();
  f.set("vollstaendig", "ja");
  for (const [k, v] of Object.entries(werte)) f.set(k, v);
  return f;
}

function token(vorgang = "AUS-2026-001") {
  return signiere("bestaetigen", vorgang)!;
}

const jacke = artikel("p-jacke", "oberteil");

/** Ein Vorgang, an dem nichts fehlt. */
function fertigeWelt(dealMehr: Record<string, string> = {}) {
  return {
    deal: deal(dealMehr),
    positionen: [jacke.position],
    produkte: [jacke.produkt],
    kontakte: [
      kontakt("111", { trainingsanzug_oberteil: "L", groesse_zuletzt_bestaetigt_am: HEUTE }),
    ],
  };
}

function dealPatches(netz: ReturnType<typeof stelleHubSpot>) {
  return netz.mock.calls
    .filter(([url, o]) => String(url).includes("/objects/deals/d1") && (o as RequestInit)?.method === "PATCH")
    .map(([, o]) => JSON.parse(String((o as RequestInit).body)).properties as Record<string, string>);
}

beforeEach(() => {
  process.env.HUBSPOT_TOKEN = "zz-test";
  process.env.LINK_SECRET = "x".repeat(32);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${HEUTE}T12:00:00Z`));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.HUBSPOT_TOKEN;
  delete process.env.LINK_SECRET;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Wer bestätigen darf", () => {
  test("mit gültigem Link und vollständiger Liste", async () => {
    const netz = stelleHubSpot(fertigeWelt());

    const e = await listeBestaetigen("AUS-2026-001", token(), { stand: "leer" }, formular());

    expect(e.stand).toBe("bestaetigt");
    expect(dealPatches(netz)[0].liste_bestaetigt_am).toBe(HEUTE);
  });

  test("die Stufe bleibt, wo sie ist", async () => {
    const netz = stelleHubSpot(fertigeWelt());
    await listeBestaetigen("AUS-2026-001", token(), { stand: "leer" }, formular());

    // „Anfrage raus" hiesse, dass eine rausgegangen ist. Solange kitflow
    // keine verschickt, waere dieser Stand eine Behauptung.
    expect(dealPatches(netz)[0]).not.toHaveProperty("dealstage");
  });
});

describe("Wer nicht bestätigen darf", () => {
  test("ohne gültiges Token passiert nichts", async () => {
    const netz = stelleHubSpot(fertigeWelt());

    const e = await listeBestaetigen("AUS-2026-001", "erfunden", { stand: "leer" }, formular());

    expect(e.stand).toBe("fehler");
    // Die Action ist eine eigene Adresse: hier darf nicht einmal gelesen werden.
    expect(netz).not.toHaveBeenCalled();
  });

  test("ein Token für einen anderen Vorgang gilt nicht", async () => {
    stelleHubSpot(fertigeWelt());
    const e = await listeBestaetigen(
      "AUS-2026-001",
      token("AUS-2026-002"),
      { stand: "leer" },
      formular(),
    );
    expect(e.stand).toBe("fehler");
  });

  test("ohne Häkchen nicht", async () => {
    const netz = stelleHubSpot(fertigeWelt());
    const ohne = new FormData();

    const e = await listeBestaetigen("AUS-2026-001", token(), { stand: "leer" }, ohne);

    expect(e.stand).toBe("fehler");
    expect(dealPatches(netz)).toHaveLength(0);
  });

  test("eine gefallene Prüfung schlägt das Häkchen", async () => {
    // Genau darum geht es: wer bestätigt, was nicht stimmt, schickt sonst eine
    // falsche Anfrage an beide Händler.
    const netz = stelleHubSpot({ ...fertigeWelt(), kontakte: [kontakt("111")] });

    const e = await listeBestaetigen("AUS-2026-001", token(), { stand: "leer" }, formular());

    expect(e.stand).toBe("fehler");
    expect(e.stand === "fehler" && e.text).toContain("Prüfung 2");
    expect(dealPatches(netz)).toHaveLength(0);
  });

  test.for([0, 2, 9])("auf Stufe %i nicht mehr", async (stufe) => {
    const netz = stelleHubSpot(fertigeWelt({ dealstage: stufenId(stufe) }));

    const e = await listeBestaetigen("AUS-2026-001", token(), { stand: "leer" }, formular());

    expect(e.stand).toBe("fehler");
    expect(dealPatches(netz)).toHaveLength(0);
  });
});

describe("Was mitgeschrieben wird", () => {
  test("eine geänderte Lieferadresse und ein Hinweis", async () => {
    const netz = stelleHubSpot(fertigeWelt());

    await listeBestaetigen(
      "AUS-2026-001",
      token(),
      { stand: "leer" },
      formular({ lieferadresse: "ZZ Neue Straße 2", hinweis: "bitte gesammelt liefern" }),
    );

    const patch = dealPatches(netz)[0];
    expect(patch.lieferadresse).toBe("ZZ Neue Straße 2");
    expect(patch.hinweis_haendler).toBe("bitte gesammelt liefern");
  });

  test("leer gelassen heißt: bleibt wie es ist", async () => {
    const netz = stelleHubSpot(fertigeWelt());

    await listeBestaetigen("AUS-2026-001", token(), { stand: "leer" }, formular({ lieferadresse: "  " }));

    // Sonst löschte ein leeres Feld die Adresse aus F1.
    const patch = dealPatches(netz)[0];
    expect(patch).not.toHaveProperty("lieferadresse");
    expect(patch).not.toHaveProperty("hinweis_haendler");
  });
});
