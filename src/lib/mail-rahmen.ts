import "server-only";

/**
 * Der Rahmen für alle Mails (docs/design-coachbase.md).
 *
 * Eine Mail wird als Liste von Blöcken beschrieben, nicht als HTML. Daraus
 * entstehen beide Fassungen: die gestaltete und die reine Textfassung. So
 * können sie nicht auseinanderlaufen – jede Änderung trifft immer beide.
 *
 * In Mailprogrammen gilt HTML von vor zwanzig Jahren: Tabellen statt Flexbox,
 * Stile direkt am Element, keine eigene Schriftart. Die Tokens stimmen
 * trotzdem mit dem Web-Auftritt überein, sie stehen hier nur als Hex-Werte,
 * weil eine Mail kein Stylesheet laden kann.
 */

const INK_950 = "#09090b";
const INK_900 = "#18181b";
const INK_800 = "#27272a";
const INK_600 = "#52525b";
const INK_400 = "#a1a1aa";
const INK_300 = "#d4d4d8";
const INK_200 = "#e4e4e7";
const INK_50 = "#fafafa";
const PITCH_400 = "#a78bfa";
const PITCH_600 = "#7c3aed";
const PITCH_50 = "#f5f3ff";
// Nicht aus dem Token-Satz, sondern pitch-950 aus docs/design-coachbase.md:
// im Dunkelmodus braucht der Hinweiskasten einen Grund, der dunkel genug ist.
const PITCH_950 = "#2e1065";
const SIGNAL_400 = "#c6ff1a";
const WEISS = "#ffffff";

const SCHRIFT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

export type Block =
  | { art: "absatz"; text: string }
  | { art: "titel"; text: string }
  | { art: "schritte"; punkte: string[] }
  | { art: "artikel"; zeilen: { name: string; detail: string }[] }
  | { art: "knopf"; text: string; href: string }
  | { art: "links"; zeilen: { name: string; href: string }[] }
  | { art: "hinweis"; text: string }
  | { art: "zitat"; zeilen: string[] };

