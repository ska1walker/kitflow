import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { bedarfMelden } from "@/app/neu/aktion";
import { vorgangAnlegen } from "@/app/neu/bestaetigen/[entwurf]/aktion";
import { signiere } from "./links";
import { GUELTIG_STUNDEN, holeEntwurf, raeumeEntwuerfe } from "./entwurf";
import { kontakt, satz } from "../../test/satz";
import { raeumeUmgebung, stelleUmgebung, stelleWelt, type Welt } from "../../test/welt";

/**
 * Der Bestätigungsklick an `/neu`.
 *
 * `/neu` steht offen im Netz. Es prüfte bisher, ob die eingetragene Adresse
 * einem Trainer der Fußballsparte gehört — aber nicht, ob der am Formular
 * diese Adresse **besitzt**. Die Adressen des Vereins folgen dem Muster
 * `vorname.nachname@…`, und wer Trainer ist, steht auf fussball.de. Damit
 * konnte ein Fremder einen Vorgang in fremdem Namen anlegen: 26 Kontakte
 * daran, M1 an jemanden, der nichts gemeldet hat.
 *
 * Geprüft wird beides: dass Abschicken allein nichts mehr anlegt, und dass der
 * Klick es tut — aber nur mit gültigem Token und nur einmal.
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

function welt(mehr: Partial<Welt> = {}) {
  return stelleWelt({
    vorgang: satz({ nummer: "AUS-2026-001", stufe: 1 }),
    kontakte: [
      kontakt("900", {
        firstname: "Kai",
        lastname: "Böhm",
        email: TRAINER,
        team: "2007",
        numemployees: "Trainer",
        sparte: "Fußball",
      }),
      kontakt("111", { firstname: "Anna", lastname: "Klein", email: "a@example.invalid", team: "2007" }),
      kontakt("222", { firstname: "Bernd", lastname: "Groß", email: "b@example.invalid", team: "2007" }),
    ],
    naechsteNummer: "AUS-2026-002",
    entwuerfe: [],
    ...mehr,
  });
}

function angelegt(aufrufe: { host: string; methode: string; pfad: string }[]) {
  return aufrufe.some((a) => a.host === "db" && a.pfad === "vorgang" && a.methode === "POST");
}

function briefe(aufrufe: { host: string; koerper: unknown }[]) {
  return aufrufe
    .filter((a) => a.host === "resend")
    .map((a) => a.koerper as { to: string[]; subject: string; text: string });
}

/** Die ID, die die Papp-Welt dem ersten Entwurf gibt. */
const ERSTER = "00000000-0000-4000-8000-000000000001";

