import { expect, test } from "@playwright/test";

/**
 * F1 · Bedarf melden — die drei Umschalter.
 *
 * Was das Formular zeigt, entscheidet sich im Browser: `modus`, `fuerEine` und
 * `art` sind React-Zustand. Ein Test ohne Browser könnte hier nur die Funktion
 * dahinter prüfen, nicht das, was der Trainer sieht.
 *
 * Abgeschickt wird nichts. Das Formular legt in HubSpot und in der Datenbank
 * an; dieser Lauf hat beides nicht (`playwright.config.ts`).
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/neu");
  await expect(page.getByRole("heading", { name: "Bedarf melden" })).toBeVisible();
});

const KOMPLETT = "Komplett melden";
const RICHTANGEBOT = "Erst ein Richtangebot";
const EINE_PERSON = "Eine einzelne Person";
const NUR_GROESSEN = "Nur Größen erfassen";

test("Für wen: Mannschaft oder eine einzelne Person, nie beides", async ({ page }) => {
  await page.getByRole("button", { name: KOMPLETT }).click();

  // Der Regelfall: die Jahrgänge und Mannschaften zum Anhaken.
  await expect(page.getByRole("checkbox", { name: "Ü40 Team 3", exact: true })).toBeVisible();
  await expect(page.getByLabel("E-Mail-Adresse der Person")).toHaveCount(0);

  await page.getByRole("button", { name: EINE_PERSON }).click();

  await expect(page.getByLabel("E-Mail-Adresse der Person")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Ü40 Team 3", exact: true })).toHaveCount(0);
});

test("In der Voranfrage gibt es weder eine einzelne Person noch einen Größencheck", async ({
  page,
}) => {
  // Voreingestellt ist die Voranfrage. Für eine Person gibt es nichts zu
  // schätzen, und ein Größencheck holt kein Richtangebot.
  await expect(page.getByRole("button", { name: RICHTANGEBOT })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: EINE_PERSON })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: NUR_GROESSEN })).toHaveCount(0);

  // Gegenprobe: im Komplettweg sind beide da.
  await page.getByRole("button", { name: KOMPLETT }).click();
  await expect(page.getByRole("button", { name: EINE_PERSON })).toBeVisible();
  await expect(page.getByRole("radio", { name: NUR_GROESSEN })).toBeVisible();
});

test("Nur Größen erfassen: keine Artikel, dafür die Größenarten", async ({ page }) => {
  await page.getByRole("button", { name: KOMPLETT }).click();

  // Gegenprobe zuerst: der normale Weg fragt Artikel und keine Größenarten.
  await page.getByRole("radio", { name: "Weitere Ausstattung" }).check();
  await expect(page.getByRole("heading", { name: "Artikel", exact: true })).toBeVisible();
  await expect(page.getByLabel("Artikelbezeichnung")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Welche Größen?" })).toHaveCount(0);

  await page.getByRole("radio", { name: NUR_GROESSEN }).check();

  await expect(page.getByRole("heading", { name: "Welche Größen?" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Trainingshose" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Artikel", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Artikelbezeichnung")).toHaveCount(0);

  // Ein Größencheck bestellt nichts: keine Lieferadresse, keine Zahlungsregel.
  await expect(page.getByLabel("Lieferadresse")).toHaveCount(0);
});
