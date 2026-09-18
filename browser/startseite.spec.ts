import { expect, test } from "@playwright/test";

/**
 * Die Startseite — die einzige Seite ohne Link und ohne Token.
 *
 * Hier stand das Schaufenster: ein Beispiel-Vorgang zum Durchklicken. Die
 * Spielernamen darin waren erfunden, die beiden Händler mit ihren
 * Ansprechpartnern, die Artikelnummern aus einer echten Anfrage und der
 * Sponsor waren es nicht. Von außen war das nicht zu unterscheiden.
 *
 * Diese Prüfungen halten fest, dass dort nichts Echtes zurückkommt. Sie sind
 * bewusst als Liste von Zeichenketten geschrieben: wer das Schaufenster
 * versehentlich wieder anstellt, wird hier rot.
 */

/** Was auf einer Seite ohne Token nie stehen darf. */
const NIE = [
  // Geschäftspartner mit Namen, samt der Angabe, wer den Zuschlag bekam
  "11teamsports",
  "Intersport Uelzen",
  "Michael Hillebrecht",
  "Jens Bormann",
  // Artikel- und Bestellnummern aus einer echten Anfrage
  "Hummel hmlCORE",
  "211943",
  "102.053.402.247",
  "IN0410",
  // der Sponsor und der Beispiel-Kader
  "VGH",
  "Spieler 7",
  "Beispieldaten",
];

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("sagt, was kitflow ist, und führt weiter", async ({ page }) => {
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ausstattung für");
  await expect(page.getByRole("link", { name: "Bedarf melden" })).toHaveAttribute("href", "/neu");
});

test("trägt nichts Echtes", async ({ page }) => {
  const seite = await page.content();
  for (const wort of NIE) expect(seite, `„${wort}“ steht auf der offenen Startseite`).not.toContain(wort);
});

test("hat keinen Rollenumschalter und keinen Stand zum Durchklicken", async ({ page }) => {
  await expect(page.getByRole("group", { name: "Ansicht" })).toHaveCount(0);
  await expect(page.getByLabel("Stand des Vorgangs")).toHaveCount(0);
});

test("sagt Spielern, dass sie hier nichts eintragen", async ({ page }) => {
  // Wer den Link aus der Mail nicht mehr findet, landet erfahrungsgemäß hier.
  await expect(page.getByText(/persönlichen Link per E-Mail/)).toBeVisible();
});
