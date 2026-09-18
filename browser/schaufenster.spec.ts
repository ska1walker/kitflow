import { expect, test } from "@playwright/test";

/**
 * Das Schaufenster unter `/` — die einzige Seite mit Beispieldaten.
 *
 * Seit `schaufenster.tsx` steht der Rollenumschalter nur noch hier und nicht
 * mehr in der Komponente, die auch echte Vorgänge rendert. Diese Prüfung hält
 * fest, dass er hier weiter tut, was er soll.
 *
 * Beim ersten Versuch von Hand hatte ich nur die ersten 400 Zeichen der Seite
 * verglichen — die ändern sich beim Rollenwechsel nicht, und der Umschalter
 * sah kaputt aus, obwohl er lief. Deshalb wird hier auf Text geprüft, der
 * wirklich zur Rolle gehört.
 */

const TRAINER_TEXT = "18 Personen · Sponsor VGH · Händler Intersport Uelzen und 11teamsports";
const SPIELER_TEXT = "Hallo Spieler 7, hier siehst du, wo deine neue Ausstattung gerade steckt.";
const SPARTE_TITEL = "Alle Ausstattungs-Vorgänge";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("group", { name: "Ansicht" })).toBeVisible();
});

test("Die Rolle wechselt, was auf der Seite steht", async ({ page }) => {
  await page.getByRole("button", { name: "Trainer", exact: true }).click();
  await expect(page.getByText(TRAINER_TEXT)).toBeVisible();
  await expect(page.getByText(SPIELER_TEXT)).toHaveCount(0);

  await page.getByRole("button", { name: "Spieler", exact: true }).click();
  await expect(page.getByText(SPIELER_TEXT)).toBeVisible();
  await expect(page.getByText(TRAINER_TEXT)).toHaveCount(0);

  await page.getByRole("button", { name: "Spartenleitung" }).click();
  await expect(page.getByRole("heading", { name: SPARTE_TITEL })).toBeVisible();
  // Die Übersicht zeigt alle Vorgänge nebeneinander; einen Stand
  // durchzuklicken ergibt dort keinen Sinn.
  await expect(page.getByLabel("Stand des Vorgangs")).toHaveCount(0);
});

test("Der Stand wechselt, was als Nächstes ansteht", async ({ page }) => {
  await page.getByRole("button", { name: "Trainer", exact: true }).click();

  // Als Überschrift, nicht als Text: „Größen werden gesammelt“ steht auch in
  // der Auswahlliste selbst, und die ändert sich nie.
  const ueberschrift = (titel: string) => page.getByRole("heading", { name: titel, exact: true });

  await page.getByLabel("Stand des Vorgangs").selectOption("1");
  await expect(ueberschrift("Größen werden gesammelt")).toBeVisible();

  await page.getByLabel("Stand des Vorgangs").selectOption("6");
  await expect(ueberschrift("Größen werden gesammelt")).toHaveCount(0);
  await expect(ueberschrift("Bestellt")).toBeVisible();
});

test("Das Schaufenster sagt, dass es eines ist", async ({ page }) => {
  // Ohne diesen Hinweis sieht die Seite aus wie ein echter Vorgang mit echten
  // Namen. Sie hat keinen, aber das muss draufstehen.
  await expect(page.getByText("Beispieldaten").first()).toBeVisible();
});
