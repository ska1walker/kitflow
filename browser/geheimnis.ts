import { createHmac } from "node:crypto";

/**
 * Der Schlüssel, mit dem der Server im Browser-Lauf die Links signiert
 * (`playwright.config.ts` gibt ihn als `LINK_SECRET` mit). Fest, damit die
 * Prüfungen selbst gültige und ungültige Links bauen können.
 */
export const GEHEIMNIS = "playwright-nur-fuer-den-testlauf-32-zeichen";

/**
 * Dieselbe Signatur wie `src/lib/links.ts` — absichtlich nachgebaut statt
 * importiert. `links.ts` ist `server-only` und ließe sich hier nicht laden;
 * wichtiger ist aber: eine Prüfung, die die Funktion benutzt, die sie prüft,
 * beweist nichts. Ändert jemand das Format, wird dieser Lauf rot, und genau
 * das soll er — jede bereits verschickte Adresse wäre dann tot.
 */
export function token(zweck: string, ...teile: string[]): string {
  return createHmac("sha256", GEHEIMNIS)
    .update([zweck, ...teile].join("\n"))
    .digest("base64url");
}
