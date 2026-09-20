import "server-only";

import { alsHtml, alsText, type Rahmen } from "./mail-rahmen";
import { wappenAnhang } from "./wappen";

/**
 * Mailversand über Resend (docs/mails.md).
 *
 * Kein SDK, nur ein `fetch` gegen die REST-Schnittstelle – wie bei HubSpot.
 * Das hält die Abhängigkeiten klein und den Weg nach außen an einer Stelle.
 *
 * Drei Bremsen sind eingebaut, weil eine Mail nicht zurückzuholen ist:
 *
 * 1. Ohne `RESEND_API_KEY` wird nichts verschickt, und das ist kein Fehler:
 *    die Seite zeigt die Links dann weiter selbst an.
 * 2. Ohne bekannte Basis-Adresse wird nichts verschickt. Eine Mail mit
 *    kaputten Links ist schlimmer als keine Mail.
 * 3. `MAIL_NUR_AN` leitet jede Mail an genau diese Adresse um. Zum Testen auf
 *    der Vorschau, damit nie versehentlich jemand anderes angeschrieben wird.
 */

const ABSENDER_STANDARD = "Eintracht Munster Fußball <ausstattung@hubsport.club>";
const ANTWORT_STANDARD = "kai.boehm@eintrachtmunster.de";

/** Wie lange auf Resend gewartet wird, bevor die Mail als nicht zugestellt gilt. */
const ZEITGRENZE_MS = 20_000;

/**
 * Die Adresse, unter der kitflow erreichbar ist. Links in einer Mail müssen
 * absolut sein; relative Pfade führen im Postfach ins Leere.
 */
export function basis(): string | null {
  const gesetzt = process.env.KITFLOW_BASIS;
  if (gesetzt) return gesetzt.replace(/\/+$/, "");
  // Vercel setzt den Host der Bereitstellung, ohne Schema.
  const vercel = process.env.VERCEL_URL;
  return vercel ? `https://${vercel}` : null;
}

export function absolut(pfad: string): string | null {
  const b = basis();
  return b && pfad ? `${b}${pfad}` : null;
}

export function mailAktiv(): boolean {
  return Boolean(process.env.RESEND_API_KEY) && basis() !== null;
}

/**
 * Ein Anhang.
 *
 * **Text und Binaerdaten sind zwei Faelle, nicht ein Feld mit Sonderbehandlung.**
 * Bis zum 20.09.2026 gab es nur `inhalt: string`, und `sendeMail` machte daraus
 * `Buffer.from(inhalt, "utf8")`. Fuer die CSV an M4 geht das; ein PNG durch
 * `utf8` zu schicken **zerstoert die Datei** — ohne Fehler, ohne Logzeile, der
 * Haendler bekaeme einen unbrauchbaren Anhang. Deshalb muss der Aufrufer sagen,
 * was er hat.
 */
export type Anhang =
  | {
      art: "text";
      dateiname: string;
      /** Der Inhalt als Text. Base64 macht `sendeMail` daraus. */
      inhalt: string;
    }
  | {
      art: "binaer";
      dateiname: string;
      bytes: Uint8Array;
      /** MIME-Typ, etwa `image/png`. */
      typ: string;
      /**
       * Gesetzt macht den Anhang zu einem **Inline-Bild**: das HTML verweist
       * mit `cid:<inlineId>` darauf, statt eine fremde Adresse zu laden —
       * Outlook und Gmail blockieren externe Bilder standardmaessig.
       *
       * **Nicht geprueft**: `resend.com` ist aus der Bauumgebung gesperrt (403
       * vom Proxy, wie Supabase und Telegram). Das Feld heisst bei Resend nach
       * meinem Kenntnisstand `content_id`. Stimmt das nicht, kommt das Bild als
       * gewoehnlicher Anhang an statt im Kopf — deshalb steht das Wappen im
       * Rahmen **neben** dem Vereinsnamen und nicht an seiner Stelle: faellt es
       * aus, fehlt ein Bild, nicht der Absender.
       */
      inlineId?: string;
    };

type Mail = {
  an: string;
  betreff: string;
  text: string;
  html: string;
  /** Antworten sollen zum Verein, nicht an die Absenderadresse. */
  antwortAn?: string;
  anhaenge?: Anhang[];
};

/**
 * Verschickt eine Mail. Zurück kommt die Adresse, an die sie ging, oder `null`
 * – der Aufrufer soll daraus nie einen Abbruch machen: ein Vorgang ist auch
 * ohne Mail gültig, die Links stehen auf der Seite.
 */
