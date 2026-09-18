import { expect, test } from "@playwright/test";

/**
 * Die Anmeldung der Spartenleitung, im laufenden Server geprüft.
 *
 * `/sparte` ist die erste Seite von kitflow, die **alle** Vorgänge zeigt — alle
 * Mannschaften, alle Fristen, alle Beträge — und sie darf die Stufe von Hand
 * setzen. Bisher hing jede Seite an einem signierten Link und zeigte genau
 * einen Vorgang.
 *
 * **Was dieser Lauf beweist und was nicht.** Er bekommt die Zugänge leer
 * übergeben (`playwright.config.ts`), es gibt also keine Supabase und keine
 * Sitzung. Bewiesen ist damit der Fall, der am meisten wehtäte: die Anmeldung
 * ist nicht eingerichtet, und `/sparte` gibt trotzdem nichts her. Eine
 * Anwendung ohne Schlüssel darf nicht offen stehen — dieselbe Regel wie bei
 * `LINK_SECRET` in `links.ts`.
 *
 * Nicht bewiesen ist der Weg mit gültiger Sitzung: ein echter Magic Link
 * braucht eine echte Supabase, und die ist aus der Bauumgebung gesperrt. Das
 * bleibt ein Durchlauf von Hand gegen Vercel (docs/anmeldung.md).
 *
 * Die Prüfung greift bewusst **nicht** in den `proxy` ein. Er läuft hier gar
 * nicht weit — ohne Zugangsdaten steigt er gleich aus. Dass `/sparte` trotzdem
 * zumacht, ist der Punkt: die echte Prüfung steht in der Seite.
 */

/**
 * Was auf einer Seite ohne Anmeldung nie stehen darf.
 *
 * „Abmelden“ steht hier aus einem Grund, der beim Gegenbeweis aufgefallen ist:
 * ohne Datenbank entstehen gar keine Vorgangsdaten, also blieben Nummern und
 * Mannschaftsnamen auch dann aus, wenn die Prüfung fehlte — die Liste war grün
 * und bewies nichts. Der Abmelden-Knopf dagegen gehört zur Hülle der
 * angemeldeten Seite und erscheint, sobald sie überhaupt gerendert wird.
 */
const NIE = [
  "Abmelden",
  "AUS-2026",
  "Ü40 Team",
  "Alle Ausstattungs-Vorgänge",
  "Stufe von Hand setzen",
  "Intersport Uelzen",
  "11teamsports",
];

test("ohne Anmeldung führt /sparte zur Anmeldung", async ({ page }) => {
  await page.goto("/sparte");

  await expect(page).toHaveURL(/\/anmelden$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Anmeldung der Spartenleitung",
  );
});

test("und gibt dabei keine Zeile aus der Übersicht her", async ({ page }) => {
  await page.goto("/sparte");

  const seite = await page.content();
  for (const wort of NIE) {
    expect(seite, `„${wort}“ steht auf einer Seite ohne Anmeldung`).not.toContain(wort);
  }
});

test("auch eine Unterseite von /sparte gibt nichts her", async ({ page }) => {
  // Der proxy-Matcher deckt `/sparte/:path*` ab; die Seite prüft ohnehin selbst.
  await page.goto("/sparte/irgendwas");

  expect(page.url()).toMatch(/\/anmelden$|\/sparte\/irgendwas$/);
  const seite = await page.content();
  expect(seite).not.toContain("Alle Ausstattungs-Vorgänge");
});

test("ohne eingerichtete Anmeldung sagt die Seite das – und zeigt kein Formular", async ({
  page,
}) => {
  // Ohne Supabase-Zugang darf hier kein Feld stehen, das eine Mail verspricht,
  // die nie ankommt.
  await page.goto("/anmelden");

  await expect(page.getByText("Die Anmeldung ist hier nicht eingerichtet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Anmeldelink schicken" })).toHaveCount(0);
});

test("die Anmeldeseite sagt Trainern, dass sie kein Konto brauchen", async ({ page }) => {
  // Sonst versucht es jemand mit seiner Adresse und wartet auf Post.
  await page.goto("/anmelden");

  await expect(page.getByText(/brauchst du kein Konto/)).toBeVisible();
});

test("der Rückweg aus der Mail ohne Token legt keine Sitzung an", async ({ page }) => {
  await page.goto("/auth/callback");

  await expect(page).toHaveURL(/\/anmelden$/);
  const kekse = await page.context().cookies();
  expect(kekse.filter((k) => k.name.startsWith("sb-"))).toEqual([]);
});

test("ein erfundenes Token kommt auch nicht durch", async ({ page }) => {
  await page.goto("/auth/callback?code=erfunden");

  await expect(page).toHaveURL(/\/anmelden$/);
  const kekse = await page.context().cookies();
  expect(kekse.filter((k) => k.name.startsWith("sb-"))).toEqual([]);
});
