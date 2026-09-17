import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  speichereGroessen,
  speichereTrainerAngaben,
  type GroessenAbfrage,
  type TrainerAbfrage,
} from "./vorgaenge";

/**
 * Die beiden Stellen, an denen kitflow an einen Kontakt schreibt — und die
 * einzigen, die ein Fremder erreichen kann, wenn er einen Link in die Hände
 * bekommt.
 *
 * Ein Formular lässt sich nachbauen. Deshalb entscheidet nicht das Formular,
 * was geschrieben wird, sondern die Abfrage, die vorher rausging: nur ihre
 * Felder, nur ihre Werte. Genau das halten diese Tests fest.
 */

const HEUTE = "2026-09-17";

function abfrage(mehr: Partial<GroessenAbfrage> = {}): GroessenAbfrage {
  return {
    vorgang: "AUS-2026-001",
    person: "111",
    anrede: "ZZ",
    mannschaft: "Ü40 Team 3",
    gegenstand: "Weitere Ausstattung",
    jugend: false,
    fragen: [
      {
        art: "oberteil",
        label: "Oberteil",
        feld: "trainingsanzug_oberteil",
        werte: ["M", "L", "XL"],
        wert: "",
        bisher: "",
        veraltet: false,
      },
    ],
    initialenNoetig: false,
    nurGroessen: false,
    initialen: "",
    offen: true,
    ...mehr,
  };
}

function trainerAbfrage(mehr: Partial<TrainerAbfrage> = {}): TrainerAbfrage {
  return {
    ...abfrage(),
    name: "ZZ Person",
    nummer: "",
    ausgeschlossen: false,
    torwart: false,
    belegteNummern: [],
    ...mehr,
  };
}

let geschrieben: ReturnType<typeof vi.fn>;

/** Sammelt die PATCHes an Kontakte, damit sich nachlesen lässt, was ankam. */
function kontaktPatches() {
  return geschrieben.mock.calls
    .filter(([url, o]) => String(url).includes("/objects/contacts/") && (o as RequestInit)?.method === "PATCH")
    .map(([, o]) => JSON.parse(String((o as RequestInit).body)).properties as Record<string, string>);
}