export async function sendeMail({
  an,
  betreff,
  text,
  html,
  antwortAn,
  anhaenge,
}: Mail): Promise<string | null> {
  if (!mailAktiv()) return null;

  const umleitung = process.env.MAIL_NUR_AN;
  const empfaenger = umleitung || an;

  try {
    const antwort = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_ABSENDER || ABSENDER_STANDARD,
        reply_to: antwortAn || process.env.MAIL_ANTWORT || ANTWORT_STANDARD,
        to: [empfaenger],
        subject: betreff,
        ...(anhaenge && anhaenge.length > 0
          ? {
              attachments: anhaenge.map((a) =>
                a.art === "text"
                  ? {
                      filename: a.dateiname,
                      content: Buffer.from(a.inhalt, "utf8").toString("base64"),
                    }
                  : {
                      filename: a.dateiname,
                      // Kein "utf8" — die Bytes sind schon Bytes. Genau hier ging
                      // ein Bild vorher kaputt.
                      content: Buffer.from(a.bytes).toString("base64"),
                      content_type: a.typ,
                      ...(a.inlineId ? { content_id: a.inlineId } : {}),
                    },
              ),
            }
          : {}),
        text: umleitung && umleitung !== an ? `[Testumleitung, eigentlich an ${an}]\n\n${text}` : text,
        html:
          umleitung && umleitung !== an
            ? `<p style="font:13px sans-serif;color:#a1a1aa;">Testumleitung, eigentlich an ${an}</p>${html}`
            : html,
      }),
      // Ohne Zeitgrenze haengt ein stiller Resend-Ausfall die ganze Server
      // Action auf — und die wichtigste davon ist „Freigeben und verschicken“,
      // bei der ein Mensch vor dem Knopf sitzt und wartet. Telegram und Todoist
      // hatten die Grenze von Anfang an, der Mailversand nicht; aufgefallen ist
      // das erst, als beide nebeneinander standen.
      //
      // 20 Sekunden statt 10 wie bei den Benachrichtigungen: hier haengt ein
      // Anhang dran, und eine Mail, die nicht rausgeht, ist teurer als eine
      // Chatnachricht, die ausbleibt.
      signal: AbortSignal.timeout(ZEITGRENZE_MS),
    });

    if (!antwort.ok) {
      // Der Text der Antwort sagt bei Resend, was fehlt – meist die Domain.
      console.error(`Resend ${antwort.status}: ${(await antwort.text()).slice(0, 200)}`);
      return null;
    }
    return empfaenger;
  } catch (fehler) {
    console.error(
      "Resend nicht erreichbar:",
      fehler instanceof Error ? fehler.message : "unbekannter Fehler",
    );
    return null;
  }
}

/**
 * „2026-09-19“ wird „19.09.“ — das Formular liefert ISO, die Mail liest ein
 * Mensch. Was schon kurz ist, bleibt, wie es ist.
 */
function kurzesDatum(wert: string): string {
  const treffer = /^(\d{4})-(\d{2})-(\d{2})$/.exec(wert.trim());
  return treffer ? `${treffer[3]}.${treffer[2]}.` : wert;
}

/** „Hallo Kai" oder schlicht „Hallo". Ein leerer Name darf nicht auffallen. */
function anrede(vorname: string): string {
  return vorname.trim() ? `Hallo ${vorname.trim()},` : "Hallo,";
}

const ZAHLUNG =
  "Bestellt wird erst, wenn die Finanzierung steht und das Geld da ist. Zahlt der Verein, muss das Geld auf dem Vereinskonto sein. Legt die Mannschaft aus, überweist sie vorab direkt an den Händler.";

export type M1Daten = {
  vorgang: string;
  /** Leer, wenn der Vorname nicht bekannt ist – er steht in keiner Eigenschaft. */
  vorname: string;
  mannschaft: string;
  artikel: { name: string; detail: string }[];
  /** Nur im vollständigen Modus. */
  groessenFrist?: string;
  /** Der Vorgang bestellt nichts, er sammelt nur Groessen ein. */
  nurGroessen?: boolean;
  statusLink: string;
  bestaetigenLink?: string;
  ergaenzenLink?: string;
};