/** Meldet Bedarf und gibt die Entwurfs-ID samt gültigem Token zurück. */
async function melde(w: ReturnType<typeof welt>) {
  const stand = await bedarfMelden({ stand: "leer" }, formular());
  expect(stand.stand, "Bedarfsmeldung kam nicht durch").toBe("bestaetigen");
  expect(
    w.aufrufe.some((a) => a.pfad === "vorgang_entwurf" && a.methode === "POST"),
    "kein Entwurf geparkt",
  ).toBe(true);
  return { id: ERSTER, token: signiere("anlegen", ERSTER) ?? "" };
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

describe("Abschicken legt nichts an", () => {
  test("es entsteht nur ein Entwurf und eine Mail", async () => {
    const w = welt();

    const stand = await bedarfMelden({ stand: "leer" }, formular());

    expect(stand.stand).toBe("bestaetigen");
    expect(angelegt(w.aufrufe)).toBe(false);
    // Kein Kontakt verknüpft, kein Deal, keine Vorgangsnummer verbraucht.
    expect(w.aufrufe.some((a) => a.pfad === "vorgang_person")).toBe(false);
    expect(w.aufrufe.some((a) => a.pfad === "rpc/naechste_vorgangsnummer")).toBe(false);
  });

  test("die Bestätigungsmail geht an die eingetragene Adresse", async () => {
    const w = welt();

    await bedarfMelden({ stand: "leer" }, formular());

    const post = briefe(w.aufrufe);
    expect(post).toHaveLength(1);
    expect(post[0].to).toEqual([TRAINER]);
    expect(post[0].subject).toContain("Bitte bestätigen");
  });

  test("die Mail sagt, was passiert, wenn man es nicht war", async () => {
    // Für den, der es nicht war, ist diese Mail eine Warnung – sie muss sagen,
    // dass Nichtstun reicht.
    const w = welt();
    await bedarfMelden({ stand: "leer" }, formular());

    expect(briefe(w.aufrufe)[0].text).toContain("ignorier diese Mail");
  });

  test("die Antwort an den Browser trägt keine Namen", async () => {
    // `/neu` hat kein Token: dort darf nie stehen, wer in der Mannschaft ist.
    welt();

    const stand = await bedarfMelden({ stand: "leer" }, formular());

    const text = JSON.stringify(stand);
    expect(text).not.toContain("Anna");
    expect(text).not.toContain("Klein");
    expect(text).not.toContain("/g/");
    expect(text).not.toContain("/v/");
  });

  test("ohne Mailweg entsteht auch kein Entwurf", async () => {
    // Sonst läge ein Entwurf da und der Trainer wartete auf eine Mail, die
    // nie kommt.
    delete process.env.RESEND_API_KEY;
    const w = welt();

    const stand = await bedarfMelden({ stand: "leer" }, formular());

    expect(stand.stand).toBe("fehler");
    expect(w.aufrufe.some((a) => a.pfad === "vorgang_entwurf")).toBe(false);
  });
});

describe("Erst der Klick legt an", () => {
  test("mit gültigem Token entsteht der Vorgang", async () => {
    const w = welt();
    const { id, token } = await melde(w);

    const stand = await vorgangAnlegen(id, token, { stand: "leer" });

    expect(stand.stand).toBe("fertig");
    expect(angelegt(w.aufrufe)).toBe(true);
    // Und jetzt geht M1 raus.
    expect(briefe(w.aufrufe).some((b) => b.subject.includes("Größenabfrage"))).toBe(true);
  });

  test("ohne Token entsteht nichts", async () => {
    const w = welt();
    const { id } = await melde(w);
    const vorher = w.aufrufe.length;

    const stand = await vorgangAnlegen(id, "", { stand: "leer" });

    expect(stand.stand).toBe("fehler");
    expect(angelegt(w.aufrufe)).toBe(false);
    // Nicht einmal nachgesehen: ohne Token gibt es nichts zu laden.
    expect(w.aufrufe.length).toBe(vorher);
  });

  test("mit verbogenem Token entsteht nichts", async () => {
    const w = welt();
    const { id, token } = await melde(w);

    const stand = await vorgangAnlegen(id, `${token.slice(0, -1)}x`, { stand: "leer" });

    expect(stand.stand).toBe("fehler");
    expect(angelegt(w.aufrufe)).toBe(false);
  });

  test("ein Token für einen anderen Zweck zählt nicht", async () => {
    // Ein Status-Token trägt dieselbe Zeichenkette unter einem anderen Zweck.
    const w = welt();
    const { id } = await melde(w);

    const stand = await vorgangAnlegen(id, signiere("status", id) ?? "", { stand: "leer" });

    expect(stand.stand).toBe("fehler");
    expect(angelegt(w.aufrufe)).toBe(false);
  });

  test("eine fremde Entwurfs-ID mit eigenem Token bringt nichts", async () => {
    // Das Token ist echt, aber es gehört zu einer ID, die es nicht gibt.
    const w = welt();
    await melde(w);
    const fremd = "00000000-0000-4000-8000-000000000999";

    const stand = await vorgangAnlegen(fremd, signiere("anlegen", fremd) ?? "", { stand: "leer" });

    expect(stand.stand).toBe("fehler");
    expect(angelegt(w.aufrufe)).toBe(false);
  });

  test("zweimal geklickt legt nur einen Vorgang an", async () => {
    // Der Entwurf ist nach dem ersten Mal weg. Sonst entstünde bei jedem
    // Nachladen der Seite ein weiterer Vorgang.
    const w = welt();
    const { id, token } = await melde(w);

    await vorgangAnlegen(id, token, { stand: "leer" });
    const zweite = await vorgangAnlegen(id, token, { stand: "leer" });

    expect(zweite.stand).toBe("fehler");
    expect(zweite.stand === "fehler" && zweite.text).toContain("schon benutzt");
    const anlagen = w.aufrufe.filter(
      (a) => a.host === "db" && a.pfad === "vorgang" && a.methode === "POST",
    );
    expect(anlagen).toHaveLength(1);
  });
});

describe("Entwürfe verfallen", () => {
  test("nach der Frist gilt der Link nicht mehr", async () => {
    const alt = new Date(Date.now() - (GUELTIG_STUNDEN + 1) * 3_600_000).toISOString();
    welt({
      entwuerfe: [
        { id: ERSTER, email: TRAINER, daten: {}, angelegt_am: alt },
      ],
    });

    const abruf = await holeEntwurf(ERSTER);

    expect(abruf.stand).toBe("abgelaufen");
  });

  test("kurz davor noch", async () => {
    const fast = new Date(Date.now() - (GUELTIG_STUNDEN - 1) * 3_600_000).toISOString();
    welt({
      entwuerfe: [
        { id: ERSTER, email: TRAINER, daten: {}, angelegt_am: fast },
      ],
    });

    const abruf = await holeEntwurf(ERSTER);

    expect(abruf.stand).toBe("da");
  });

  test("ein abgelaufener Entwurf legt auch mit gültigem Token nichts an", async () => {
    const alt = new Date(Date.now() - (GUELTIG_STUNDEN + 1) * 3_600_000).toISOString();
    const id = ERSTER;
    const w = welt({ entwuerfe: [{ id, email: TRAINER, daten: {}, angelegt_am: alt }] });

    const stand = await vorgangAnlegen(id, signiere("anlegen", id) ?? "", { stand: "leer" });

    expect(stand.stand === "fehler" && stand.text).toContain("abgelaufen");
    expect(angelegt(w.aufrufe)).toBe(false);
  });

  test("das Aufräumen löscht nach Alter, nicht alles", async () => {
    // Ohne den Filter räumte der tägliche Lauf jeden frischen Entwurf mit weg –
    // und der Trainer klickte in einen Link, der ins Leere führt.
    const w = welt();

    await raeumeEntwuerfe();

    const weg = w.aufrufe.find((a) => a.pfad === "vorgang_entwurf" && a.methode === "DELETE");
    expect(weg?.suche.angelegt_am).toMatch(/^lt\./);
  });

  test("schweigt die Datenbank, ist das kein abgelaufener Entwurf", async () => {
    const id = ERSTER;
    const w = welt({ entwuerfeGestoert: true });

    const stand = await vorgangAnlegen(id, signiere("anlegen", id) ?? "", { stand: "leer" });

    expect(stand.stand === "fehler" && stand.text).toContain("nicht an die Daten");
    expect(angelegt(w.aufrufe)).toBe(false);
  });
});

describe("Was im Entwurf steht", () => {
  test("die Eingabe, unverändert – und nichts aus HubSpot", async () => {
    const w = welt();

    await bedarfMelden({ stand: "leer" }, formular());

    const post = w.aufrufe.find(
      (a) => a.pfad === "vorgang_entwurf" && a.methode === "POST",
    )?.koerper as { email: string; daten: { vorname: string; teams: string[] } };
    expect(post.email).toBe(TRAINER);
    expect(post.daten.vorname).toBe("Kai");
    expect(post.daten.teams).toEqual(["2007"]);
    // Keine Namen der Mannschaft: die werden erst beim Anlegen geholt.
    expect(JSON.stringify(post.daten)).not.toContain("Anna");
  });
});
