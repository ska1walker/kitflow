# Offen

Stand 18.09.2026

## Kai
- Resend: Konto mit Domain hubsport.club (Region eu-west-1), API-Key für kitflow und Make
- HubSpot: Private App für kitflow anlegen (Scopes siehe docs/datenmodell.md); zusätzlich ggf. Make-Verbindung „HubSpot Ausstattung“
- Vercel-Projekt, Subdomain für kitflow (DNS bei Kai)
- 10–15 Standardartikel von Jens Bormann und Michael Hillebrecht; bei Intersport eigene Artikelnummern erfragen
- Standard-Beflockung mit beiden Händlern bestätigen
- **`SPARTE_EMAILS` setzen.** Die Anmeldung ist gebaut (docs/anmeldung.md). Entschieden und beide Adressen liegen vor: Kai **und Sebastian Hebisch**. Die Werte stehen in Vercel, nicht hier — Variablenwerte gehören nicht ins Repository. Fehlt die Variable, kommt niemand hinein; das ist Absicht, heißt aber auch, dass `/sparte` bis dahin stillsteht.
- **`NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel.** Neu und Pflicht für die Anmeldung — der Dienst-Schlüssel taugt dafür nicht.
- **In Supabase**: Custom SMTP auf Resend stellen (sonst zwei Mails pro Stunde aus einer Supabase-Domain) und `https://<domain>/auth/callback` als Redirect-URL freigeben. Beides steht in docs/anmeldung.md.
- **Supabase-Projekt für kitflow, Region EU.** Von der Entwicklungsumgebung aus ist genau eines sichtbar (`wcnnetngzcyidnteiril`, eu-central-1, **inaktiv**) — und das ist weder das Coachbase-Projekt noch erkennbar für kitflow gedacht. Welches Konto kitflow bekommt, entscheidet Kai. Gebraucht werden danach `NEXT_PUBLIC_SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY`, und die Migration `supabase/migrations/001_vorgaenge.sql` muss einmal im SQL-Editor laufen (docs/datenbank.md).

## Entscheidungen
- ~~kitflow schreibt HubSpot direkt oder über Make-Webhooks~~ – entschieden: direkt, `src/lib/hubspot.ts` ist der einzige Weg nach außen
- ~~Vorgänge bleiben in HubSpot oder bekommen eine eigene Datenbank~~ – entschieden: eigene Datenbank (Supabase), der Deal bleibt als **dünner Spiegel** im CRM. Der Spiegel wird nie zurückgelesen. **Folge: eine Stufe, die in HubSpot von Hand verschoben wird, kommt nicht mehr bei kitflow an** — dafür bekommt `/sparte` einen Stufenwechsel. Umgesetzt am 18.09.2026: F1, F1b, F2, F3, Statusseite und Übersicht lesen und schreiben gegen die Datenbank (docs/datenbank.md).
- ~~Fristen und Erinnerungen über Vercel Cron oder weiter Make (AUS-W)~~ – entschieden: **Vercel Cron**. Mit eigener Datenbank liegt der Lauf im selben Projekt wie die Daten. Gebaut am 18.09.2026: `/api/erinnerungen`, täglich 16:00 UTC (`vercel.json`), Grenzen und Prüfungen in docs/mails.md. **Neu zu setzen: `CRON_SECRET`** (mind. 16 Zeichen) – fehlt es, antwortet der Endpunkt 503.
- Händler-XLSX in kitflow erzeugen oder Make — vorläufig entschieden: kitflow hängt eine **CSV** an M4 (Semikolon, BOM, öffnet in Excel auf Deutsch in Spalten). Sobald `Anfrage_Vorlage.xlsx` vorliegt, lässt sich die gewohnte Vorlage nachrüsten.

