import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Die Prüfungen, die ein echtes PostgREST auf einem echten Postgres brauchen.
 *
 * Bewusst eine eigene Datei: `npm test` muss ohne Netz und ohne Dienste grün
 * sein, sonst taugt es nicht für die Prüfung im Pull Request. Diese hier laufen
 * von Hand, nach `scripts/db-testumgebung.sh` (docs/datenbank.md).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.echt.ts"],
  },
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./test/leer.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