/** Fremder Text darf kein Markup werden: Artikelnamen kommen aus dem Formular. */
function esc(wert: string): string {
  return wert
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function blockHtml(block: Block): string {
  switch (block.art) {
    case "absatz":
      return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK_600};" class="weich">${esc(block.text)}</p>`;

    case "titel":
      return `<h2 style="margin:26px 0 10px;font-size:17px;line-height:1.3;font-weight:700;letter-spacing:-0.01em;color:${INK_900};" class="stark">${esc(block.text)}</h2>`;

    case "schritte":
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 14px;">${block.punkte
        .map(
          (p, i) =>
            `<tr>
               <td valign="top" width="26" style="padding:3px 0;font-family:${MONO};font-size:12px;color:${PITCH_600};" class="akzent">${i + 1}.</td>
               <td valign="top" style="padding:3px 0;font-size:15px;line-height:1.6;color:${INK_600};" class="weich">${esc(p)}</td>
             </tr>`,
        )
        .join("")}</table>`;

    case "artikel":
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px;border:1px solid ${INK_200};border-radius:12px;border-collapse:separate;overflow:hidden;" class="linie">${block.zeilen
        .map(
          (z, i) =>
            `<tr>
               <td style="padding:11px 14px;font-size:14px;line-height:1.45;color:${INK_900};${i > 0 ? `border-top:1px solid ${INK_200};` : ""}" class="stark linie">
                 <b style="font-weight:600;">${esc(z.name)}</b>
                 <span style="display:block;font-size:12px;color:${INK_400};" class="leise">${esc(z.detail)}</span>
               </td>
             </tr>`,
        )
        .join("")}</table>`;

    case "knopf":
      // Ein Knopf in einer Tabelle: nur so faerbt Outlook die Flaeche mit.
      // Der VML-Block davor ist fuer Outlook unter Windows -- dort rendert die
      // Word-Engine, die weder border-radius noch padding an einem <a> kennt.
      // Ohne ihn ist der Knopf dort ein blauer Textlink zwischen zwei Absaetzen.
      return `<div style="margin:4px 0 20px;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(block.href)}" style="height:46px;v-text-anchor:middle;width:280px;" arcsize="26%" stroke="f" fillcolor="${INK_950}">
          <w:anchorlock/>
          <center style="color:${WEISS};font-family:Arial,sans-serif;font-size:15px;font-weight:600;">${esc(block.text)}</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td bgcolor="${INK_950}" style="border-radius:12px;" class="knopf-feld">
            <a href="${esc(block.href)}" style="display:inline-block;padding:13px 22px;font-family:${SCHRIFT};font-size:15px;font-weight:600;color:${WEISS};text-decoration:none;" class="knopf-text">${esc(block.text)}</a>
          </td></tr>
        </table>
        <!--<![endif]-->
      </div>`;

    case "links":
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px;">${block.zeilen
        .map(
          (z) =>
            `<tr><td style="padding:5px 0;font-size:14px;line-height:1.4;">
               <span style="color:${INK_900};" class="stark">${esc(z.name)}</span><br>
               <a href="${esc(z.href)}" style="font-family:${MONO};font-size:12px;color:${PITCH_600};word-break:break-all;" class="akzent">${esc(z.href)}</a>
             </td></tr>`,
        )
        .join("")}</table>`;

    case "hinweis":
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:6px 0 18px;">
          <tr><td bgcolor="${PITCH_50}" style="padding:14px 16px;border-radius:12px;font-size:14px;line-height:1.55;color:${INK_600};" class="kasten weich">${esc(block.text)}</td></tr>
        </table>`;

    case "zitat":
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:6px 0 18px;">
          <tr><td bgcolor="${INK_50}" style="padding:16px;border-radius:12px;border:1px dashed ${INK_200};font-size:14px;line-height:1.6;color:${INK_900};" class="zitat-feld stark">${block.zeilen
            .map((z) => (z ? esc(z) : "&nbsp;"))
            .join("<br>")}</td></tr>
        </table>`;
  }
}

function blockText(block: Block): string {
  switch (block.art) {
    case "absatz":
      return block.text;
    case "titel":
      return block.text;
    case "schritte":
      return block.punkte.map((p, i) => `${i + 1}. ${p}`).join("\n");
    case "artikel":
      return block.zeilen.map((z) => `- ${z.name} (${z.detail})`).join("\n");
    case "knopf":
      return `${block.text}:\n${block.href}`;
    case "links":
      return block.zeilen.map((z) => `${z.name}\n${z.href}`).join("\n\n");
    case "hinweis":
      return block.text;
    case "zitat":
      return ["---", ...block.zeilen, "---"].join("\n");
  }
}

export type Rahmen = {
  /** Die Zeile über der Überschrift, etwa die Vorgangsnummer. */
  eyebrow: string;
  titel: string;
  bloecke: Block[];
  /** Die Zeile, die manche Programme neben dem Betreff zeigen. */
  vorschau: string;
};

export function alsText(r: Rahmen): string {
  return [
    r.titel,
    "",
    ...r.bloecke.map(blockText),
    "",
    "Sportliche Grüße",
    "Kai Böhm",
    "Spartenleiter Fußball · Eintracht Munster",
  ].join("\n\n");
}

/**
 * Der Kopf.
 *
 * **Der Verein steht oben, kitflow klein darunter** (Kais Ansage, 18.09.2026).
 * Vorher war es umgekehrt: „kitflow“ groß in Neon, „Eintracht Munster“ klein
 * daneben. Bei einer Mail an einen Händler ist das verkehrt herum — der kennt
 * kitflow nicht und soll den Verein sehen, nicht das Werkzeug.
 *
 * **Der Platz für das Wappen ist vorbereitet, aber leer.** Kommt es, wird es
 * als Anhang mit Content-ID eingebunden (`cid:wappen`) und nicht als externe
 * Adresse: Outlook und Gmail blockieren fremde Bilder standardmäßig, und ein
 * blockiertes Logo hinterlässt ein leeres Loch im Kopf. Bis dahin steht dort
 * eine Wortmarke — die lädt immer.
 */
function kopf(): string {
  return `<tr><td bgcolor="${INK_950}" style="padding:20px 22px;border-radius:16px;" class="kopf-feld">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
          <td>
            <div style="font-size:20px;line-height:1.25;font-weight:800;letter-spacing:-0.025em;color:${WEISS};" class="marke">Eintracht Munster 2020 e.&nbsp;V.</div>
            <div style="margin-top:3px;font-size:12px;line-height:1.4;color:${INK_400};">Sparte Fußball</div>
          </td>
          <td align="right" valign="top" style="font-family:${MONO};font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${SIGNAL_400};" class="werkzeug">kitflow</td>
        </tr></table>
      </td></tr>`;
}

export function alsHtml(r: Rahmen): string {
  return `<!doctype html>