## Mail
- Die Bestätigungsmail an `/neu` ist gebaut (`sendeBestaetigung`): ohne den Klick darin entsteht kein Vorgang.
- M1 an den Trainer ist gebaut (Resend über REST, `src/lib/mail.ts`), in beiden Zuschnitten: Voranfrage und vollständig.
- Nötige Variablen: `RESEND_API_KEY`, `KITFLOW_BASIS` (sonst `VERCEL_URL`), optional `MAIL_ABSENDER`, `MAIL_ANTWORT` und `MAIL_NUR_AN` als Testbremse.
- Die Domain hubsport.club muss in Resend verifiziert sein, sonst lehnt Resend ab und es geht still keine Mail raus (der Fehler steht im Log).
- M2a (der persönliche Größen-Link) und **M2 (die Erinnerung)** sind gebaut. Die Erinnerung läuft täglich über Vercel Cron; ihre Grenzen stehen in docs/mails.md.
- **M3 (Größenliste zum Prüfen) ist gebaut** und läuft im täglichen Lauf mit: alle da oder Frist erreicht, höchstens eine je Vorgang.
- **M6 entfällt** — die Prüfungen weisen eine unvollständige Liste schon auf der Seite ab, bevor etwas geschrieben wird.
- **M4 und M5 sind gebaut** — auf Kais ausdrückliche Freigabe am 18.09.2026, mit seiner Auflage: **keine Spielernamen nach draußen**. Die Anfrage nennt nur Artikel, Größe, Stückzahl, Rückennummer und Initialen (`src/lib/anfrage.ts`). **Neu zu setzen: `HAENDLER`** — fehlt die Variable, geht keine Anfrage raus, die Bestätigung gilt trotzdem und der Vorgang bleibt auf Stufe 1 liegen.
- **M4 geht erst nach Freigabe der Spartenleitung raus** (Kai, 18.09.2026). Der Trainer bestätigt, die Spartenleitung gibt auf `/sparte` frei oder stoppt mit Grund; erst dann M4 und M5. Benachrichtigung über **Telegram** und eine **Todoist-Aufgabe**. Details und die offenen Fragen zur späteren Automatik in docs/freigabe.md. **Neu zu setzen: `TELEGRAM_TOKEN`, `TELEGRAM_CHAT`, `TODOIST_TOKEN`** (und optional `TODOIST_PROJEKT`); Migration `20260918150000_freigabe.sql` einspielen.
- **M4b (Rückfrage an den Trainer) ist gebaut** — sie geht raus, wenn die Spartenleitung stoppt, und nennt den Grund wörtlich. Ohne sie stünde der Trainer vor einer bestätigten Liste, bei der nichts passiert.
- M7 offen: der Fall steht heute auf der Seite. Eine Mail wäre für den, der sie zu früh schließt.
- Noch offen: der Anhang Merkblatt_Zahlwege.pdf.

## Bilder – entschieden und gebaut (20.09.2026)
- ~~Vereinswappen in den Mails~~ – gebaut: Haken je Vorgang, **nur in M4**, als Inline-Anhang. Datei gehört als `src/assets/wappen.png` ins Projekt und fehlt noch.
- ~~Wohin mit der Sponsorgrafik~~ – gebaut: privater Eimer `kitflow` in Supabase Storage, hochgeladen auf der Statusseite, hängt als Druckdatei an M4. **Druckmaße stehen bewusst nicht in der Mail** – die sind mit Bormann und Hillebrecht nicht abgestimmt, und erfundene Maße kosten mehr als eine Rückfrage.
- ~~Vorschaubilder der Artikel~~ – gebaut: Foto je Artikel, erscheint über den Größenfeldern in F2.
- **Neu einzurichten**: Migrationen 005 und 006, dazu der Eimer `kitflow` mit *Public bucket: aus*. Details in docs/bilder.md.
- **Offen geblieben**: Bilder werden **nicht verkleinert** (das bräuchte `sharp`, kitflow hat außer Next und React keine Abhängigkeit). Stattdessen eine harte Grenze bei 2 MB. Wenn Trainer regelmäßig daran scheitern, ist das der Moment, über `sharp` zu reden – nicht vorher.

## Vor Phase 2
- Mit den Händlern: Rechnung auf Sponsor oder Mannschaft möglich, Vorkasserechnung, Bestätigung per Link
- Beleg-Tabelle mit Schatzmeister bzw. Steuerberater abstimmen (ich bin kein Steuerberater)
- Frist für die Sponsorensuche durch den Trainer. Sie gehört jetzt an Stufe 0 (Voranfrage): solange sie nicht festgelegt ist, bleibt ein Vorgang dort ohne Wecker liegen. `stufe_frist` steht als Eigenschaft bereit, wird aber von keiner Stelle geschrieben.
- Ob die Händler auf eine Voranfrage ohne Personenzeilen überhaupt antworten. Mit Jens Bormann und Michael Hillebrecht besprechen, bevor die Mail M4 scharf gestellt wird.
- Sebastians Todoist-Zugang und Vertretung
