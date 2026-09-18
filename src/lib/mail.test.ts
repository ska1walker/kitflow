import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { sendeM1, sendeM2a, sendeMail, type M1Daten } from "./mail";

/**
 * Eine Mail wird als Liste von Blöcken beschrieben, nicht als HTML. Daraus
 * entstehen beide Fassungen — die gestaltete und die reine Textfassung — und
 * der Sinn der Übung ist, dass sie nicht auseinanderlaufen können.
 *
 * Das ist eine Behauptung, solange sie niemand prüft. Diese Tests nehmen die
 * Mail so, wie sie rausginge: über `sendeM1`, mit einem Resend aus Pappe.
 *
 * Wie Gmail oder Outlook das HTML zeichnen, steht hier nicht — das ist von
 * einem Test aus nicht zu beantworten und bleibt ein echter Versand.
 */

let gesendet: ReturnType<typeof vi.fn>;

/** Was tatsächlich bei Resend ankäme. */
function brief() {
  const [, o] = gesendet.mock.calls[0];
  return JSON.parse(String((o as RequestInit).body)) as {
    to: string[];
    subject: string;
    text: string;
    html: string;
  };
}

function daten(mehr: Partial<M1Daten> = {}): M1Daten {
  return {
    vorgang: "AUS-2026-001",
    vorname: "Kai",
    mannschaft: "Ü40 Team 3",
    artikel: [{ name: "adidas Trainingsjacke", detail: "1 Stück je Person" }],
    // So, wie es aus dem Formular kommt: ISO. Die Mail liest ein Mensch.
    groessenFrist: "2026-09-30",
    statusLink: "https://zz.example.invalid/v/AUS-2026-001?t=abc",
    bestaetigenLink: "https://zz.example.invalid/b/AUS-2026-001?t=def",
    ...mehr,
  };
}

beforeEach(() => {
  process.env.RESEND_API_KEY = "zz-test";
  process.env.KITFLOW_BASIS = "https://zz.example.invalid";
  delete process.env.MAIL_NUR_AN;
  gesendet = vi.fn(async () => Response.json({ id: "1" }));
  vi.stubGlobal("fetch", gesendet);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.KITFLOW_BASIS;
  delete process.env.MAIL_NUR_AN;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Beide Fassungen tragen dieselbe Substanz", () => {
  test("was im HTML steht, steht auch im Text", async () => {
    await sendeM1("zz@example.invalid", daten());
    const { text, html } = brief();

    for (const inhalt of ["AUS-2026-001", "adidas Trainingsjacke", "30.09.", "Ü40 Team 3"]) {
      expect(html, `im HTML: ${inhalt}`).toContain(inhalt);
      expect(text, `im Text: ${inhalt}`).toContain(inhalt);
    }
  });

  test("die Links stehen vollständig in der Textfassung", async () => {
    await sendeM1("zz@example.invalid", daten());
    const { text } = brief();

    // Abgeschnitten wäre schlimmer als gar nicht da: niemand merkt es.
    expect(text).toContain("https://zz.example.invalid/v/AUS-2026-001?t=abc");
    expect(text).toContain("https://zz.example.invalid/b/AUS-2026-001?t=def");
  });

  test("die Textfassung ist Text, kein halbes HTML", async () => {
    await sendeM1("zz@example.invalid", daten());
    expect(brief().text).not.toMatch(/<\/?(table|td|p|div|h2)\b/);
  });
});

describe("Fremder Text wird nicht zu Markup", () => {
  test("ein Artikelname aus dem offenen Formular bleibt harmlos", async () => {
    // /neu steht ohne Token offen; der Name kommt von dort.
    await sendeM1("zz@example.invalid", {
      ...daten(),
      artikel: [{ name: '<script>alert(1)</script>', detail: 'Farbe "rot" & blau' }],
    });
    const { html, text } = brief();

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
    // Im Text bleibt er, wie er war – dort ist er ungefährlich.
    expect(text).toContain("<script>alert(1)</script>");
  });
});

describe("Die drei Zuschnitte von M1", () => {
  test("vollständig: weiter zur Statusseite, keine fremden Links", async () => {
    // M1 trug bis hierher die Größen-Links der ganzen Mannschaft und dazu einen
    // fertigen Text zum Weiterleiten in die Elterngruppe. Jeder dieser Links
    // öffnet die Größen genau einer Person; einmal weitergeleitet, hat ihn die
    // halbe Elternschaft. Verschickt werden sie jetzt einzeln, über die
    // Statusseite (`sendeM2a`).
    await sendeM1("zz@example.invalid", daten());
    const { subject, text, html } = brief();

    expect(subject).toContain("AUS-2026-001");
    expect(text).toContain("Größen-Mail verschicken");
    expect(text).toContain("https://zz.example.invalid/v/AUS-2026-001?t=abc");
    expect(text).toContain("Intersport Uelzen");
    expect(text).toContain("Bestellt wird erst");

    // Kein persönlicher Größen-Link und keine Anleitung zum Weitergeben.
    for (const fassung of [text, html]) {
      expect(fassung).not.toContain("/g/");
      expect(fassung).not.toContain("Elterngruppe");
    }
  });

  test("die Frist steht deutsch da, nicht als ISO-Datum", async () => {
    // Im ersten echten Versand stand „Größen bitte bis 2026-09-19 eintragen“.
    await sendeM1("zz@example.invalid", daten());
    const { text } = brief();

    expect(text).toContain("30.09.");
    expect(text).not.toContain("2026-09-30");
  });

  test("Voranfrage: niemand ist angeschrieben worden", async () => {
    await sendeM1("zz@example.invalid", {
      ...daten(),
      ergaenzenLink: "https://zz.example.invalid/e/AUS-2026-001?t=jkl",
      bestaetigenLink: undefined,
    });
    const { text } = brief();

    expect(text).toContain("Angaben vervollständigen");
    // Keine Größen-Links, es wurde ja noch niemand gefragt.
    expect(text).not.toContain("/g/AUS-2026-001");
  });

  test("Größencheck: keine Artikelliste und kein Wort zur Bezahlung", async () => {
    await sendeM1("zz@example.invalid", { ...daten(), nurGroessen: true, artikel: [] });
    const { text } = brief();

    expect(text).toContain("bestellt nichts");
    // Ein Größencheck geht an keinen Händler.
    expect(text).not.toContain("Intersport Uelzen");
    expect(text).not.toContain("Bestellt wird erst");
  });
});

