import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { bestaetigeListe, gibFrei } from "./vorgaenge";
import { wappenVergessen } from "./wappen";
import { artikel, kontakt, person, satz } from "../../test/satz";
import { raeumeUmgebung, stelleUmgebung, stelleWelt } from "../../test/welt";

/**
 * Das Vereinswappen auf der Händleranfrage.
 *
 * Zwei Dinge stehen hier auf dem Spiel, und beide sind still, wenn sie
 * schiefgehen:
 *
 * 1. **Die Bytes.** `sendeMail` machte aus jedem Anhang
 *    `Buffer.from(inhalt, "utf8")`. Für die CSV richtig, für ein PNG tödlich —
 *    ohne Fehler, ohne Logzeile, der Händler bekäme einen kaputten Anhang. Der
 *    erste Test schickt deshalb ausdrücklich Bytes, die als UTF-8 ungültig
 *    sind, und vergleicht sie hinterher wieder Byte für Byte.
 * 2. **Der Verweis ins Leere.** Ist der Haken gesetzt, aber keine Datei
 *    hinterlegt, stünde ein `cid:wappen` im HTML ohne Anhang dahinter — in
 *    jedem Mailprogramm ein kaputtes Bildsymbol, in der einzigen Mail, die an
 *    echte Geschäftspartner geht.
 */

const DATEI = path.join(process.cwd(), "src", "assets", "wappen.png");

/**
 * PNG-Signatur plus zwei Bytes, die es als UTF-8 nicht gibt (0xFF 0xFE). Genau
 * die überleben den alten Weg nicht: `Buffer.from(…, "utf8")` ersetzt sie durch
 * das Ersatzzeichen, und der Vergleich unten schlägt fehl.
 */
const BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00, 0x01]);

const HAENDLER = "11teamsports|Herr Bormann|bormann@example.invalid";

/**
 * Eine echte Datei, die Kai später hierhin legt, darf ein Testlauf nicht
 * verlieren. Deshalb wird gemerkt, was vorher da war, und hinterher genau das
 * wiederhergestellt.
 */
let vorher: Buffer | null = null;

async function legeWappen(): Promise<void> {
  await mkdir(path.dirname(DATEI), { recursive: true });
  await writeFile(DATEI, BYTES);
  wappenVergessen();
}

async function ohneWappen(): Promise<void> {
  await rm(DATEI, { force: true });
  wappenVergessen();
}

function welt(wappenMit: boolean) {
  return stelleWelt({
    vorgang: satz({
      nummer: "AUS-2026-001",
      stufe: 1,
      wappenMit,
      trainerEmail: "trainer@example.invalid",
      lieferadresse: "Am Sportplatz 14",
      artikel: [artikel({ id: "a1", bezeichnung: "Trainingsjacke", groessenart: "oberteil" })],
      personen: [person({ id: "p1", kontaktId: "111" })],
    }),
    kontakte: [kontakt("111", { firstname: "Anna", lastname: "Klein", trainingsanzug_oberteil: "M" })],
  });
}

type Brief = {
  subject: string;
  html: string;
  attachments?: { filename: string; content: string; content_id?: string }[];
};

function briefe(aufrufe: { host: string; koerper: unknown }[]): Brief[] {
  return aufrufe.filter((a) => a.host === "resend").map((a) => a.koerper as Brief);
}

/** Die Anfrage an den Händler — nicht M5, die im selben Zug an den Trainer geht. */
function anfrage(alle: Brief[]): Brief | undefined {
  return alle.find((b) => b.subject.includes("Angebotsanfrage"));
}

async function bestaetigenUndFreigeben() {
  await bestaetigeListe("AUS-2026-001", "Am Sportplatz 14", "");
  return gibFrei("AUS-2026-001", { art: "mensch", email: "kai@example.invalid" });
}

