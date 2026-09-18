import { expect, test } from "@playwright/test";
import { token } from "./geheimnis";

/**
 * Die Zugangsgrenze im laufenden Server.
 *
 * kitflow hat keinen Login: der signierte Link ist die einzige Grenze. Geprüft
 * ist die Signatur bisher als Funktion (`src/lib/links.test.ts`) — hier wird
 * geprüft, was der Server tatsächlich ausliefert, wenn jemand an der Adresse
 * dreht.
 *
 * Der Lauf hat keine Datenbank (`playwright.config.ts`). Das ist für diese
 * Prüfung kein Mangel, sondern der Punkt: ein abgewiesener Link darf gar nicht
 * erst so weit kommen, dass Daten nötig wären.
 */

const VORGANG = "AUS-2026-001";
const ICH = "12345";
const EIN_ANDERER = "67890";

const ABGEWIESEN = "Dieser Link funktioniert nicht";
const DURCHGELASSEN = "Gerade nicht erreichbar";

/** Ein gültiges Token mit einem geänderten letzten Zeichen. */
function verbogen(echt: string): string {
  const letztes = echt.slice(-1);
  return echt.slice(0, -1) + (letztes === "A" ? "B" : "A");
}

const SEITEN = [
  { name: "Statusseite (Trainer)", pfad: `/v/${VORGANG}`, zweck: "status", teile: [VORGANG] },
  {
    name: "Statusseite (Spieler)",
    pfad: `/v/${VORGANG}/${ICH}`,
    zweck: "status",
    teile: [VORGANG, ICH],
  },
  {
    name: "Größen (F2)",
    pfad: `/g/${VORGANG}/${ICH}`,
    zweck: "groessen",
    teile: [VORGANG, ICH],
  },
  { name: "Liste (F3)", pfad: `/b/${VORGANG}`, zweck: "bestaetigen", teile: [VORGANG] },
  {
    name: "F2 als Trainer",
    pfad: `/b/${VORGANG}/${ICH}`,
    zweck: "trainer",
    teile: [VORGANG, ICH],
  },
  { name: "Ergänzen (F1b)", pfad: `/e/${VORGANG}`, zweck: "ergaenzen", teile: [VORGANG] },
];

for (const seite of SEITEN) {
  test(`${seite.name}: ohne Token abgewiesen`, async ({ page }) => {
    await page.goto(seite.pfad);
    await expect(page.getByRole("heading", { name: ABGEWIESEN })).toBeVisible();
  });

  test(`${seite.name}: verbogenes Token abgewiesen`, async ({ page }) => {
    await page.goto(`${seite.pfad}?t=${verbogen(token(seite.zweck, ...seite.teile))}`);
    await expect(page.getByRole("heading", { name: ABGEWIESEN })).toBeVisible();
  });
}

test("Ein Token für einen anderen Zweck öffnet die Seite nicht", async ({ page }) => {
  // Der Größen-Link eines Spielers darf nicht das Trainerformular derselben
  // Person aufmachen — dort stünde der volle Name und die Liste dahinter.
  await page.goto(`/b/${VORGANG}/${ICH}?t=${token("groessen", VORGANG, ICH)}`);
  await expect(page.getByRole("heading", { name: ABGEWIESEN })).toBeVisible();
});

test("Eine ausgetauschte Personen-ID öffnet die Seite nicht", async ({ page }) => {
  // Das eigene, gültige Token mit fremder ID in der Adresse: die ID steht mit
  // unter der Signatur, sonst käme man so an die Größen eines anderen Kindes.
  await page.goto(`/g/${VORGANG}/${EIN_ANDERER}?t=${token("groessen", VORGANG, ICH)}`);
  await expect(page.getByRole("heading", { name: ABGEWIESEN })).toBeVisible();
});

test("Eine ausgetauschte Vorgangsnummer öffnet die Seite nicht", async ({ page }) => {
  await page.goto(`/v/AUS-2026-002?t=${token("status", VORGANG)}`);
  await expect(page.getByRole("heading", { name: ABGEWIESEN })).toBeVisible();
});

for (const seite of SEITEN) {
  test(`${seite.name}: das richtige Token kommt durch`, async ({ page }) => {
    // Zwei Dinge auf einmal, und beide sind nötig.
    //
    // Erstens die Gegenprobe zu allem oben: wäre eine Seite grundsätzlich
    // zu, bliebe sie trotzdem grün. Eine der Mutationen lief genau hier ins
    // Leere — nimmt man die Personen-ID aus der Signatur, wird der
    // vertauschte Link weiter abgewiesen, der richtige aber auch.
    //
    // Zweitens die Störungsmeldung. Der Lauf hat keine Datenbank, also endet
    // jeder richtige Link bei „Gerade nicht erreichbar“. Genau das war der
    // Fehler: F2, F3 und F1b sagten bei einem Ausfall „Dieser Link
    // funktioniert nicht“ — und der Spieler suchte den Fehler bei sich.
    await page.goto(`${seite.pfad}?t=${token(seite.zweck, ...seite.teile)}`);
    await expect(page.getByRole("heading", { name: DURCHGELASSEN })).toBeVisible();
    await expect(page.getByRole("heading", { name: ABGEWIESEN })).toHaveCount(0);
  });
}

/**
 * Der Bestätigungslink an `/neu`.
 *
 * `/neu` steht offen im Netz und kann nicht prüfen, ob der am Formular die
 * eingetragene Adresse besitzt. Der Link aus der Bestätigungsmail ist der
 * Beweis — und er hängt an derselben Signatur wie alle anderen Links.
 */
test("Bestätigen: ohne Token abgewiesen", async ({ page }) => {
  await page.goto("/neu/bestaetigen/00000000-0000-4000-8000-000000000001");
  await expect(page.getByRole("heading", { name: "Dieser Link funktioniert nicht" })).toBeVisible();
});

test("Bestätigen: verbogenes Token abgewiesen", async ({ page }) => {
  await page.goto("/neu/bestaetigen/00000000-0000-4000-8000-000000000001?t=erfunden");
  await expect(page.getByRole("heading", { name: "Dieser Link funktioniert nicht" })).toBeVisible();
});

test("Bestätigen: ein Token für eine andere Entwurfs-ID öffnet nichts", async ({ page }) => {
  // Das Token ist echt, gehört aber zu einem anderen Entwurf.
  const fremd = token("anlegen", "00000000-0000-4000-8000-000000000002");
  await page.goto(`/neu/bestaetigen/00000000-0000-4000-8000-000000000001?t=${fremd}`);
  await expect(page.getByRole("heading", { name: "Dieser Link funktioniert nicht" })).toBeVisible();
});

test("Bestätigen: das richtige Token kommt durch – und legt beim Öffnen nichts an", async ({
  page,
}) => {
  // Mailprogramme öffnen Links vorab. Käme der Vorgang schon beim Öffnen, wäre
  // die Bestätigung wertlos. Ohne Datenbank endet die Seite hier in einer
  // Störung – und genau das beweist, dass sie erst dort etwas tut.
  const echt = token("anlegen", "00000000-0000-4000-8000-000000000001");
  await page.goto(`/neu/bestaetigen/00000000-0000-4000-8000-000000000001?t=${echt}`);
  await expect(page.getByRole("heading", { name: "Dieser Link funktioniert nicht" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Vorgang jetzt anlegen" })).toHaveCount(0);
});