describe("M2a · der persönliche Größen-Link", () => {
  function m2a(mehr: Partial<Parameters<typeof sendeM2a>[1]> = {}) {
    return sendeM2a("zz@example.invalid", {
      vorgang: "AUS-2026-001",
      vorname: "Kai",
      mannschaft: "Ü40 Team 3",
      arten: "Oberteil und Trainingshose",
      frist: "2026-09-30",
      nurGroessen: false,
      groessenLink: "https://zz.example.invalid/g/AUS-2026-001/111?t=ghi",
      ...mehr,
    });
  }

  test("Betreff, Vorschau und Text nennen die Frist deutsch", async () => {
    await m2a();
    const { subject, text } = brief();

    expect(subject).toContain("30.09.");
    expect(subject).not.toContain("2026-09-30");
    expect(text).toContain("30.09.");
    expect(text).not.toContain("2026-09-30");
  });

  test("nur der eigene Link, kein fremder Name", async () => {
    await m2a();
    const { text } = brief();

    expect(text).toContain("https://zz.example.invalid/g/AUS-2026-001/111?t=ghi");
    expect(text).toContain("gilt nur für dich");
  });
});

describe("Hausregeln", () => {
  test("keine Emojis, in keiner Fassung", async () => {
    await sendeM1("zz@example.invalid", daten());
    const { text, html, subject } = brief();
    const emoji = /\p{Extended_Pictographic}/u;

    for (const [name, wert] of [["Betreff", subject], ["Text", text], ["HTML", html]] as const) {
      expect(emoji.test(wert), `${name} enthält ein Emoji`).toBe(false);
    }
  });

  test("der Schlüssel steht in keiner Meldung", async () => {
    const meldungen: string[] = [];
    vi.mocked(console.error).mockImplementation((...a: unknown[]) => {
      meldungen.push(a.map(String).join(" "));
    });
    gesendet.mockResolvedValue(new Response("Domain not verified", { status: 403 }));

    expect(await sendeM1("zz@example.invalid", daten())).toBeNull();
    // Die Antwort von Resend gehört ins Log – sie sagt meist, was fehlt.
    expect(meldungen.join("\n")).toContain("Domain not verified");
    expect(meldungen.join("\n")).not.toContain("zz-test");
  });
});

describe("Die Testbremse", () => {
  test("MAIL_NUR_AN leitet um und sagt es dazu", async () => {
    process.env.MAIL_NUR_AN = "kai@example.invalid";
    const an = await sendeMail({
      an: "eltern@example.invalid",
      betreff: "ZZ",
      text: "Hallo",
      html: "<p>Hallo</p>",
    });

    expect(an).toBe("kai@example.invalid");
    const b = brief();
    expect(b.to).toEqual(["kai@example.invalid"]);
    // Sonst hält man die Mail für eine echte an die Eltern.
    expect(b.text).toContain("eigentlich an eltern@example.invalid");
    expect(b.html).toContain("eigentlich an eltern@example.invalid");
  });
});

describe("Ohne Schlüssel oder Adresse", () => {
  test.for([
    ["kein Schlüssel", "RESEND_API_KEY"],
    ["keine Basis-Adresse", "KITFLOW_BASIS"],
  ] as const)("%s: es geht nichts raus, und das ist kein Fehler", async ([, weg]) => {
    delete process.env[weg];
    delete process.env.VERCEL_URL;

    expect(await sendeM1("zz@example.invalid", daten())).toBeNull();
    expect(gesendet).not.toHaveBeenCalled();
  });
});

describe("Der Versand wartet nicht ewig", () => {
  test("jede Mail geht mit einer Zeitgrenze raus", async () => {
    // Ohne sie hängt ein stiller Resend-Ausfall die ganze Server Action auf —
    // und die wichtigste davon ist „Freigeben und verschicken“, bei der ein
    // Mensch vor dem Knopf sitzt und wartet. Telegram und Todoist hatten die
    // Grenze von Anfang an, der Mailversand nicht.
    await sendeM1("zz@example.invalid", daten());

    const [, o] = gesendet.mock.calls[0];
    const signal = (o as RequestInit).signal;
    expect(signal, "fetch bekam kein AbortSignal").toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
  });

  test("läuft sie ab, ist das kein Absturz, sondern „nicht zugestellt“", async () => {
    // Der Aufrufer darf daraus nie einen Abbruch machen: ein Vorgang ist auch
    // ohne Mail gültig, die Links stehen auf der Seite.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation was aborted.", "TimeoutError");
      }),
    );

    await expect(
      sendeMail({ an: "zz@example.invalid", betreff: "x", text: "y", html: "<p>y</p>" }),
    ).resolves.toBeNull();
  });
});