<html lang="de" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(r.titel)}</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<style>body,table,td,a,p,h1,h2,div{font-family:Arial,Helvetica,sans-serif !important;}</style>
<![endif]-->
<style>
  /* Outlook rechnet Zeilenhoehen anders; ohne diese Regel rutschen Absaetze. */
  td,p,h1,h2,a{mso-line-height-rule:exactly;}
  /* Dunkelmodus: ohne diese Regeln dreht Apple Mail die Farben selbst um --
     und macht aus dunklem Text auf Weiss gern hellgrauen Text auf Hellgrau. */
  @media (prefers-color-scheme: dark) {
    .seite{background:#000000 !important;}
    /* Der Kopf ist im Hellen ein schwarzes Band. Im Dunkeln waere er schwarz
       auf Schwarz und damit weg -- er braucht eine Kante. */
    .kopf-feld{background:${INK_950} !important;border:1px solid ${INK_800} !important;}
    .karte{background:${INK_900} !important;border-color:${INK_800} !important;}
    .stark{color:${INK_50} !important;}
    .weich{color:${INK_300} !important;}
    /* Bleibt INK_400: leise ist im Dunkeln schon richtig. Die Regel steht
       trotzdem da, weil das important auch die Farbumkehr mancher Programme
       schlaegt — ohne sie waere Metadaten-Grau das Einzige, was sie anfassen. */
    .leise{color:${INK_400} !important;}
    /* Violett auf Dunkel ist kaum zu lesen: pitch-600 wird pitch-400. */
    .akzent{color:${PITCH_400} !important;}
    .linie{border-color:${INK_800} !important;}
    .kasten{background:${PITCH_950} !important;}
    .zitat-feld{background:${INK_800} !important;border-color:${INK_600} !important;}
    /* Ein schwarzer Knopf auf dunkler Karte ist kein Knopf mehr. Er dreht um:
       helle Flaeche, dunkle Schrift. Das ist der wichtigste Klick der Mail. */
    .knopf-feld{background:${INK_50} !important;}
    .knopf-text{color:${INK_950} !important;}
  }
  @media (max-width:620px){
    .karte{padding:20px 18px !important;}
    .titel{font-size:22px !important;}
  }
  @media (max-width:480px){
    /* Auf Handybreite stiess „kitflow“ an den Vereinsnamen. Es faellt weg --
       im Fuss steht es ohnehin, und der Verein hat hier Vorrang. */
    .werkzeug{display:none !important;}
    .marke{font-size:17px !important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${INK_50};" class="seite">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(r.vorschau)}${"&#847;&zwnj;&nbsp;".repeat(60)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${INK_50};" class="seite">
  <tr><td align="center" style="padding:28px 14px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;font-family:${SCHRIFT};">

      ${kopf()}

      <tr><td style="height:14px;line-height:14px;">&nbsp;</td></tr>

      <tr><td bgcolor="${WEISS}" style="padding:26px 24px;border:1px solid ${INK_200};border-radius:16px;" class="karte">
        <div style="font-family:${MONO};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${PITCH_600};" class="akzent">${esc(r.eyebrow)}</div>
        <h1 style="margin:6px 0 16px;font-size:25px;line-height:1.2;font-weight:800;letter-spacing:-0.025em;color:${INK_900};" class="titel stark">${esc(r.titel)}</h1>
        ${r.bloecke.map(blockHtml).join("\n        ")}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:22px;border-top:1px solid ${INK_200};" class="linie">
          <tr><td style="padding-top:16px;font-size:14px;line-height:1.55;color:${INK_600};" class="weich">
            Sportliche Grüße<br>
            <b style="color:${INK_900};" class="stark">Kai Böhm</b><br>
            <span style="font-size:13px;color:${INK_400};" class="leise">Spartenleiter Fußball · Eintracht Munster</span>
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:16px 8px 0;font-size:12px;line-height:1.5;color:${INK_400};" class="leise">
        Eintracht Munster 2020 e.&nbsp;V. · Sparte Fußball<br>
        Verschickt über kitflow, der Ausstattungsverwaltung der Sparte.
        Antworten gehen an die Spartenleitung.
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}
