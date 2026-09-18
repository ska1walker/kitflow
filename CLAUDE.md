# kitflow

Vereinsausstattung für die Fußballsparte von Eintracht Munster 2020 e.V.: Trainer melden Bedarf, Spieler bzw. Eltern tragen Größen ein, der Trainer prüft, beide Händler bekommen eine saubere Anfrage, und alle Beteiligten sehen jederzeit, wo ihr Vorgang steht – wie bei einer Sendungsverfolgung.

Verantwortlich und einziger Betreiber: Kai Böhm, Spartenleiter Fußball (kai.boehm@eintrachtmunster.de).

## Was kitflow ist und was nicht

- kitflow ist die Oberfläche: Formulare, Statusseite, Übersicht für die Spartenleitung, Mails im selben Design.
- **Vorgänge leben in der eigenen Datenbank** (Supabase, `docs/datenbank.md`): Stufe, Artikel, Fristen, wer dazugehört, wer ausgeschlossen ist, wer im Tor steht, Rückennummern, Verlauf.
- **Personen leben in HubSpot**: Name, Mitgliedschaft, Größen, Initialen. Dort pflegt es die Geschäftsstelle, dort hängt die Passantrag-Kette.
- Der Deal im CRM ist seit dem Umzug nur noch ein **dünner Spiegel** (`src/lib/spiegel.ts`) und wird nie zurückgelesen. Eine Stufe, die in HubSpot von Hand verschoben wird, kommt nicht mehr bei kitflow an.
- Make.com erledigt Hintergrundabläufe, die nicht an eine Seite gebunden sind (Gmail-Wächter für Angebote/Rechnungen mit Claude, Todoist, Telegram, Fristen). Siehe docs/konzept.md.
- Tally ist abgelöst. Die drei Tally-Entwürfe (kdoMYe, Zj7qVo, eqJkAe) sind nur noch Spezifikation, siehe docs/formulare.md.

## Stack (Vorschlag, an Coachbase angelehnt)

- Next.js App Router, TypeScript, Tailwind CSS v4 mit `@theme`-Tokens aus docs/design-coachbase.md, Geist Sans und Geist Mono
- Hosting Vercel, Region Frankfurt (fra1); Domain z. B. ausstattung.eintrachtmunster.de (Kai verwaltet DNS)
- HubSpot über Private App Token, nur serverseitig
- Mails über Resend, Domain hubsport.club, Region eu-west-1; Vorlagen als React Email im selben Design
- Links mit signiertem Token statt Login (HMAC über Vorgang, Rolle, Kontakt-ID); nur die Spartenleitung braucht einen echten Login

Umgebungsvariablen: `HUBSPOT_TOKEN`, `RESEND_API_KEY`, `LINK_SECRET`, `MAKE_WEBHOOK_URL_*` (falls Make angestoßen wird), `SPARTE_PASSWORD` oder Auth-Provider für die Spartenleitung.

## Reihenfolge

1. Statusseite je Vorgang mit Ansichten Trainer, Spieler, Spartenleitung (Entwurf: prototyp/statusseite.html)
2. Größenabfrage (F2) mit Vorbelegung aus HubSpot
3. Bedarfsmeldung (F1) und Liste bestätigen (F3)
4. Später F4–F8 (Sponsor-Zusage, Zahlweg, Zahlungseingang, Kasse, Lieferung)

## Feste Regeln

- Sprache der Oberfläche: Deutsch. Trainer, Eltern, Spieler per du; Händler per Sie.
- Design: Coachbase-Design-System, siehe docs/design-coachbase.md. Keine Hex-Werte im JSX, nur Tokens.
- Nie Emojis, weder in Oberfläche noch in Mails oder Texten. Icons als SVG.
- Schreibweisen: Munster ohne Umlaut. Böhm mit ö. Vereinsname in Beflockung „EINTRACHT MUNSTER“.
- Typografische Anführungszeichen („…“) in Texten.
- Keine erfundenen Artikeldaten. Artikel kommen von den Händlern oder aus echten Anfragen. Beispieldaten in Entwürfen immer als Beispieldaten markieren.
- Daten von Kindern (Namen, Größen) nur serverseitig lesen, nie in den Code, nie in Logs. Spieler sehen nur sich selbst und den Mannschaftsstand ohne Beträge. Kontaktdaten nie offen anzeigen.
- **`/neu` ist offen im Netz** (kein Token). Dort nie Namen, Größen oder persönliche Links anzeigen — auch nicht auf der Danke-Seite, auch nicht im Antwortobjekt der Server Action. Anlegen darf nur, wer als Kontakt in HubSpot steht **und** dort „Funktion im Verein“ = Trainer oder Spartenleiter mit Sparte Fußball hat (`darfMelden` in `bedarf.ts`).
- **Die Startseite `/` steht ebenfalls offen** und trägt deshalb gar nichts Echtes mehr: keine Händler, keine Ansprechpartner, keine Artikelnummern, keinen Sponsor, keinen Beispiel-Kader. Das Schaufenster zum Durchklicken zieht mit dem Login nach `/sparte` (`browser/startseite.spec.ts` hält das fest).
- Die bestehende Make-HubSpot-Verbindung 2981268 und die Szenarien für Spartenzuordnung und Passantrag nicht anfassen.
- Keine Mail an die Geschäftsstelle ohne Kais ausdrückliche Freigabe.
- Aussagen zu Steuern immer mit dem Hinweis „ich bin kein Steuerberater“.
- Bestellt wird erst, wenn das Geld da ist (Deckungsprüfung, docs/konzept.md). Eine Zusage allein macht nie bestellbar.

