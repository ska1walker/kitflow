import { describe, expect, test } from "vitest";
import { alsHtml, alsText, type Rahmen } from "./mail-rahmen";

/**
 * Der Rahmen, den alle Mails tragen.
 *
 * Geprüft wird hier nicht, ob es hübsch ist — das sieht man. Geprüft wird, was
 * man **nicht** sieht, bis es beim Empfänger schiefgeht: die Reihenfolge von
 * Verein und Werkzeug, der Knopf in Outlook, der Dunkelmodus, und dass die
 * bedingten Kommentare den Knopf nicht bei allen anderen verstecken.
 */

function rahmen(mehr: Partial<Rahmen> = {}): Rahmen {
  return {
    eyebrow: "Vorgang AUS-2026-001",
    titel: "Die Größenabfrage läuft",
    vorschau: "Kurz gesagt: bitte Größe eintragen.",
    bloecke: [{ art: "absatz", text: "Ein ganz gewöhnlicher Absatz." }],
    ...mehr,
  };
}

describe("Der Verein steht vor dem Werkzeug", () => {
  test("„Eintracht Munster“ kommt im Kopf vor „kitflow“", () => {
    // Kais Ansage vom 18.09.2026. Vorher war es umgekehrt, und bei einer Mail
    // an einen Händler ist das verkehrt herum: der kennt kitflow nicht.
    //
    // Gemessen wird im Rumpf, nicht im ganzen Dokument: im `<style>`-Block
    // steht „kitflow“ in einem Kommentar, und der stand beim ersten Versuch
    // vor allem anderen. Der Test war damit immer rot, aus dem falschen Grund.
    const html = alsHtml(rahmen());
    const rumpf = html.slice(html.indexOf("<body"));
    expect(rumpf.indexOf("Eintracht Munster")).toBeGreaterThan(-1);
    expect(rumpf.indexOf("Eintracht Munster")).toBeLessThan(rumpf.indexOf("kitflow"));
  });

  test("der Vereinsname steht größer da als kitflow", () => {
    const html = alsHtml(rahmen());
    // `[^<]*` statt `[^"]*`: zwischen der Schriftgröße und dem Text liegt das
    // Ende des style-Attributs. Der erste Versuch hörte am Anführungszeichen
    // auf und war deshalb immer falsch.
    const verein = /font-size:20px;[^<]*>Eintracht Munster/.test(html);
    const werkzeug = /font-size:11px;[^<]*>kitflow</.test(html);
    expect(verein, "Vereinsname nicht in 20px").toBe(true);
    expect(werkzeug, "kitflow nicht in 11px").toBe(true);
  });

  test("die Textfassung grüßt weiterhin von einem Menschen", () => {
    // Eine Mail, die mit einem Vereinsnamen endet statt mit einer Person, liest
    // sich wie ein Automat. Unterschrieben wird von Kai.
    expect(alsText(rahmen())).toContain("Kai Böhm");
  });
});

describe("Der Knopf überlebt Outlook", () => {
  const mitKnopf = rahmen({
    bloecke: [{ art: "knopf", text: "Größe eintragen", href: "https://zz.example.invalid/g/1" }],
  });

  test("für Outlook liegt ein VML-Knopf bereit", () => {
    // Die Word-Engine kennt weder border-radius noch padding an einem <a>.
    // Ohne VML ist der Knopf dort ein blauer Textlink zwischen zwei Absätzen.
    const html = alsHtml(mitKnopf);
    expect(html).toContain("v:roundrect");
    expect(html).toContain("<!--[if mso]>");
  });

  test("und alle anderen bekommen trotzdem den echten Knopf", () => {
    // Der gefährliche Fehler ist ein falsch geschlossener bedingter Kommentar:
    // dann sieht NIEMAND außer Outlook den Knopf, und das fällt beim Testen in
    // Gmail nicht auf, weil man dort gar nicht erst hinschaut.
    const html = alsHtml(mitKnopf);
    const offen = html.indexOf("<!--[if !mso]><!-->");
    const zu = html.indexOf("<!--<![endif]-->");
    expect(offen).toBeGreaterThan(-1);
    expect(zu).toBeGreaterThan(offen);

    const sichtbar = html.slice(offen, zu);
    expect(sichtbar).toContain('href="https://zz.example.invalid/g/1"');
    expect(sichtbar).toContain("Größe eintragen");
  });

  test("die Adresse steht in beiden Fassungen vollständig", () => {
    expect(alsText(mitKnopf)).toContain("https://zz.example.invalid/g/1");
  });

  test("und dreht im Dunkelmodus um, statt schwarz auf schwarz zu sein", () => {
    // Mit dem Auge gefunden, nicht ausgedacht: im ersten Entwurf war der Knopf
    // auf dunkler Karte praktisch unsichtbar. Es ist der wichtigste Klick der
    // ganzen Mail.
    const html = alsHtml(mitKnopf);
    expect(html).toContain('class="knopf-feld"');
    expect(html).toContain('class="knopf-text"');
    expect(html).toContain(".knopf-feld{background:");
    expect(html).toContain(".knopf-text{color:");
  });
});