beforeEach(async () => {
  stelleUmgebung();
  process.env.RESEND_API_KEY = "zz-test";
  process.env.KITFLOW_BASIS = "https://zz.example.invalid";
  process.env.HAENDLER = HAENDLER;
  vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    vorher = await readFile(DATEI);
  } catch {
    vorher = null;
  }
});

afterEach(async () => {
  if (vorher) {
    await mkdir(path.dirname(DATEI), { recursive: true });
    await writeFile(DATEI, vorher);
  } else {
    await rm(DATEI, { force: true });
  }
  wappenVergessen();
  raeumeUmgebung();
  delete process.env.RESEND_API_KEY;
  delete process.env.KITFLOW_BASIS;
  delete process.env.HAENDLER;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Wappen an der Händleranfrage", () => {
  test("die Bytes kommen unversehrt an", async () => {
    await legeWappen();
    const w = welt(true);

    await bestaetigenUndFreigeben();

    const bild = anfrage(briefe(w.aufrufe))?.attachments?.find((a) => a.filename === "wappen.png");
    expect(bild, "kein Wappen am Brief").toBeDefined();

    const zurueck = new Uint8Array(Buffer.from(bild!.content, "base64"));
    // Byte für Byte, nicht als Text: genau hier ging es vorher kaputt.
    expect(Array.from(zurueck)).toEqual(Array.from(BYTES));
  });

  test("das HTML verweist darauf, und der Anhang trägt dieselbe Kennung", async () => {
    await legeWappen();
    const w = welt(true);

    await bestaetigenUndFreigeben();

    const brief = anfrage(briefe(w.aufrufe));
    expect(brief?.html).toContain("cid:wappen");
    expect(brief?.attachments?.find((a) => a.filename === "wappen.png")?.content_id).toBe("wappen");
  });

  test("ohne Haken kein Wappen, auch wenn die Datei daliegt", async () => {
    await legeWappen();
    const w = welt(false);

    await bestaetigenUndFreigeben();

    const brief = anfrage(briefe(w.aufrufe));
    expect(brief?.html).not.toContain("cid:wappen");
    expect(brief?.attachments?.some((a) => a.filename === "wappen.png")).toBe(false);
  });

  test("angehakt, aber keine Datei: kein Verweis ins Leere", async () => {
    await ohneWappen();
    const w = welt(true);

    await bestaetigenUndFreigeben();

    const brief = anfrage(briefe(w.aufrufe));
    // Der Haken allein darf kein kaputtes Bildsymbol erzeugen.
    expect(brief?.html).not.toContain("cid:");
    expect(brief?.attachments?.some((a) => a.filename === "wappen.png")).toBe(false);
    // Die Anfrage selbst geht trotzdem raus — ein fehlendes Logo haelt nichts auf.
    expect(brief?.attachments?.some((a) => a.filename.endsWith(".csv"))).toBe(true);
  });

  test("die CSV bleibt Text und wird nicht als Bild verschickt", async () => {
    await legeWappen();
    const w = welt(true);

    await bestaetigenUndFreigeben();

    const csv = anfrage(briefe(w.aufrufe))?.attachments?.find((a) => a.filename.endsWith(".csv"));
    expect(csv?.content_id).toBeUndefined();
    expect(Buffer.from(csv!.content, "base64").toString("utf8")).toContain(";");
  });

  test("nur die Händleranfrage, nicht die Mail an den Trainer", async () => {
    await legeWappen();
    const w = welt(true);

    await bestaetigenUndFreigeben();

    // M5 geht im selben Zug an den Trainer. Kais Schnitt: das Wappen geht nach
    // draussen, nicht an die eigenen Leute.
    const anTrainer = briefe(w.aufrufe).filter((b) => !b.subject.includes("Angebotsanfrage"));
    expect(anTrainer.length, "keine Mail an den Trainer gefunden").toBeGreaterThan(0);
    for (const b of anTrainer) {
      expect(b.html).not.toContain("cid:wappen");
      expect(b.attachments?.some((a) => a.filename === "wappen.png") ?? false).toBe(false);
    }
  });
});
