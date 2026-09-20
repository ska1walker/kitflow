import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GRENZE_BYTES, hole, lade, typVonBytes } from "./ablage";
import { bestaetigeListe, gibFrei, ladeGroessenAbfrage } from "./vorgaenge";
import { artikel, kontakt, person, satz } from "../../test/satz";
import { raeumeUmgebung, stelleUmgebung, stelleWelt } from "../../test/welt";

/**
 * Die Ablage: Sponsorlogo und Produktfotos.
 *
 * Geprüft ist die Schicht gegen ein Papp-Netz. **Supabase Storage selbst ist
 * nie aufgerufen worden** — `*.supabase.co` ist aus der Bauumgebung gesperrt
 * (403 vom Proxy), wie Resend, Telegram und Todoist. Ob der Eimer `kitflow`
 * existiert und der Dienst-Schlüssel darauf schreiben darf, entscheidet sich
 * beim ersten Lauf auf Vercel.
 *
 * Was hier wirklich geprüft wird, ist das, was auch bei richtiger Verbindung
 * schiefgehen kann: dass eine umbenannte Datei nicht durchrutscht, dass ein
 * Ausfall die Anfrage nicht aufhält, und dass niemand an ein Bild kommt, das
 * ihn nichts angeht.
 */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const HAENDLER = "11teamsports|Herr Bormann|bormann@example.invalid";

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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("was hineindarf", () => {
  test("die drei erlaubten Formate werden an ihren Bytes erkannt", () => {
    expect(typVonBytes(PNG)).toBe("image/png");
    expect(typVonBytes(JPEG)).toBe("image/jpeg");
    expect(typVonBytes(WEBP)).toBe("image/webp");
  });

  test("ein PDF mit Bildnamen kommt nicht durch", async () => {
    stelleWelt({});
    // %PDF- — ein Händler schickt sein Logo gern als PDF, und ein Browser
    // meldet als Typ, was die Endung nahelegt. Gemessen wird der Inhalt.
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    expect(typVonBytes(pdf)).toBeNull();
    expect(await lade("sponsor", "v1", pdf)).toEqual({ ok: false, grund: "falscher_typ" });
  });

  test("RIFF allein ist kein WebP", () => {
    // Eine WAV-Datei faengt genauso an. Erst „WEBP" an Stelle 8 macht sie aus.
    const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
    expect(typVonBytes(wav)).toBeNull();
  });

  test("zu gross wird abgewiesen, bevor irgendetwas hochgeht", async () => {
    const w = stelleWelt({});
    const zuGross = new Uint8Array(GRENZE_BYTES + 1);
    zuGross.set(PNG.slice(0, 8));

    expect(await lade("artikel", "a1", zuGross)).toEqual({ ok: false, grund: "zu_gross" });
    // Entscheidend: es ging gar nichts raus.
    expect(w.aufrufe.filter((a) => a.host === "ablage")).toHaveLength(0);
  });

  test("ohne eingerichtete Ablage wird nichts behauptet", async () => {
    stelleWelt({});
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_URL;
    expect(await lade("sponsor", "v1", PNG)).toEqual({ ok: false, grund: "nicht_eingerichtet" });
  });

  test("die Endung folgt dem Inhalt, nicht dem Wunsch", async () => {
    stelleWelt({});
    expect(await lade("sponsor", "v1", JPEG)).toEqual({ ok: true, pfad: "sponsor/v1.jpg" });
  });

  test("ein zweiter Aufruf ersetzt statt zu scheitern", async () => {
    const w = stelleWelt({});
    await lade("artikel", "a1", PNG);
    expect(await lade("artikel", "a1", PNG)).toEqual({ ok: true, pfad: "artikel/a1.png" });
    expect(await hole("artikel/a1.png")).not.toBeNull();
    expect(w.aufrufe.filter((a) => a.host === "ablage" && a.methode === "POST")).toHaveLength(2);
  });

  test("eine Stoerung ist kein falscher Typ", async () => {
    stelleWelt({ ablageGestoert: true });
    expect(await lade("sponsor", "v1", PNG)).toEqual({ ok: false, grund: "gestoert" });
  });
});

/* ------------------------------------------------------------------ *
 * Das Sponsorlogo an der Händleranfrage
 * ------------------------------------------------------------------ */

function weltMitLogo(mehr: { logo?: string; ablage?: Record<string, { bytes: Uint8Array; typ: string }> } = {}) {
  return stelleWelt({
    vorgang: satz({
      nummer: "AUS-2026-001",
      stufe: 1,
      sponsorLogo: mehr.logo,
      trainerEmail: "trainer@example.invalid",
      lieferadresse: "Am Sportplatz 14",
      artikel: [artikel({ id: "a1", bezeichnung: "Trainingsjacke", groessenart: "oberteil" })],
      personen: [person({ id: "p1", kontaktId: "111" })],
    }),
    kontakte: [kontakt("111", { firstname: "Anna", lastname: "Klein", trainingsanzug_oberteil: "M" })],
    ablage: mehr.ablage,
  });
}