/** M1 für eine Voranfrage: es ist noch niemand angeschrieben worden. */
function m1Voranfrage(d: M1Daten): { betreff: string; rahmen: Rahmen } {
  return {
    betreff: `${d.vorgang} · Voranfrage für ${d.mannschaft} steht`,
    rahmen: {
      eyebrow: `Vorgang ${d.vorgang}`,
      titel: "Deine Voranfrage steht",
      vorschau: `Richtpreis für ${d.mannschaft}. Größen kommen später.`,
      bloecke: [
        { art: "absatz", text: `${anrede(d.vorname)} danke für deine Meldung. Bitte gib die Nummer ${d.vorgang} bei allen Rückfragen an.` },
        { art: "titel", text: "Was angefragt wird" },
        { art: "artikel", zeilen: d.artikel },
        {
          art: "hinweis",
          text: "Das ist eine Voranfrage. Sie liefert einen Richtpreis, mit dem du einen Sponsor ansprechen kannst. Es wurden noch keine Größen abgefragt und niemand aus deiner Mannschaft angeschrieben. Ein Richtpreis ist unverbindlich.",
        },
        { art: "titel", text: "So geht es weiter" },
        {
          art: "schritte",
          punkte: [
            "Sprich mit dem Sponsor.",
            "Steht die Finanzierung, ergänzt du Artikelnummer, Beflockung, Frist und Lieferadresse.",
            "Danach bekommt deine Mannschaft die persönlichen Größenlinks.",
          ],
        },
        { art: "knopf", text: "Angaben vervollständigen", href: d.ergaenzenLink ?? d.statusLink },
        {
          art: "absatz",
          text: "Sagt der Sponsor ab, kannst du die Voranfrage auf deiner Statusseite abbrechen.",
        },
        { art: "links", zeilen: [{ name: "Deine Statusseite", href: d.statusLink }] },
        { art: "titel", text: "Wichtig zur Bezahlung" },
        { art: "absatz", text: ZAHLUNG },
      ],
    },
  };
}

/** M1 für den vollständigen Weg: die Größenabfrage läuft ab sofort. */
function m1Vollstaendig(d: M1Daten): { betreff: string; rahmen: Rahmen } {
  const frist = kurzesDatum(d.groessenFrist ?? "") || "zur Frist";
  // Ein Groessencheck hat keine Artikel und geht an keinen Haendler. Der Satz
  // „erst nach deiner Bestaetigung geht die Anfrage raus“ waere dort eine
  // Ankuendigung, die nie eintritt.
  const nur = d.nurGroessen === true;

  return {
    betreff: `${d.vorgang} · Größenabfrage für ${d.mannschaft} läuft`,
    rahmen: {
      eyebrow: `Vorgang ${d.vorgang}`,
      titel: "Die Größenabfrage läuft",
      vorschau: `${d.mannschaft}: Größen bitte bis ${frist} eintragen.`,
      bloecke: [
        {
          art: "absatz",
          text: `${anrede(d.vorname)} deine Angaben für ${d.mannschaft} sind vollständig. Bitte gib die Nummer ${d.vorgang} bei allen Rückfragen an.`,
        },
        ...(nur
          ? ([
              {
                art: "absatz",
                text: "Dieser Vorgang bestellt nichts: er sammelt nur die Größen ein, damit sie am Kontakt aktuell sind. Es geht keine Anfrage an einen Händler.",
              },
            ] as Rahmen["bloecke"])
          : ([
              { art: "titel", text: "Was angefragt wird" },
              { art: "artikel", zeilen: d.artikel },
            ] as Rahmen["bloecke"])),
        { art: "titel", text: "So geht es weiter" },
        {
          art: "schritte",
          punkte: [
            "Öffne deine Statusseite und verschick die Größen-Mail. Dort hakst du an, wer eine bekommen soll — jede Person bekommt ihren eigenen Link.",
            `Größen bitte bis ${frist} eintragen.`,
            ...(nur
              ? ["Wenn alle eingetragen haben, prüfst du die Liste. Danach ist der Vorgang fertig – bestellt wird nichts."]
              : [
                  "Wenn alle eingetragen haben, prüfst du die Liste. Erst nach deiner Bestätigung geht die Anfrage an Intersport Uelzen und 11teamsports.",
                  "Die Angebote kommen in Kopie an dich.",
                ]),
          ],
        },
        { art: "knopf", text: "Größen-Mail verschicken", href: d.statusLink },
        {
          art: "absatz",
          text: "Wer keine E-Mail-Adresse hinterlegt hat, steht dort grau in der Liste — diese Größen trägst du selbst ein.",
        },
        {
          art: "links",
          zeilen: [
            { name: "Liste prüfen und bestätigen", href: d.bestaetigenLink ?? d.statusLink },
          ],
        },
        ...(nur
          ? ([] as Rahmen["bloecke"])
          : ([
              { art: "titel", text: "Wichtig zur Bezahlung" },
              { art: "absatz", text: ZAHLUNG },
            ] as Rahmen["bloecke"])),
      ],
    },
  };
}

