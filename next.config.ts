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

  experimental: {
    serverActions: {
      // Next kappt den Koerper einer Server Action bei 1 MB (Voreinstellung,
      // gegen DoS). Die Bildgrenze in `ablage.ts` liegt bei 2 MB — ohne diese
      // Zeile war sie unerreichbar: alles zwischen 1 und 2 MB starb im
      // Framework mit einer generischen Meldung, bevor die eigene Pruefung je
      // lief. Der Trainer bekam nicht „hoechstens 2 MB“ zu sehen, sondern
      // nichts Brauchbares.
      //
      // 2,5 MB statt 2: die Grenze gilt fuer den ROHEN Koerper einschliesslich
      // der Begrenzer und Kopfzeilen, die multipart/form-data dazupackt. Die
      // Doku empfiehlt 10-20 KB Luft; hier ist reichlich, damit die eigene
      // Meldung und nicht die des Frameworks erscheint.
      // node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md
      bodySizeLimit: "2.5mb",
    },
  },
};

export default nextConfig;
