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
  /** Nur im vollständigen Modus: Frist und die Links für die Mannschaft. */
  groessenFrist?: string;
  personen?: { name: string; groessen: string }[];
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
  const frist = d.groessenFrist ?? "zur Frist";

  return {
    betreff: `${d.vorgang} · Größenabfrage für ${d.mannschaft} läuft`,
    rahmen: {
      eyebrow: `Vorgang ${d.vorgang}`,
      titel: "Die Größenabfrage läuft",
      vorschau: `${d.mannschaft}: Größen bitte bis ${frist} eintragen.`,
      bloecke: [
        { art: "absatz", text: `${anrede(d.vorname)} deine Angaben sind vollständig. Bitte gib die Nummer ${d.vorgang} bei allen Rückfragen an.` },
        { art: "titel", text: "Was angefragt wird" },
        { art: "artikel", zeilen: d.artikel },
        { art: "titel", text: "So geht es weiter" },
        {
          art: "schritte",
          punkte: [
            "Schick den Text unten in die Elterngruppe, die persönlichen Links stehen schon drin.",
            `Größen bitte bis ${frist} eintragen.`,
            "Wenn alle eingetragen haben, prüfst du die Liste. Erst nach deiner Bestätigung geht die Anfrage an Intersport Uelzen und 11teamsports.",
            "Die Angebote kommen in Kopie an dich.",
          ],
        },
        { art: "knopf", text: "Liste prüfen und bestätigen", href: d.bestaetigenLink ?? d.statusLink },
        { art: "titel", text: "Text für die Elterngruppe" },
        {
          art: "zitat",
          zeilen: [
            "Hallo zusammen,",
            `für ${d.mannschaft} wird neue Ausstattung angefragt: ${d.artikel.map((a) => a.name).join(", ")}.`,
            `Bitte tragt bis ${frist} über den persönlichen Link die aktuelle Größe eures Kindes ein. Das dauert eine Minute. Beflockte Sachen können nicht umgetauscht werden, im Zweifel lieber eine Nummer größer.`,
            "",
            ...(d.personen ?? []).map((p) => `${p.name}: ${p.groessen}`),
            "",
            "Danke!",
            d.vorname.trim() || "Euer Trainer",
          ],
        },
        { art: "links", zeilen: [{ name: "Deine Statusseite", href: d.statusLink }] },
        { art: "titel", text: "Wichtig zur Bezahlung" },
        { art: "absatz", text: ZAHLUNG },
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