/**
 * M1 an den Trainer. Zurück kommt die Adresse, an die verschickt wurde, sonst
 * `null` – dann zeigt die Danke-Seite die Links weiter selbst an.
 */
export async function sendeM1(an: string, daten: M1Daten): Promise<string | null> {
  const voranfrage = Boolean(daten.ergaenzenLink);
  const { betreff, rahmen } = voranfrage ? m1Voranfrage(daten) : m1Vollstaendig(daten);
  return sendeMail({ an, betreff, text: alsText(rahmen), html: alsHtml(rahmen) });
}

export type BestaetigungDaten = {
  /** Leer, wenn der Vorname nicht bekannt ist. */
  vorname: string;
  mannschaft: string;
  ausstattungsart: string;
  artikel: { name: string; detail: string }[];
  anlegenLink: string;
  gueltigStunden: number;
};

/**
 * Die Bestätigung an `/neu`: „warst du das?“
 *
 * `/neu` steht offen im Netz und prüft, ob die eingetragene Adresse einem
 * Trainer gehört — nicht, ob der am Formular sie besitzt. Diese Mail schließt
 * die Lücke: ohne den Klick darin entsteht kein Vorgang.
 *
 * Sie muss deshalb zweierlei können. Für den, der es war, ist sie ein
 * Zwischenschritt und soll nicht aufhalten. Für den, der es **nicht** war, ist
 * sie eine Warnung — und die gehört nach oben, nicht ans Ende.
 */
export async function sendeBestaetigung(
  an: string,
  d: BestaetigungDaten,
): Promise<string | null> {
  const rahmen: Rahmen = {
    eyebrow: "Noch nicht abgeschickt",
    titel: "Bitte einmal bestätigen",
    vorschau: `${d.mannschaft}: ein Klick, dann läuft es.`,
    bloecke: [
      {
        art: "absatz",
        text: `${anrede(d.vorname)} unter dieser Adresse wurde gerade Ausstattung für ${d.mannschaft} gemeldet. Bevor etwas passiert, brauchen wir einen Klick von dir.`,
      },
      { art: "knopf", text: "Ja, das war ich – Vorgang anlegen", href: d.anlegenLink },
      {
        art: "hinweis",
        text: "Warst du das nicht? Dann ignorier diese Mail einfach. Ohne den Klick entsteht kein Vorgang, es wird niemand angeschrieben, und nach kurzer Zeit ist die Meldung von selbst weg.",
      },
      { art: "titel", text: "Das wurde gemeldet" },
      { art: "absatz", text: d.ausstattungsart },
      ...(d.artikel.length > 0
        ? ([{ art: "artikel", zeilen: d.artikel }] as Rahmen["bloecke"])
        : ([] as Rahmen["bloecke"])),
      {
        art: "absatz",
        text: `Der Link gilt ${d.gueltigStunden} Stunden. Danach meldest du den Bedarf einfach neu.`,
      },
    ],
  };

  return sendeMail({
    an,
    betreff: `Bitte bestätigen: Ausstattung für ${d.mannschaft}`,
    text: alsText(rahmen),
    html: alsHtml(rahmen),
  });
}

export type M2aDaten = {
  vorgang: string;
  /** Leer, wenn am Kontakt kein Vorname steht. */
  vorname: string;
  mannschaft: string;
  /** Was gefragt wird, in Worten: „Oberteil und Trainingshose“. */
  arten: string;
  frist: string;
  /** Der Vorgang bestellt nichts, er sammelt nur Größen ein. */
  nurGroessen: boolean;
  groessenLink: string;
};

/**
 * M2a · der persönliche Größen-Link an eine Person (docs/mails.md).
 *
 * Bis hierher verteilte der Trainer 24 Links von Hand aus der Mail M1. Diese
 * Mail geht an genau eine Person und trägt genau deren Link – er gilt nur für
 * sie und diesen Vorgang.
 *
 * Kein Nachname und keine fremden Namen: die Mail erreicht Eltern, und wer
 * sonst noch in der Mannschaft ist, geht sie nichts an (CLAUDE.md).
 */
