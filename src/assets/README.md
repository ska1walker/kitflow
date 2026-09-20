# Dateien, die der Server zur Laufzeit liest

Kein Bilderordner für die Oberfläche — was hier liegt, wird **serverseitig** mit
`fs.readFile` gelesen und in Mails eingebettet. Für Bilder, die im Browser
erscheinen sollen, ist `public/` der richtige Ort.

## `wappen.png` — noch nicht da

Das Vereinswappen für die Händleranfrage (M4). **Die Datei fehlt**; bis sie da
ist, gehen die Anfragen ohne Wappen raus, mit der Wortmarke im Kopf. Das ist
kein Fehler und hält nichts auf (`src/lib/wappen.ts`).

Was die Datei braucht:

| | |
|---|---|
| Name | genau `wappen.png` |
| Format | PNG, gern mit Transparenz |
| Größe | quadratisch, etwa 144 × 144 px — im Kopf erscheint es mit 36 px, das Dreifache deckt Bildschirme mit hoher Auflösung ab |
| Gewicht | ein paar Kilobyte; es hängt an **jeder** Händleranfrage |

Danach einmal bereitstellen. Ein Neustart genügt nicht: die Datei wird beim
Bauen mit eingepackt (`outputFileTracingIncludes` in `next.config.ts`).

**Wo es erscheint:** nur in M4, der Mail an Bormann und Hillebrecht, und auch
dort nur, wenn der Haken in F1 gesetzt ist. Die Mails an Trainer und Mannschaft
bleiben ohne — Kais Schnitt vom 20.09.2026.

**Nicht das Sponsorlogo hierhin.** Das wechselt je Vorgang und gehört in den
Ablagespeicher, nicht ins Projekt.