## Befehle und Verifikation

Vor „fertig" laufen dieselben fünf Befehle, die auch der Workflow „Prüfung" fährt:

```
npm run typecheck    # next typegen && tsc --noEmit
npm run lint         # eslint src scripts browser playwright.config.ts
npm test             # vitest run
npm run build
npm run test:browser # playwright test
```

Dazu, von Hand und nicht in der Prüfung: `npm run test:db` fährt die Datenschicht gegen ein
echtes PostgREST auf einem echten Postgres, aufgesetzt von `scripts/db-testumgebung.sh`
(docs/datenbank.md). Ein Papp-Netz spiegelt die eigene Annahme zurück — dort kam ein Fehler
heraus, den die 54 Tests gegen die Attrappe nie gefunden hätten.

`npm run test:browser` fährt 28 Prüfungen in einem echten Chromium gegen einen frisch gebauten
Server (`playwright.config.ts`) und läuft in der Prüfung mit. Der Lauf bekommt die Zugänge zu
HubSpot, Supabase und Resend **leer** übergeben — leer gesetzt heißt in Next, dass `.env.local`
sie nicht mehr überschreibt. Er kann deshalb keinen echten Kontakt lesen, keinen Vorgang
anlegen und keine Mail verschicken; nur der Browser selbst kommt aus dem Netz. Geprüft wird,
was nur im Browser zu prüfen ist: die Zugangsgrenze im laufenden Server, die Umschalter in F1,
die Startseite. Er baut dabei `.next` neu, ohne Zugänge — vor dem nächsten Lauf von Hand
also einmal `npm run build`. Wird er rot, hängen Spur und Bilder als Artefakt am Lauf.

`npm test` prüft reine Logik und geht **nie** ins Netz: keine HubSpot, kein Schlüssel, keine
Testobjekte. Was nur gegen die echte HubSpot zu prüfen ist, wird von Hand gegen einen
Wegwerf-Vorgang gefahren und danach archiviert — mit dem Archivieren nachgelesen.

Getestet wird zuerst, was wehtut, wenn es bricht: `links.ts` ist die einzige Zugangsgrenze der
Anwendung, es gibt keinen Login. Ein Test, der auch bei kaputtem Code grün bliebe, ist
wertlos; neue Tests werden deshalb einmal gegen eine absichtlich gebrochene Fassung gehalten.

**Dabei muss belegt sein, dass der Bruch wirklich angekommen ist.** Eine Ersetzung, die nicht
greift — falsche Einrückung, Text seither geändert — lässt die Tests grün und sieht aus wie ein
bestandener Gegenbeweis. Also erst prüfen, dass die Stelle getroffen wurde, dann die Tests
laufen lassen.

**Der Dev-Server hydriert in der Cloud-Umgebung nicht** (der HMR-Websocket kommt durch den
Proxy nicht durch, kein Knopf reagiert). Im Browser wird gegen `npm run start` geprüft, was
ohnehin näher an Vercel ist.

## Dokumente

- docs/konzept.md – Ablauf, Rollen, Stufen, Regeln, Nummern, Händlerformat
- docs/datenmodell.md – HubSpot-Objekte, Eigenschaften, Größenwerte, Zuordnung
- docs/datenbank.md – eigene Datenbank für Vorgänge: Schnitt, Tabellen, RLS, wie geprüft wurde
- docs/formulare.md – Seiten und Formulare mit Feldern, Logik und Texten
- docs/mails.md – Mailvorlagen M1–M7
- docs/design-coachbase.md – Tokens, Rollen, Rezepte
- docs/offen.md – offene Punkte und Entscheidungen
- prototyp/statusseite.html – klickbarer Entwurf der Statusseite
