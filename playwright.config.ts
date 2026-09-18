import { defineConfig, devices } from "@playwright/test";
import { GEHEIMNIS } from "./browser/geheimnis";

/**
 * Die Prüfungen, die einen echten Browser brauchen.
 *
 * Bis hierher lief jede Browser-Prüfung als Wegwerf-Skript: Server starten,
 * Playwright von Hand, Text vergleichen, hinterher aufräumen. Was dabei einmal
 * bewiesen war, war beim nächsten Mal wieder unbewiesen. Hier steht es fest.
 *
 * Drei Entscheidungen, jede aus einem Fehler gelernt:
 *
 * 1. `npm test` bleibt ohne Netz und ohne Dienste — die Prüfung im Pull Request
 *    darf an nichts hängen, was ausfallen kann. Diese Läufe stehen daneben
 *    (`npm run test:browser`), wie `test:db`.
 *
 * 2. Der Server für den Lauf ist **immer ein frisch gebauter**. Der Dev-Server
 *    hydriert in der Cloud-Umgebung nicht (der HMR-Websocket kommt durch den
 *    Proxy nicht durch): kein Knopf reagiert, und das sieht aus wie ein
 *    kaputtes Formular. `reuseExistingServer: false` schließt aus, dass ein
 *    zufällig laufender Dev-Server den Lauf beantwortet.
 *
 * 3. Die Zugänge zu HubSpot, Supabase und Resend werden **leer** übergeben.
 *    Leer gesetzt heißt in Next: `.env.local` überschreibt sie nicht mehr. Der
 *    Lauf kann damit weder einen echten Kontakt lesen noch einen Vorgang
 *    anlegen noch eine Mail verschicken — nicht aus Vorsatz, sondern weil die
 *    Türen fehlen. Was Kontakte braucht, gehört in den Lauf gegen die echten
 *    Dienste (docs/pruefen.md), nicht hierher.
 */

const PORT = 3100;

export default defineConfig({
  testDir: "browser",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npx next start --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/neu`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      LINK_SECRET: GEHEIMNIS,
      HUBSPOT_TOKEN: "",
      HUBSPOT_AUTH_VIA_PROXY: "",
      RESEND_API_KEY: "",
      NEXT_PUBLIC_SUPABASE_URL: "",
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
    },
  },
});