type Brief = {
  subject: string;
  text: string;
  attachments?: { filename: string; content: string; content_id?: string }[];
};

function anfrage(aufrufe: { host: string; koerper: unknown }[]): Brief | undefined {
  return aufrufe
    .filter((a) => a.host === "resend")
    .map((a) => a.koerper as Brief)
    .find((b) => b.subject.includes("Angebotsanfrage"));
}

async function bestaetigenUndFreigeben() {
  await bestaetigeListe("AUS-2026-001", "Am Sportplatz 14", "");
  return gibFrei("AUS-2026-001", { art: "mensch", email: "kai@example.invalid" });
}

describe("Sponsorlogo an M4", () => {
  test("haengt als Datei dran, mit sprechendem Namen und unversehrt", async () => {
    const w = weltMitLogo({
      logo: "sponsor/v1.png",
      ablage: { "sponsor/v1.png": { bytes: PNG, typ: "image/png" } },
    });

    await bestaetigenUndFreigeben();

    const logo = anfrage(w.aufrufe)?.attachments?.find((a) => a.filename.includes("Sponsorlogo"));
    expect(logo?.filename).toBe("AUS-2026-001_Sponsorlogo.png");
    expect(Array.from(new Uint8Array(Buffer.from(logo!.content, "base64")))).toEqual(Array.from(PNG));
    // Kein Inline-Bild: der Haendler braucht die Datei, nicht ein Bildchen im Text.
    expect(logo?.content_id).toBeUndefined();
  });

  test("ohne Logo wird auch nichts versprochen", async () => {
    const w = weltMitLogo();

    await bestaetigenUndFreigeben();

    const brief = anfrage(w.aufrufe);
    expect(brief?.attachments?.some((a) => a.filename.includes("Sponsorlogo"))).toBe(false);
    expect(brief?.text).not.toContain("Druckdatei");
  });

  test("ein Logo, das nicht mehr da ist, haelt die Anfrage nicht auf", async () => {
    // Der Verweis steht in der Datenbank, die Datei fehlt in der Ablage.
    const w = weltMitLogo({ logo: "sponsor/weg.png", ablage: {} });

    const ergebnis = await bestaetigenUndFreigeben();

    // Die Anfrage geht raus — nur eben ohne Logo.
    expect(ergebnis.ok).toBe(true);
    const brief = anfrage(w.aufrufe);
    expect(brief).toBeDefined();
    expect(brief?.attachments?.some((a) => a.filename.includes("Sponsorlogo"))).toBe(false);
    expect(brief?.text).not.toContain("Druckdatei");
  });
});

/* ------------------------------------------------------------------ *
 * Produktfotos in der Größenabfrage
 * ------------------------------------------------------------------ */

describe("Produktfotos in F2", () => {
  test("nur Artikel mit Foto werden angeboten", async () => {
    stelleWelt({
      vorgang: satz({
        nummer: "AUS-2026-001",
        stufe: 1,
        artikel: [
          artikel({ id: "a1", hersteller: "adidas", bezeichnung: "Trainingsjacke", groessenart: "oberteil", bild: "artikel/a1.png" }),
          artikel({ id: "a2", bezeichnung: "Trainingshose", groessenart: "trainingshose" }),
        ],
        personen: [person({ id: "p1", kontaktId: "111" })],
      }),
      kontakte: [kontakt("111", { firstname: "Anna", lastname: "Klein" })],
    });

    const abfrage = await ladeGroessenAbfrage("AUS-2026-001", "111");
    expect(abfrage.stand).toBe("da");
    if (abfrage.stand !== "da") return;

    expect(abfrage.daten.artikelBilder).toEqual([{ id: "a1", bezeichnung: "adidas Trainingsjacke" }]);
  });

  test("die Bytes selbst gehen nie an den Browser", async () => {
    stelleWelt({
      vorgang: satz({
        nummer: "AUS-2026-001",
        stufe: 1,
        artikel: [artikel({ id: "a1", bezeichnung: "Jacke", groessenart: "oberteil", bild: "artikel/a1.png" })],
        personen: [person({ id: "p1", kontaktId: "111" })],
      }),
      kontakte: [kontakt("111", { firstname: "Anna", lastname: "Klein" })],
      ablage: { "artikel/a1.png": { bytes: PNG, typ: "image/png" } },
    });

    const abfrage = await ladeGroessenAbfrage("AUS-2026-001", "111");
    if (abfrage.stand !== "da") throw new Error("Abfrage fehlt");

    // Im Antwortobjekt steht die ID, nicht der Pfad und erst recht keine Bytes:
    // der Pfad waere ein Leseschluessel, den `/api/bild` gerade nicht annimmt.
    const alsText = JSON.stringify(abfrage.daten);
    expect(alsText).not.toContain("artikel/a1.png");
    expect(alsText).toContain("a1");
  });
});