export async function sendeM2a(an: string, d: M2aDaten): Promise<string | null> {
  const frist = kurzesDatum(d.frist);
  const rahmen: Rahmen = {
    eyebrow: `Vorgang ${d.vorgang}`,
    titel: "Deine Größe fehlt noch",
    vorschau: `${d.mannschaft}: ${d.arten} bitte bis ${frist} eintragen.`,
    bloecke: [
      {
        art: "absatz",
        text: `${anrede(d.vorname)} für ${d.mannschaft} ${
          d.nurGroessen
            ? "sammeln wir gerade die aktuellen Größen ein"
            : "wird neue Ausstattung angefragt"
        }. Dafür fehlt noch deine Größe: ${d.arten}.`,
      },
      {
        art: "absatz",
        text: `Bitte trag sie bis ${frist} ein. Das dauert eine Minute.`,
      },
      { art: "knopf", text: "Größe eintragen", href: d.groessenLink },
      {
        art: "absatz",
        text: d.nurGroessen
          ? "Mit dieser Angabe wird nichts bestellt – sie sorgt nur dafür, dass die Größe beim nächsten Mal stimmt."
          : "Beflockte Sachen können nicht umgetauscht werden. Im Zweifel lieber eine Nummer größer.",
      },
      {
        art: "absatz",
        text: "Der Link gilt nur für dich. Bitte gib ihn nicht weiter – wer ihn hat, kann deine Größe ändern.",
      },
    ],
  };

  return sendeMail({
    an,
    betreff: `${d.mannschaft}: Größe bitte bis ${frist} eintragen`,
    text: alsText(rahmen),
    html: alsHtml(rahmen),
  });
}

export type M3Daten = {
  vorgang: string;
  /** Leer, wenn am Kontakt kein Vorname steht. */
  vorname: string;
  mannschaft: string;
  /** Wie viele Personen am Vorgang hängen. */
  gesamt: number;
  /** Wie viele davon noch keine Größe haben. */
  offen: number;
  /** Ausgelöst, weil die Frist erreicht ist – sonst: alle sind da. */
  wegenFrist: boolean;
  frist: string;
  /** Der Vorgang bestellt nichts, er sammelt nur Größen ein. */
  nurGroessen: boolean;
  bestaetigenLink: string;
  statusLink: string;
};

/**
 * M3 · die Größenliste ist so weit (docs/mails.md).
 *
 * Ohne sie endete die Kette im Stillen: der Trainer musste von sich aus auf
 * seiner Statusseite nachsehen, ob alle eingetragen haben. Diese Mail sagt es
 * ihm — entweder weil alle da sind oder weil die Frist erreicht ist.
 *
 * **Sie trägt keine Tabelle.** Der Entwurf in docs/mails.md sah eine Liste mit
 * Namen, Größen und Rückennummern vor. Das ist dieselbe Falle wie der Text für
 * die Elterngruppe in M1: eine Mail wird weitergeleitet, ausgedruckt und
 * liegengelassen, und dann liegen die Maße einer ganzen Jugendmannschaft
 * irgendwo. Die Liste steht hinter dem signierten Link, wo sie hingehört —
 * hier stehen nur Zahlen.
 */
export async function sendeM3(an: string, d: M3Daten): Promise<string | null> {
  const frist = kurzesDatum(d.frist);
  const fehlt = d.offen === 1 ? "eine Größe" : `${d.offen} Größen`;

  const rahmen: Rahmen = {
    eyebrow: `Vorgang ${d.vorgang}`,
    titel: d.wegenFrist ? "Die Frist ist erreicht" : "Alle Größen sind da",
    vorschau: d.wegenFrist
      ? `${d.mannschaft}: ${fehlt} fehlen noch. Bitte prüf die Liste.`
      : `${d.mannschaft}: alle ${d.gesamt} haben eingetragen. Bitte prüf die Liste.`,
    bloecke: [
      {
        art: "absatz",
        text: d.wegenFrist
          ? `${anrede(d.vorname)} für ${d.mannschaft} war der ${frist} die Frist. ${d.offen === 0 ? "Alle haben eingetragen." : `${fehlt} fehlen noch.`}`
          : `${anrede(d.vorname)} für ${d.mannschaft} haben alle ${d.gesamt} ihre Größe eingetragen.`,
      },
      { art: "titel", text: "Was jetzt zu tun ist" },
      {
        art: "schritte",
        punkte: [
          "Öffne die Liste und sieh sie durch.",
          ...(d.offen > 0
            ? [
                "Wer keine Größe hat, ist markiert. Du kannst sie dort selbst eintragen oder die Person für diese Runde herausnehmen.",
              ]
            : []),
          ...(d.nurGroessen
            ? ["Stimmt alles, bestätigst du die Liste. Damit ist der Vorgang fertig – bestellt wird nichts."]
            : [
                "Stimmt alles, bestätigst du die Liste. Erst danach geht die Anfrage an Intersport Uelzen und 11teamsports.",
              ]),
        ],
      },
      { art: "knopf", text: "Liste prüfen und bestätigen", href: d.bestaetigenLink },
      {
        art: "absatz",
        text: "Die Namen und Größen stehen nur hinter diesem Link, nicht in dieser Mail.",
      },
      { art: "links", zeilen: [{ name: "Deine Statusseite", href: d.statusLink }] },
    ],
  };

  return sendeMail({
    an,
    betreff: `${d.vorgang} · Größenliste ${d.mannschaft} bitte prüfen`,
    text: alsText(rahmen),
    html: alsHtml(rahmen),
  });
}

