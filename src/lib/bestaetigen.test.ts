import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { listeBestaetigen } from "@/app/b/[vorgang]/aktion";
import { signiere } from "./links";
import { artikel, kontakt, person, satz } from "../../test/satz";
import { raeumeUmgebung, stelleUmgebung, stelleWelt } from "../../test/welt";

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

const HEUTE = "2026-09-18";

function formular(werte: Record<string, string> = {}) {
  const f = new FormData();
  f.set("vollstaendig", "ja");
  for (const [k, v] of Object.entries(werte)) f.set(k, v);
  return f;
}

function token(vorgang = "AUS-2026-001") {
  return signiere("bestaetigen", vorgang)!;
}

/** Ein Vorgang, an dem nichts fehlt. */
function fertigeWelt(mehr: Parameters<typeof stelleWelt>[0] = {}) {
  return stelleWelt({
    vorgang: satz({ artikel: [artikel()], personen: [person()] }),
    kontakte: [
      kontakt("111", { trainingsanzug_oberteil: "L", groesse_zuletzt_bestaetigt_am: HEUTE }),
    ],
    ...mehr,
  });
}

function vorgangPatches(aufrufe: { host: string; methode: string; pfad: string; koerper: unknown }[]) {
  return aufrufe
    .filter((a) => a.host === "db" && a.pfad === "vorgang" && a.methode === "PATCH")
    .map((a) => a.koerper as Record<string, unknown>);
}

beforeEach(() => {
  stelleUmgebung();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${HEUTE}T12:00:00Z`));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  raeumeUmgebung();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Wer bestätigen darf", () => {
  test("mit gültigem Link und vollständiger Liste", async () => {
    const { aufrufe } = fertigeWelt();

    const e = await listeBestaetigen("AUS-2026-001", token(), { stand: "leer" }, formular());

    expect(e.stand).toBe("bestaetigt");
    expect(vorgangPatches(aufrufe)[0].liste_bestaetigt_am).toBe(HEUTE);
  });

  test("die Stufe bleibt, wo sie ist", async () => {
    // „Anfrage raus“ hieße, dass eine rausgegangen ist. Solange kitflow keine
    // verschickt, wäre dieser Stand eine Behauptung.
    const { aufrufe } = fertigeWelt();
    await listeBestaetigen("AUS-2026-001", token(), { stand: "leer" }, formular());

    expect(vorgangPatches(aufrufe)[0]).not.toHaveProperty("stufe");
  });
});

describe("Wer nicht bestätigen darf", () => {
  test("ohne gültiges Token passiert nichts", async () => {
    const { netz } = fertigeWelt();

    const e = await listeBestaetigen("AUS-2026-001", "erfunden", { stand: "leer" }, formular());

    expect(e.stand).toBe("fehler");
    // Die Action ist eine eigene Adresse: hier darf nicht einmal gelesen werden.
    expect(netz).not.toHaveBeenCalled();
  });

  test("ein Token für einen anderen Vorgang gilt nicht", async () => {
    fertigeWelt();
    const e = await listeBestaetigen(
      "AUS-2026-001",
      token("AUS-2026-002"),
      { stand: "leer" },
      formular(),
    );
    expect(e.stand).toBe("fehler");
  });

  test("ohne Häkchen nicht", async () => {
    const { aufrufe } = fertigeWelt();
    const ohne = new FormData();

    const e = await listeBestaetigen("AUS-2026-001", token(), { stand: "leer" }, ohne);

    expect(e.stand).toBe("fehler");
    expect(vorgangPatches(aufrufe)).toHaveLength(0);
  });

  test("eine gefallene Prüfung schlägt das Häkchen", async () => {
    // Genau darum geht es: wer bestätigt, was nicht stimmt, schickt sonst eine
    // falsche Anfrage an beide Händler.
    const { aufrufe } = fertigeWelt({ kontakte: [kontakt("111")] });

    const e = await listeBestaetigen("AUS-2026-001", token(), { stand: "leer" }, formular());

    expect(e.stand).toBe("fehler");
    expect(e.stand === "fehler" && e.text).toContain("Prüfung 2");
    expect(vorgangPatches(aufrufe)).toHaveLength(0);
  });

  test.for([0, 2, 9])("auf Stufe %i nicht mehr", async (stufe) => {
    const { aufrufe } = fertigeWelt({
      vorgang: satz({
        stufe: stufe as 0 | 2 | 9,
        artikel: [artikel()],
        personen: [person()],
      }),
    });

    const e = await listeBestaetigen("AUS-2026-001", token(), { stand: "leer" }, formular());

    expect(e.stand).toBe("fehler");
    expect(vorgangPatches(aufrufe)).toHaveLength(0);
  });
});

describe("Was mitgeschrieben wird", () => {
  test("eine geänderte Lieferadresse und ein Hinweis", async () => {
    const { aufrufe } = fertigeWelt();

    await listeBestaetigen(
      "AUS-2026-001",
      token(),
      { stand: "leer" },
      formular({ lieferadresse: "ZZ Neue Straße 2", hinweis: "bitte gesammelt liefern" }),
    );

    const patch = vorgangPatches(aufrufe)[0];
    expect(patch.lieferadresse).toBe("ZZ Neue Straße 2");
    expect(patch.hinweis_haendler).toBe("bitte gesammelt liefern");
  });

  test("leer gelassen heißt: bleibt wie es ist", async () => {
    const { aufrufe } = fertigeWelt();

    await listeBestaetigen("AUS-2026-001", token(), { stand: "leer" }, formular({ lieferadresse: "  " }));

    // Sonst löschte ein leeres Feld die Adresse aus F1.
    const patch = vorgangPatches(aufrufe)[0];
    expect(patch).not.toHaveProperty("lieferadresse");
    expect(patch).not.toHaveProperty("hinweis_haendler");
  });

  test("und es steht im Verlauf", async () => {
    const { aufrufe } = fertigeWelt();

    await listeBestaetigen("AUS-2026-001", token(), { stand: "leer" }, formular());

    const vermerk = aufrufe.find((a) => a.pfad === "ereignis" && a.methode === "POST");
    expect((vermerk?.koerper as Record<string, unknown>).art).toBe("liste_bestaetigt");
  });
});
