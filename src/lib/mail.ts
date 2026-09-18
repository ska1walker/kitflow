import "server-only";

import { alsHtml, alsText, type Rahmen } from "./mail-rahmen";

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

type Mail = { an: string; betreff: string; text: string; html: string };

/**
 * Verschickt eine Mail. Zurück kommt die Adresse, an die sie ging, oder `null`
 * – der Aufrufer soll daraus nie einen Abbruch machen: ein Vorgang ist auch
 * ohne Mail gültig, die Links stehen auf der Seite.
 */
export async function sendeMail({ an, betreff, text, html }: Mail): Promise<string | null> {
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
        reply_to: process.env.MAIL_ANTWORT || ANTWORT_STANDARD,
        to: [empfaenger],
        subject: betreff,
        text: umleitung && umleitung !== an ? `[Testumleitung, eigentlich an ${an}]\n\n${text}` : text,
        html:
          umleitung && umleitung !== an
            ? `<p style="font:13px sans-serif;color:#a1a1aa;">Testumleitung, eigentlich an ${an}</p>${html}`
            : html,
      }),
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