export type M2Daten = M2aDaten & {
  /** Tage bis zur Frist. 0 heißt „heute läuft sie ab“. */
  tageBisFrist: number;
  /** Die wievielte Erinnerung: 1 oder 2. Die zweite ist die letzte. */
  nummer: 1 | 2;
};

/**
 * M2 · die Erinnerung (docs/mails.md).
 *
 * Es gibt höchstens zwei, mit mindestens drei Tagen Abstand, und nie nach der
 * Frist — die Regeln stehen in `erinnerung.ts`, nicht hier. Diese Funktion
 * schreibt nur den Text.
 *
 * Sie sagt bei der zweiten ausdrücklich, dass es die letzte ist. Wer nicht
 * weiß, ob noch etwas nachkommt, legt die Mail weg; wer weiß, dass es die
 * letzte ist, macht es jetzt. Danach trägt der Trainer die Größe selbst ein —
 * auch das steht in der Mail, damit niemand glaubt, er habe etwas verpasst.
 *
 * Wie M2a: kein Nachname und kein fremder Name. Die Mail erreicht Eltern.
 */
export async function sendeM2(an: string, d: M2Daten): Promise<string | null> {
  const frist = kurzesDatum(d.frist);
  const letzte = d.nummer === 2;

  const wann =
    d.tageBisFrist <= 0
      ? "Heute ist der letzte Tag."
      : d.tageBisFrist === 1
        ? "Morgen ist der letzte Tag."
        : `Noch ${d.tageBisFrist} Tage.`;

  const rahmen: Rahmen = {
    eyebrow: `Vorgang ${d.vorgang}`,
    titel: letzte ? "Letzte Erinnerung an deine Größe" : "Deine Größe fehlt noch",
    vorschau: `${d.mannschaft}: ${d.arten} bitte bis ${frist} eintragen. ${wann}`,
    bloecke: [
      {
        art: "absatz",
        text: `${anrede(d.vorname)} für ${d.mannschaft} fehlt noch deine Größe: ${d.arten}.`,
      },
      {
        // Datum UND Restzeit. „Noch 10 Tage“ allein rechnet falsch, sobald die
        // Mail zwei Tage liegenbleibt; ein Datum allein sagt nicht, wie eilig
        // es ist.
        art: "absatz",
        text: `Bitte trag sie bis ${frist} ein. ${wann} Das dauert eine Minute.`,
      },
      { art: "knopf", text: "Größe jetzt eintragen", href: d.groessenLink },
      {
        art: "absatz",
        text: letzte
          ? "Das ist die letzte Erinnerung. Kommt bis zur Frist nichts, trägt deine Trainerin oder dein Trainer die Größe nach bestem Wissen ein."
          : d.nurGroessen
            ? "Mit dieser Angabe wird nichts bestellt – sie sorgt nur dafür, dass die Größe beim nächsten Mal stimmt."
            : "Beflockte Sachen können nicht umgetauscht werden. Im Zweifel lieber eine Nummer größer.",
      },
      {
        art: "absatz",
        text: "Hast du sie schon eingetragen? Dann ist diese Mail unterwegs gewesen, bevor es ankam – dann ist alles gut.",
      },
      {
        art: "absatz",
        text: "Der Link gilt nur für dich. Bitte gib ihn nicht weiter – wer ihn hat, kann deine Größe ändern.",
      },
    ],
  };

  return sendeMail({
    an,
    betreff: letzte
      ? `Letzte Erinnerung: Größe für ${d.mannschaft} bis ${frist}`
      : `Erinnerung: Größe für ${d.mannschaft} bis ${frist}`,
    text: alsText(rahmen),
    html: alsHtml(rahmen),
  });
}

export type M4Daten = {
  vorgang: string;
  /** „Sehr geehrter Herr Bormann“ oder die neutrale Anrede. */
  anrede: string;
  mannschaft: string;
  /** Die Summen in Worten: „12× adidas Trainingsjacke · Größe M“. */
  summen: { name: string; detail: string }[];
  gesamtStueck: number;
  beflockung: string[];
  wunschtermin: string;
  lieferadresse: string;
  hinweisHaendler: string;
  /** Die Angebote gehen in Kopie an den Trainer. */
  trainerEmail: string;
  antwortAn: string;
  csv: string;
  /** Vereinswappen in den Kopf (Migration 005, Haken in F1). */
  wappen?: boolean;
  /**
   * Das Sponsorlogo als Anhang. Kein Inline-Bild: der Haendler braucht die
   * Datei zum Drucken, nicht als Zierde in der Mail.
   */
  sponsorLogo?: { bytes: Uint8Array; typ: string; dateiname: string };
};