beforeEach(() => {
  process.env.HUBSPOT_TOKEN = "zz-test";
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${HEUTE}T12:00:00Z`));
  geschrieben = vi.fn(async (url: string) => {
    if (String(url).includes("/objects/deals/search")) {
      return Response.json({ results: [{ id: "d1", properties: { vorgangsnummer: "AUS-2026-001" } }] });
    }
    return Response.json({ id: "1", properties: {} });
  });
  vi.stubGlobal("fetch", geschrieben);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.HUBSPOT_TOKEN;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("F2 · Größen speichern", () => {
  test("schreibt die Größe und das Bestätigungsdatum", async () => {
    const e = await speichereGroessen(abfrage(), { trainingsanzug_oberteil: "L" });

    expect(e).toEqual({ ok: true });
    expect(kontaktPatches()[0]).toEqual({
      trainingsanzug_oberteil: "L",
      groesse_zuletzt_bestaetigt_am: HEUTE,
    });
  });

  test("ein Feld, das nie gefragt wurde, wird nicht übernommen", async () => {
    // Der Angriff: das Formular nachbauen und ein weiteres Feld dazuschreiben.
    await speichereGroessen(abfrage(), {
      trainingsanzug_oberteil: "L",
      schuhgroesse: "47",
      trikotnummer: "1",
    });

    const patch = kontaktPatches()[0];
    expect(patch).not.toHaveProperty("schuhgroesse");
    expect(patch).not.toHaveProperty("trikotnummer");
  });

  test("ein Wert, der nicht zur Auswahl gehört, schreibt gar nichts", async () => {
    const e = await speichereGroessen(abfrage(), { trainingsanzug_oberteil: "XXXXL" });

    expect(e.ok).toBe(false);
    // Nicht „das eine Feld weglassen", sondern nichts schreiben.
    expect(kontaktPatches()).toHaveLength(0);
  });

  test("ohne Eingabe wird nichts geschrieben", async () => {
    expect((await speichereGroessen(abfrage(), {})).ok).toBe(false);
    expect(kontaktPatches()).toHaveLength(0);
  });
});

describe("F2 · Initialen", () => {
  test("werden nur gefragt, wenn der Vorgang sie aufdruckt", async () => {
    await speichereGroessen(abfrage(), { trainingsanzug_oberteil: "L", initialen: "ZZ" });
    // Ohne Häkchen stand das Feld gar nicht im Formular.
    expect(kontaktPatches()[0]).not.toHaveProperty("initialen");
  });

  test("mit Häkchen werden sie übernommen", async () => {
    await speichereGroessen(abfrage({ initialenNoetig: true }), {
      trainingsanzug_oberteil: "L",
      initialen: " z z ",
    });
    expect(kontaktPatches()[0].initialen).toBe("z z");
  });

  test.for(["", "Z.Z", "ZZZZ"])("ungültige Initialen (%s) schreiben gar nichts", async (roh) => {
    const e = await speichereGroessen(abfrage({ initialenNoetig: true }), {
      trainingsanzug_oberteil: "L",
      initialen: roh,
    });

    expect(e.ok).toBe(false);
    // Die Meldung sagt, was falsch ist – nicht nur, dass etwas ist.
    expect("fehler" in e && e.fehler).toBeTruthy();
    expect(kontaktPatches()).toHaveLength(0);
  });
});

describe("F2 als Trainer", () => {
  test("eine Nummer ohne Größe setzt kein Bestätigungsdatum", async () => {
    // Sonst sähe eine alte Größe durch eine fremde Bestätigung frisch aus.
    const e = await speichereTrainerAngaben(trainerAbfrage(), {
      groessen: {},
      nummer: "7",
      initialen: "",
      ausgeschlossen: false,
      torwart: false,
    });

    expect(e.ok).toBe(true);
    const patch = kontaktPatches()[0];
    expect(patch.trikotnummer).toBe("7");
    expect(patch).not.toHaveProperty("groesse_zuletzt_bestaetigt_am");
  });

  test("mit Größe wird das Datum gesetzt", async () => {
    await speichereTrainerAngaben(trainerAbfrage(), {
      groessen: { trainingsanzug_oberteil: "L" },
      nummer: "",
      initialen: "",
      ausgeschlossen: false,
      torwart: false,
    });
    expect(kontaktPatches()[0].groesse_zuletzt_bestaetigt_am).toBe(HEUTE);
  });

  test.for(["0", "100", "-1", "7,5", "abc"])("die Nummer %s wird abgewiesen", async (nummer) => {
    const e = await speichereTrainerAngaben(trainerAbfrage(), {
      groessen: {},
      nummer,
      initialen: "",
      ausgeschlossen: false,
      torwart: false,
    });

    expect(e.ok).toBe(false);
    expect(kontaktPatches()).toHaveLength(0);
  });

  test("eine schon vergebene Nummer wird abgewiesen und nennt den Träger", async () => {
    const e = await speichereTrainerAngaben(
      trainerAbfrage({ belegteNummern: [{ nummer: "7", name: "ZZ Andere" }] }),
      { groessen: {}, nummer: "7", initialen: "", ausgeschlossen: false, torwart: false },
    );

    expect(e.ok).toBe(false);
    expect(e.fehler).toContain("ZZ Andere");
    expect(kontaktPatches()).toHaveLength(0);
  });

  test("eine leere Nummer löscht sie", async () => {
    await speichereTrainerAngaben(trainerAbfrage({ nummer: "7" }), {
      groessen: {},
      nummer: "",
      initialen: "",
      ausgeschlossen: false,
      torwart: false,
    });
    expect(kontaktPatches()[0].trikotnummer).toBe("");
  });

  test("Ausschluss und Torwart landen am Vorgang, nicht am Kontakt", async () => {
    await speichereTrainerAngaben(trainerAbfrage(), {
      groessen: {},
      nummer: "",
      initialen: "",
      ausgeschlossen: true,
      torwart: true,
    });

    // Beides gilt nur für diesen Vorgang, nicht für die nächste Runde.
    expect(kontaktPatches()[0]).not.toHaveProperty("ausgeschlossene_spieler");

    const dealPatch = geschrieben.mock.calls.find(
      ([url, o]) => String(url).includes("/objects/deals/d1") && (o as RequestInit)?.method === "PATCH",
    );
    const eigenschaften = JSON.parse(String((dealPatch![1] as RequestInit).body)).properties;
    expect(eigenschaften.ausgeschlossene_spieler).toContain("111");
    expect(eigenschaften.torwarte).toContain("111");
  });
});
