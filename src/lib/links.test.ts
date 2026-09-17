import { afterEach, describe, expect, test } from "vitest";

/**
 * Die signierten Links sind die einzige Zugangsgrenze von kitflow: es gibt
 * keinen Login. Bricht hier etwas, sieht jemand die Größen fremder Kinder oder
 * bearbeitet einen fremden Vorgang. Deshalb steht dieser Test zuerst.
 *
 * Geprüft wird das Verhalten, nicht die Zeichenkette: dass eine Signatur gilt,
 * ist wenig wert — es zählt, dass die falschen nicht gelten.
 */

const SCHLUESSEL = "x".repeat(32);
const ANDERER = "y".repeat(32);

/** Das Modul liest den Schlüssel bei jedem Aufruf, nicht beim Import. */
async function links(schluessel: string | undefined) {
  if (schluessel === undefined) delete process.env.LINK_SECRET;
  else process.env.LINK_SECRET = schluessel;
  return import("./links");
}

afterEach(() => {
  delete process.env.LINK_SECRET;
});

describe("mit Schlüssel", () => {
  test("eine eigene Signatur wird angenommen", async () => {
    const { signiere, pruefe } = await links(SCHLUESSEL);
    const token = signiere("groessen", "AUS-2026-001", "123");
    expect(token).toBeTruthy();
    expect(pruefe(token!, "groessen", "AUS-2026-001", "123")).toBe(true);
  });

  test("ein anderer Zweck gilt nicht", async () => {
    const { signiere, pruefe } = await links(SCHLUESSEL);
    const status = signiere("status", "AUS-2026-001")!;
    // Sonst würde ein Status-Link zum Bestätigungs-Link – und der Spieler
    // könnte die Liste seiner Mannschaft freigeben.
    expect(pruefe(status, "bestaetigen", "AUS-2026-001")).toBe(false);
    expect(pruefe(status, "ergaenzen", "AUS-2026-001")).toBe(false);
  });

  test("eine ausgetauschte Personen-ID gilt nicht", async () => {
    const { groessenLink, pruefe } = await links(SCHLUESSEL);
    const pfad = groessenLink("AUS-2026-001", "123")!;
    const token = new URL(pfad, "https://example.invalid").searchParams.get("t")!;

    expect(pruefe(token, "groessen", "AUS-2026-001", "123")).toBe(true);
    // Genau der Angriff, gegen den die ID mit unter der Signatur steht:
    // in der Adresszeile eine andere Nummer eintragen.
    expect(pruefe(token, "groessen", "AUS-2026-001", "124")).toBe(false);
  });

  test("ein anderer Vorgang gilt nicht", async () => {
    const { signiere, pruefe } = await links(SCHLUESSEL);
    const token = signiere("groessen", "AUS-2026-001", "123")!;
    expect(pruefe(token, "groessen", "AUS-2026-002", "123")).toBe(false);
  });

  test("der Spieler-Link öffnet nicht die Trainer-Ansicht", async () => {
    const { statusLink, pruefe } = await links(SCHLUESSEL);
    const spieler = statusLink("AUS-2026-001", "123")!;
    const token = new URL(spieler, "https://example.invalid").searchParams.get("t")!;

    // Der Trainer-Link trägt nur die Vorgangsnummer. Ginge der Spieler-Token
    // hier durch, könnte jeder Spieler Personen nachtragen und die Voranfrage
    // abbrechen – beide Server Actions prüfen genau diesen Zweck.
    expect(pruefe(token, "status", "AUS-2026-001")).toBe(false);
  });

  test("die Teile lassen sich nicht verschieben", async () => {
    const { signiere } = await links(SCHLUESSEL);
    // Ohne Trennzeichen ergäben ("a","bc") und ("ab","c") dieselbe Nachricht.
    expect(signiere("groessen", "a", "bc")).not.toBe(signiere("groessen", "ab", "c"));
  });

  test("ein Token aus einem anderen Schlüssel gilt nicht", async () => {
    const fremd = (await links(ANDERER)).signiere("groessen", "AUS-2026-001", "123")!;
    const { pruefe } = await links(SCHLUESSEL);
    expect(pruefe(fremd, "groessen", "AUS-2026-001", "123")).toBe(false);
  });

  test("Unsinn wird abgewiesen, statt zu werfen", async () => {
    const { pruefe } = await links(SCHLUESSEL);
    // timingSafeEqual wirft bei ungleicher Länge – davor steht eine Prüfung.
    for (const token of ["", "kurz", "x".repeat(200), "!!!"]) {
      expect(pruefe(token, "groessen", "AUS-2026-001", "123")).toBe(false);
    }
    expect(pruefe(undefined, "groessen", "AUS-2026-001", "123")).toBe(false);
  });
});

describe("ohne brauchbaren Schlüssel", () => {
  test.for([
    ["gar keiner", undefined],
    ["leer", ""],
    ["zu kurz", "x".repeat(31)],
  ] as const)("%s: es wird nichts signiert und nichts angenommen", async ([, wert]) => {
    const { linksAktiv, signiere, pruefe, groessenLink } = await links(wert);

    expect(linksAktiv()).toBe(false);
    expect(signiere("groessen", "AUS-2026-001", "123")).toBeNull();
    expect(groessenLink("AUS-2026-001", "123")).toBeNull();
    // Der wichtigste Fall: ohne Schlüssel darf nichts durchkommen. Eine
    // Anwendung ohne Schlüssel steht sonst offen.
    expect(pruefe("egal", "groessen", "AUS-2026-001", "123")).toBe(false);
  });
});