/**
 * M4 · die Angebotsanfrage an einen Händler (docs/mails.md).
 *
 * Die einzige Mail, die das Haus verlässt, und die einzige, die niemand
 * zurückholt. Zwei Dinge unterscheiden sie deshalb von allen anderen:
 *
 * 1. **Sie trägt keinen einzigen Spielernamen.** Kais Auflage bei der
 *    Freigabe. Der Anhang zählt Stück, Größe, Rückennummer und Initialen —
 *    alles, was ein Händler zum Kalkulieren und Beflocken braucht, und nichts
 *    darüber hinaus (`anfrage.ts`).
 * 2. **Sie siezt.** Trainer, Eltern und Spieler per du, Händler per Sie
 *    (CLAUDE.md).
 *
 * Antworten sollen zum Verein gehen, nicht an die Absenderadresse der
 * Anwendung — deshalb ein eigenes Reply-To.
 */
export async function sendeM4(an: string, d: M4Daten): Promise<string | null> {
  // Erst nachsehen, ob wirklich eine Datei da ist, dann den Kopf darauf
  // verweisen lassen. Andersherum stünde bei angehaktem Wappen und fehlender
  // Datei ein kaputtes Bildsymbol in der Mail an den Händler.
  const wappen = d.wappen ? await wappenAnhang() : null;

  const rahmen: Rahmen = {
    wappen: wappen !== null,
    eyebrow: `Anfrage ${d.vorgang}`,
    titel: `Angebotsanfrage ${d.mannschaft}`,
    vorschau: `${d.gesamtStueck} Stück, Eintracht Munster 2020 e.V.`,
    bloecke: [
      {
        art: "absatz",
        text: `${d.anrede},`,
      },
      {
        art: "absatz",
        text: `für unsere Mannschaft ${d.mannschaft} bitten wir um ein Angebot über die folgenden Artikel. Die vollständige Aufstellung mit Größen${d.summen.length > 0 ? ", Rückennummern" : ""} und Beflockung liegt als Tabelle bei.`,
      },
      { art: "titel", text: `Was angefragt wird (${d.gesamtStueck} Stück)` },
      { art: "artikel", zeilen: d.summen },
      { art: "titel", text: "Bitte im Angebot angeben" },
      {
        art: "schritte",
        punkte: [
          "Preis je Position, einschließlich Beflockung durch Sie",
          "Gültigkeit des Angebots",
          "Lieferzeit ab Bestellung",
          `Die Vorgangsnummer ${d.vorgang} im Betreff oder auf dem Angebot`,
        ],
      },
      { art: "titel", text: "Beflockung" },
      { art: "schritte", punkte: d.beflockung },
      {
        art: "absatz",
        text: "Wenn Sie davon abweichen würden oder etwas nicht passt, geben Sie es bitte im Angebot an.",
      },
      { art: "titel", text: "Liefern" },
      {
        art: "absatz",
        text: `Wunschtermin: ${d.wunschtermin || "nach Absprache"}. Lieferadresse: ${d.lieferadresse || "nach Absprache"}.`,
      },
      ...(d.hinweisHaendler
        ? ([{ art: "absatz", text: d.hinweisHaendler }] as Rahmen["bloecke"])
        : ([] as Rahmen["bloecke"])),
      {
        art: "hinweis",
        text: `Bitte schicken Sie das Angebot als PDF an ${d.antwortAn}${d.trainerEmail ? ` und in Kopie an ${d.trainerEmail}` : ""}. Dieselbe Anfrage geht an einen zweiten Händler.`,
      },
      ...(d.sponsorLogo
        ? ([
            { art: "titel", text: "Sponsorlogo" },
            {
              art: "absatz",
              // Bewusst ohne Druckangaben: Groesse und Platzierung des
              // Sponsoraufdrucks sind mit den Haendlern nicht abgestimmt, und
              // erfundene Masse in einer Anfrage sind teurer als eine Rueckfrage.
              text: `Die Druckdatei „${d.sponsorLogo.dateiname}" liegt bei. Bitte geben Sie im Angebot an, ob das Format für Ihren Druck taugt und welche Maße Sie empfehlen.`,
            },
          ] as Rahmen["bloecke"])
        : ([] as Rahmen["bloecke"])),
      {
        art: "absatz",
        text: "In der Tabelle stehen keine Namen. Wer welches Stück bekommt, ordnet der Verein bei der Ausgabe zu.",
      },
    ],
  };

  return sendeMail({
    an,
    betreff: `Angebotsanfrage ${d.vorgang} · Eintracht Munster · ${d.mannschaft}`,
    text: alsText(rahmen),
    html: alsHtml(rahmen),
    antwortAn: d.antwortAn,
    anhaenge: [
      { art: "text", dateiname: `${d.vorgang}_Anfrage.csv`, inhalt: d.csv },
      ...(wappen ? [wappen] : []),
      ...(d.sponsorLogo
        ? ([
            {
              art: "binaer",
              dateiname: d.sponsorLogo.dateiname,
              bytes: d.sponsorLogo.bytes,
              typ: d.sponsorLogo.typ,
              // Kein `inlineId`: das Logo soll als Datei ankommen, nicht im
              // Fliesstext verschwinden.
            },
          ] as Anhang[])
        : []),
    ],
  });
}

