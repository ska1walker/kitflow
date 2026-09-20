/**
 * Die Kette im echten Browser: F2 (Größe eintragen) und F3 (Liste bestätigen).
 *
 * Läuft gegen echtes Postgres, echtes PostgREST, die Ablage-Attrappe und eine
 * HubSpot-Attrappe (`scripts/db-testumgebung.sh`). **Das echte CRM des Vereins
 * wird dabei nicht angefasst** — eine Prüfung der Oberfläche hat dort nichts
 * herumzuschreiben.
 *
 *   bash scripts/db-testumgebung.sh
 *   npm run build && npx next start -p 3100
 *   npm run test:kette
 */
import { chromium } from "playwright";
import { createHmac } from "node:crypto";

const BASIS = process.env.UI_BASIS ?? "http://127.0.0.1:3100";
const NUMMER = "AUS-2026-900";
const GEHEIM = process.env.LINK_SECRET;
if (!GEHEIM) { console.error("LINK_SECRET fehlt."); process.exit(2); }
const token = (z, ...t) => createHmac("sha256", GEHEIM).update([z, ...t].join("\n")).digest("base64url");

const ergebnisse = [];
const pruefe = (name, ok, dazu = "") => {
  ergebnisse.push(ok);
  console.log(`${ok ? "OK  " : "ROT "} ${name}${dazu ? "  — " + dazu : ""}`);
};

const browser = await chromium.launch();
const seite = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
const fehler = [];
seite.on("pageerror", (f) => fehler.push(String(f).slice(0, 160)));

/* ---------------- F2 · der Spieler traegt seine Groesse ein ---------------- */

const F2 = `${BASIS}/g/${NUMMER}/9001?t=${token("groessen", NUMMER, "9001")}`;
await seite.goto(F2, { waitUntil: "networkidle" });
const text2 = await seite.locator("body").innerText();

pruefe("F2 spricht die Person mit Vornamen an", text2.includes("Anna"));
pruefe("F2 nennt KEINEN anderen Spielernamen",
  !text2.includes("Bernd") && !text2.includes("Clara") && !text2.includes("Zwerg"));
pruefe("F2 fragt genau die Groessenart des Artikels", text2.includes("Oberteil"));
pruefe("F2 fragt NICHT nach Groessen ohne Artikel",
  !text2.includes("Schuh") && !text2.includes("Trikot"));
pruefe("die hinterlegte Groesse wird gezeigt, nicht verschwiegen", text2.includes("M"));
pruefe("Initialen werden gefragt (Haken am Vorgang)", text2.includes("Initialen"));

// Eintragen und speichern.
const auswahl = seite.locator("select").first();
await auswahl.selectOption("L");
await seite.locator('input[name="initialen"]').fill("AZ");
await seite.getByRole("button", { name: /speichern|absenden|eintragen/i }).first().click();
await seite.waitForTimeout(1500);
const nachSpeichern = await seite.locator("body").innerText();
pruefe("F2 bestaetigt das Speichern", /danke|gespeichert/i.test(nachSpeichern));

// Erneut oeffnen: steht es noch da?
await seite.goto(F2, { waitUntil: "networkidle" });
const wieder = await seite.locator("body").innerText();
pruefe("nach erneutem Oeffnen steht die Groesse noch da", wieder.includes("L"));
pruefe("und die Initialen auch",
  (await seite.locator('input[name="initialen"]').inputValue()) === "AZ");

/* ---------------- F2 · die Grenzen ---------------------------------------- */

const fremd = await seite.request.get(`${BASIS}/g/${NUMMER}/9002?t=${token("groessen", NUMMER, "9001")}`);
pruefe("Annas Token oeffnet NICHT Bernds Formular",
  !(await fremd.text()).includes("Bernd"), `HTTP ${fremd.status()}`);

const ohne = await seite.request.get(`${BASIS}/g/${NUMMER}/9001`);
pruefe("ohne Token gibt F2 nichts her", !(await ohne.text()).includes("Anna"));

/* ---------------- F3 · der Trainer prueft die Liste ----------------------- */

await seite.goto(`${BASIS}/b/${NUMMER}?t=${token("bestaetigen", NUMMER)}`, { waitUntil: "networkidle" });
const text3 = await seite.locator("body").innerText();

pruefe("F3 zeigt alle drei Personen", ["Anna", "Bernd", "Clara"].every((n) => text3.includes(n)));
pruefe("F3 zeigt die eben eingetragene Groesse", text3.includes("L"));
pruefe("F3 hat eine Spalte Initialen", text3.includes("Initialen"));
pruefe("F3 sagt, wer noch fehlt", /fehlt/i.test(text3));

await seite.screenshot({ path: "/tmp/kitflow-db-test/f3.png" });
pruefe("keine Fehler in der Browser-Konsole", fehler.length === 0, fehler[0] ?? "");

await browser.close();
const rot = ergebnisse.filter((e) => !e).length;
console.log(`\n${ergebnisse.length - rot} von ${ergebnisse.length} gruen`);
process.exit(rot === 0 ? 0 : 1);
