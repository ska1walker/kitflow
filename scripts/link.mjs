#!/usr/bin/env node
/**
 * Erzeugt signierte Links (docs/konzept.md). Bis die Formulare stehen und die
 * Mails die Links selbst verschicken, ist das der einzige Weg, einen zu bauen.
 *
 *   npm run link -- AUS-2026-014                 # Trainer-Status
 *   npm run link -- AUS-2026-014 865248581878    # dazu Spieler-Status und Größen
 *
 * Der Schlüssel kommt aus LINK_SECRET, entweder aus der Umgebung oder aus
 * .env.local. Er wird nie ausgegeben.
 */

import { createHmac } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

const BASIS = process.env.KITFLOW_BASIS ?? "http://localhost:3000";

/** LINK_SECRET aus der Umgebung, sonst aus .env.local. */
function schluessel() {
  if (process.env.LINK_SECRET) return process.env.LINK_SECRET;

  const pfad = new URL("../.env.local", import.meta.url).pathname;
  if (!existsSync(pfad)) return null;

  for (const zeile of readFileSync(pfad, "utf8").split("\n")) {
    const treffer = /^\s*LINK_SECRET\s*=\s*(.*)\s*$/.exec(zeile);
    if (treffer) return treffer[1].replace(/^["']|["']$/g, "");
  }
  return null;
}

const KEY = schluessel();
if (!KEY || KEY.length < 32) {
  console.error(
    "LINK_SECRET fehlt oder ist kuerzer als 32 Zeichen.\n" +
      "Einen erzeugen:  node -e \"console.log(require('node:crypto').randomBytes(32).toString('base64url'))\"\n" +
      "und in .env.local eintragen.",
  );
  process.exit(1);
}

// Dieselbe Konstruktion wie in src/lib/links.ts: Zweck und Teile mit \n
// getrennt, damit ("a","bc") und ("ab","c") nicht dieselbe Signatur ergeben.
function signiere(zweck, ...teile) {
  return createHmac("sha256", KEY).update([zweck, ...teile].join("\n")).digest("base64url");
}

const [vorgang, person] = process.argv.slice(2);
if (!vorgang) {
  console.error("Aufruf: npm run link -- <vorgangsnummer> [personen-id]");
  process.exit(1);
}

const e = encodeURIComponent;
const zeigen = (was, pfad, token) => console.log(`${was.padEnd(16)} ${BASIS}${pfad}?t=${token}`);

zeigen("Trainer-Status", `/v/${e(vorgang)}`, signiere("status", vorgang));
zeigen("Liste bestätigen", `/b/${e(vorgang)}`, signiere("bestaetigen", vorgang));
zeigen("Ergänzen (F1b)", `/e/${e(vorgang)}`, signiere("ergaenzen", vorgang));

if (person) {
  zeigen("Spieler-Status", `/v/${e(vorgang)}/${e(person)}`, signiere("status", vorgang, person));
  zeigen("Größen", `/g/${e(vorgang)}/${e(person)}`, signiere("groessen", vorgang, person));
  zeigen(
    "Größen (Trainer)",
    `/b/${e(vorgang)}/${e(person)}`,
    signiere("trainer", vorgang, person),
  );
} else {
  console.log("\nMit einer Personen-ID als zweitem Argument kommen Spieler-Status und Größen dazu.");
}