export type M5Daten = {
  vorgang: string;
  vorname: string;
  mannschaft: string;
  haendler: string[];
  statusLink: string;
};

/** M5 · „die Anfrage ist raus“ an den Trainer (docs/mails.md). */
export async function sendeM5(an: string, d: M5Daten): Promise<string | null> {
  const wohin =
    d.haendler.length === 1
      ? d.haendler[0]
      : `${d.haendler.slice(0, -1).join(", ")} und ${d.haendler[d.haendler.length - 1]}`;

  const rahmen: Rahmen = {
    eyebrow: `Vorgang ${d.vorgang}`,
    titel: "Die Anfrage ist raus",
    vorschau: `${d.mannschaft}: Angebote angefragt bei ${wohin}.`,
    bloecke: [
      {
        art: "absatz",
        text: `${anrede(d.vorname)} die Anfrage für ${d.mannschaft} ist heute an ${wohin} gegangen. Die Angebote kommen in Kopie an dich.`,
      },
      {
        art: "absatz",
        text: "Sind beide da, wählt die Spartenleitung aus, und du bekommst den Betrag und das Sponsorpaket.",
      },
      {
        art: "hinweis",
        text: "Bis dahin muss nichts bezahlt und nichts bestellt werden. Bestellt wird erst, wenn das Geld da ist.",
      },
      {
        art: "absatz",
        text: "In der Anfrage stehen keine Namen deiner Spielerinnen und Spieler – nur Stückzahlen, Größen und Nummern.",
      },
      { art: "links", zeilen: [{ name: "Deine Statusseite", href: d.statusLink }] },
    ],
  };

  return sendeMail({
    an,
    betreff: `${d.vorgang} · Anfrage an die Händler verschickt`,
    text: alsText(rahmen),
    html: alsHtml(rahmen),
  });
}

export type M4bDaten = {
  vorgang: string;
  mannschaft: string;
  grund: string;
  listeLink: string;
};

/**
 * M4b · die Spartenleitung hat die Anfrage nicht freigegeben (docs/mails.md).
 *
 * Ohne diese Mail steht der Trainer vor einer bestätigten Liste, bei der nichts
 * passiert — und das sieht aus wie ein Fehler in kitflow, nicht wie eine
 * Entscheidung. Der Grund steht deshalb wörtlich drin und nicht in Andeutungen.
 *
 * Kein „leider“ und keine Entschuldigung: es ist eine normale Rückfrage im
 * Verein, keine Absage.
 */
export async function sendeM4b(an: string, d: M4bDaten): Promise<string | null> {
  const rahmen: Rahmen = {
    eyebrow: `Vorgang ${d.vorgang}`,
    titel: "Die Anfrage geht so noch nicht raus",
    vorschau: `${d.mannschaft}: die Spartenleitung hat eine Rückfrage.`,
    bloecke: [
      {
        art: "absatz",
        text: `Die Spartenleitung hat die Händleranfrage für ${d.mannschaft} noch nicht freigegeben. Der Grund:`,
      },
      { art: "hinweis", text: d.grund },
      {
        art: "absatz",
        text: "Du kannst die Liste ändern und sie danach noch einmal bestätigen. Dann geht sie erneut zur Freigabe.",
      },
      ...(d.listeLink
        ? [{ art: "links" as const, zeilen: [{ name: "Zur Liste", href: d.listeLink }] }]
        : []),
    ],
  };

  return sendeMail({
    an,
    betreff: `${d.vorgang} · Rückfrage zur Händleranfrage`,
    text: alsText(rahmen),
    html: alsHtml(rahmen),
  });
}
