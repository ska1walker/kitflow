import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Das Vereinswappen liegt als Datei unter `src/assets/` und wird zur Laufzeit
  // mit `fs.readFile` gelesen (src/lib/wappen.ts), nicht importiert — ein PNG
  // laesst sich nicht `import`en, und `public/` ist auf Vercel ein CDN-Pfad und
  // kein verlaesslicher Ort fuer den Server.
  //
  // Next spurt nur Dateien ein, die es im Code als Abhaengigkeit erkennt. Ein
  // aus Strings zusammengesetzter Pfad gehoert nicht dazu — die Datei fehlte in
  // der Bereitstellung, und das Wappen waere still ausgeblieben. Die Doku nennt
  // dafuer genau diesen Schalter:
  // node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md
  //
  // `/*` heisst: fuer jede Route, die eine Server-Spur erzeugt.
  outputFileTracingIncludes: {
    "/*": ["src/assets/**/*"],
  },
};

export default nextConfig;
