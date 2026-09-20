/**
 * Die Bilder-Karte im echten Browser.
 *
 * Warum es diesen Lauf gibt: die Unit-Tests prüfen die Schicht, nicht das
 * Formular. Genau dort saß der Fehler, den nur ein Browser finden konnte —
 * **Next kappt den Körper einer Server Action bei 1 MB**, und diese Absage
 * erreicht den eigenen Code nie. Die Seite brach mit „This page couldn't load"
 * ab, statt „höchstens 2 MB" zu sagen. Ein Handyfoto hat 3 bis 8 MB; das hätte
 * jeden Trainer getroffen, der ein Foto einer Trainingsjacke hochlädt.
 *
 * Voraussetzung — beides läuft nicht in der PR-Prüfung, die bleibt netzfrei:
 *
 *   bash scripts/db-testumgebung.sh     # Postgres, PostgREST, Ablage
 *   npm run build && npx next start -p 3100
 *   npm run test:ui
 *
 * Die Umgebung dafür:
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3344
 *   SUPABASE_SERVICE_ROLE_KEY=<der DIENST aus dem Skript>
 *   LINK_SECRET=<irgendein 32-Zeichen-Wert, derselbe wie unten>
 *
 * Der Vorgang wird hier angelegt und hinterher wieder entfernt.
 */
import { chromium } from "playwright";
import { createHmac } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BASIS = process.env.UI_BASIS ?? "http://127.0.0.1:3100";
const NUMMER = "AUS-2026-900";

const GEHEIM = process.env.LINK_SECRET;
if (!GEHEIM) {
  console.error("LINK_SECRET fehlt — ohne den lässt sich kein Link signieren.");
  process.exit(2);
}

/** Dieselbe Rechnung wie `signiere` in src/lib/links.ts. */
function token(zweck, ...teile) {
  return createHmac("sha256", GEHEIM).update([zweck, ...teile].join("\n")).digest("base64url");
}

const T = token("status", NUMMER);
const STATUS = `${BASIS}/v/${NUMMER}?t=${T}`;

/**
 * Die Dateien entstehen hier, nicht im Repo: ein 2,5-MB-Blob gehört in keine
 * Versionsverwaltung, und die Grenzen sollen aus der Rechnung kommen und nicht
 * aus einem Dateinamen.
 */
const ORDNER = mkdtempSync(path.join(tmpdir(), "kitflow-ui-"));
const datei = (name) => path.join(ORDNER, name);

/** Ein echtes 1x1-PNG, kein erfundener Byte-Salat. */
writeFileSync(
  datei("echt.png"),
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);
/** Ein PDF, das sich als PNG ausgibt — der Browser meldet dafür image/png. */
writeFileSync(datei("getarnt.png"), Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(64)]));
/** Knapp über der eigenen Grenze (2 MB), aber unter der des Frameworks. */
const knapp = Buffer.alloc(2.2 * 1024 * 1024);
Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(knapp);
writeFileSync(datei("knapp-drueber.png"), knapp);
/** Ein Handyfoto: weit über der Framework-Grenze, der Fall aus dem Alltag. */
const handy = Buffer.alloc(5 * 1024 * 1024);
Buffer.from([0xff, 0xd8, 0xff, 0xe0]).copy(handy);
writeFileSync(datei("handyfoto.jpg"), handy);

const ergebnisse = [];
function pruefe(name, ok, dazu = "") {
  ergebnisse.push({ name, ok, dazu });
  console.log(`${ok ? "OK  " : "ROT "} ${name}${dazu ? "  — " + dazu : ""}`);
}

const browser = await chromium.launch();
const seite = await browser.newPage({ viewport: { width: 1280, height: 1400 } });

const fehler = [];
seite.on("pageerror", (f) => fehler.push(String(f)));
seite.on("console", (m) => { if (m.type() === "error") fehler.push(m.text()); });

await seite.goto(STATUS, { waitUntil: "networkidle" });

// --- 1. Die Karte ist da und sagt, dass nichts hinterlegt ist ---------------
const karte = seite.locator("form", { has: seite.getByText("Sponsorlogo") }).first();
pruefe("Bilder-Karte steht auf der Statusseite", await karte.isVisible());
pruefe("Sponsorlogo zeigt „kein Bild“",
  (await karte.getByText("kein Bild").count()) === 1);

// Das Artikelfeld: die zweite Form in der Karte.
const artikelFeld = seite.locator("form", { has: seite.getByText("adidas Trainingsjacke") }).first();
pruefe("Artikelfeld traegt Hersteller und Bezeichnung", await artikelFeld.isVisible());
pruefe("Knopf heisst „Hochladen“, solange nichts da ist",
  (await artikelFeld.getByRole("button", { name: "Hochladen" }).count()) === 1);
pruefe("kein „Entfernen“, solange nichts da ist",
  (await artikelFeld.getByRole("button", { name: "Entfernen" }).count()) === 0);