describe("Dunkelmodus", () => {
  test("die Mail sagt, dass sie beides kann", () => {
    // Ohne diese Angabe dreht Apple Mail die Farben selbst um und macht aus
    // dunklem Text auf Weiß gern hellgrauen Text auf Hellgrau.
    const html = alsHtml(rahmen());
    expect(html).toContain('name="color-scheme" content="light dark"');
    expect(html).toContain('name="supported-color-schemes"');
  });

  test("und bringt eigene Farben mit, statt sich umdrehen zu lassen", () => {
    const html = alsHtml(rahmen());
    expect(html).toContain("@media (prefers-color-scheme: dark)");
    expect(html).toContain(".karte{background:");
  });

  test("jeder Textblock trägt eine Klasse, an der der Dunkelmodus greift", () => {
    // Ein Block ohne Klasse bleibt im Dunkelmodus dunkelgrau auf Dunkelgrau.
    const html = alsHtml(
      rahmen({
        bloecke: [
          { art: "absatz", text: "Absatz" },
          { art: "titel", text: "Titel" },
          { art: "hinweis", text: "Hinweis" },
          { art: "artikel", zeilen: [{ name: "Trikot", detail: "Größe M" }] },
          { art: "zitat", zeilen: ["Zitat"] },
          { art: "schritte", punkte: ["Erstens"] },
          { art: "links", zeilen: [{ name: "Liste", href: "https://zz.example.invalid/b/1" }] },
        ],
      }),
    );
    // Sieben Bloecke, jeder mit mindestens einer Dunkelmodus-Klasse.
    for (const stueck of ["Absatz", "Titel", "Hinweis", "Trikot", "Zitat", "Erstens", "Liste"]) {
      const stelle = html.indexOf(stueck);
      expect(stelle, `„${stueck}“ fehlt ganz`).toBeGreaterThan(-1);
      // Die Klasse steht im umgebenden Element, also kurz davor.
      const umfeld = html.slice(Math.max(0, stelle - 400), stelle + 40);
      expect(/class="[^"]*(stark|weich|leise|kasten|zitat-feld|linie)/.test(umfeld),
        `„${stueck}“ hat keine Dunkelmodus-Klasse`).toBe(true);
    }
  });
});

describe("Die Vorschauzeile", () => {
  test("steht da, aber nicht sichtbar", () => {
    const html = alsHtml(rahmen({ vorschau: "Bitte Größe eintragen." }));
    expect(html).toContain("Bitte Größe eintragen.");
    expect(html).toContain("display:none");
  });

  test("ist aufgefüllt, damit kein Fließtext hinterherrutscht", () => {
    // Sonst hängt Gmail den Anfang des ersten Absatzes an die Vorschau, und in
    // der Liste steht die Zeile zweimal halb.
    const html = alsHtml(rahmen());
    expect(html).toContain("&zwnj;");
  });

  test("fremder Text in der Vorschau wird nicht zu Markup", () => {
    const html = alsHtml(rahmen({ vorschau: '<script>alert("x")</script>' }));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
