import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Tests laufen in Node, nicht im Browser und nicht in Next.
 *
 * Zwei Dinge braucht es dafür:
 *
 * - `server-only` wirft beim Import, sobald es nicht in einer Server-Umgebung
 *   von Next steckt. Der Schutz ist im Betrieb richtig und im Test im Weg,
 *   deshalb zeigt der Alias auf ein leeres Modul.
 * - `@/…` löst Next über die tsconfig auf; Vitest kennt das nicht von selbst.
 *
 * Geprüft wird nur, was ohne Netz auskommt. Kein Test spricht mit HubSpot:
 * `npm test` muss ohne Schlüssel und ohne Internet grün sein, sonst taugt es
 * nicht für die Prüfung im Pull Request.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./test/leer.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