// --- 2. Ein getarntes PDF wird abgewiesen ----------------------------------
await artikelFeld.locator('input[type="file"]').setInputFiles(datei("getarnt.png"));
await artikelFeld.getByRole("button", { name: "Hochladen" }).click();
await seite.waitForTimeout(1200);
const textNachPdf = await artikelFeld.innerText();
pruefe("getarntes PDF abgewiesen", textNachPdf.includes("Nur PNG, JPEG oder WebP"),
  textNachPdf.split("\n").filter((z) => z.includes("Nur PNG")).join(""));
pruefe("und es ist trotzdem kein Bild hinterlegt", textNachPdf.includes("kein Bild"));

// --- 3a. Knapp ueber der eigenen Grenze: der Server weist ab ----------------
await artikelFeld.locator('input[type="file"]').setInputFiles(datei("knapp-drueber.png"));
await seite.waitForTimeout(400);
const textKnapp = await artikelFeld.innerText();
pruefe("2,2 MB: schon im Browser abgewiesen", textKnapp.includes("zu groß"),
  textKnapp.split("\n").filter((z) => z.includes("groß")).join(""));
pruefe("und der Knopf ist gesperrt",
  await artikelFeld.getByRole("button", { name: "Hochladen" }).isDisabled());

// --- 3b. Ein Handyfoto (5 MB) darf die Seite NICHT zerschiessen -------------
// Ohne die Pruefung im Browser kappt Next den Koerper, die Action laeuft nie,
// und der Trainer sieht „This page couldn't load".
await artikelFeld.locator('input[type="file"]').setInputFiles(datei("handyfoto.jpg"));
await seite.waitForTimeout(400);
pruefe("5-MB-Handyfoto: Knopf gesperrt, Seite heil",
  (await artikelFeld.getByRole("button", { name: "Hochladen" }).isDisabled()) &&
    !(await seite.locator("body").innerText()).includes("couldn"));

// Wieder eine gueltige Datei waehlen, damit der Knopf frei wird.
await artikelFeld.locator('input[type="file"]').setInputFiles(datei("echt.png"));
await seite.waitForTimeout(300);
pruefe("nach gueltiger Wahl ist der Knopf wieder frei",
  !(await artikelFeld.getByRole("button", { name: "Hochladen" }).isDisabled()));

// --- 4. Ein echtes PNG geht durch ------------------------------------------
await artikelFeld.getByRole("button", { name: "Hochladen" }).click();
await seite.waitForTimeout(1500);
const textNachPng = await artikelFeld.innerText();
pruefe("echtes PNG gespeichert", textNachPng.includes("Gespeichert"));
pruefe("die Vorschau ersetzt „kein Bild“ SOFORT", !textNachPng.includes("kein Bild"));
pruefe("Knopf heisst jetzt „Ersetzen“",
  (await artikelFeld.getByRole("button", { name: "Ersetzen" }).count()) === 1);
pruefe("und „Entfernen“ ist da",
  (await artikelFeld.getByRole("button", { name: "Entfernen" }).count()) === 1);

// Laedt das Vorschaubild wirklich, oder steht da ein kaputtes Symbol?
const bildOk = await artikelFeld.locator("img").first().evaluate(
  (b) => b instanceof HTMLImageElement && b.complete && b.naturalWidth > 0,
);
pruefe("das Vorschaubild laedt wirklich (naturalWidth > 0)", bildOk);

// --- 5. Nach einem Neuladen ist es immer noch da ----------------------------
await seite.goto(STATUS, { waitUntil: "networkidle" });
const frisch = seite.locator("form", { has: seite.getByText("adidas Trainingsjacke") }).first();
pruefe("nach dem Neuladen bleibt es hinterlegt",
  !(await frisch.innerText()).includes("kein Bild"));

// --- 6. Der Spieler sieht es in der Groessenabfrage -------------------------
// (ohne HubSpot gibt es keine Person; geprueft wird stattdessen die Grenze)
const ohneToken = await seite.request.get(
  `${BASIS}/api/bild?vorgang=${NUMMER}&art=artikel`, { failOnStatusCode: false });
pruefe("Bild ohne Token: 404", ohneToken.status() === 404, `bekam ${ohneToken.status()}`);

const falscherToken = await seite.request.get(
  `${BASIS}/api/bild?vorgang=${NUMMER}&art=artikel&token=${"x".repeat(43)}`,
  { failOnStatusCode: false });
pruefe("Bild mit erfundenem Token: 404", falscherToken.status() === 404, `bekam ${falscherToken.status()}`);

// --- 7. Entfernen ----------------------------------------------------------
await frisch.getByRole("button", { name: "Entfernen" }).click();
await seite.waitForTimeout(1500);
const textNachWeg = await frisch.innerText();
pruefe("entfernt", textNachWeg.includes("Entfernt"));
pruefe("und die Vorschau sagt wieder „kein Bild“", textNachWeg.includes("kein Bild"));

await seite.screenshot({ path: path.join(ORDNER, "statusseite.png"), fullPage: false });
pruefe("keine Fehler in der Browser-Konsole", fehler.length === 0, fehler.slice(0, 2).join(" | "));

await browser.close();

const rot = ergebnisse.filter((e) => !e.ok);
console.log(`\n${ergebnisse.length - rot.length} von ${ergebnisse.length} gruen`);
process.exit(rot.length === 0 ? 0 : 1);
