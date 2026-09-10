# kitflow

Vereinsausstattung für die Fußballsparte von Eintracht Munster 2020 e.V.: Trainer melden Bedarf, Spieler bzw. Eltern tragen Größen ein, der Trainer prüft, beide Händler bekommen eine saubere Anfrage, und alle Beteiligten sehen jederzeit, wo ihr Vorgang steht – wie bei einer Sendungsverfolgung.

Verantwortlich und einziger Betreiber: Kai Böhm, Spartenleiter Fußball (kai.boehm@eintrachtmunster.de).

## Was kitflow ist und was nicht

- kitflow ist die Oberfläche: Formulare, Statusseite, Übersicht für die Spartenleitung, Mails im selben Design.
- HubSpot ist die einzige Datenbasis (Deals = Vorgänge, Produkte = Artikelstamm, Positionen = Person × Artikel, Kontakte = Größen). kitflow hat zunächst keine eigene Datenbank.
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
- Die bestehende Make-HubSpot-Verbindung 2981268 und die Szenarien für Spartenzuordnung und Passantrag nicht anfassen.
- Keine Mail an die Geschäftsstelle ohne Kais ausdrückliche Freigabe.
- Aussagen zu Steuern immer mit dem Hinweis „ich bin kein Steuerberater“.
- Bestellt wird erst, wenn das Geld da ist (Deckungsprüfung, docs/konzept.md). Eine Zusage allein macht nie bestellbar.

## Dokumente

- docs/konzept.md – Ablauf, Rollen, Stufen, Regeln, Nummern, Händlerformat
- docs/datenmodell.md – HubSpot-Objekte, Eigenschaften, Größenwerte, Zuordnung
- docs/formulare.md – Seiten und Formulare mit Feldern, Logik und Texten
- docs/mails.md – Mailvorlagen M1–M7
- docs/design-coachbase.md – Tokens, Rollen, Rezepte
- docs/offen.md – offene Punkte und Entscheidungen
- prototyp/statusseite.html – klickbarer Entwurf der Statusseite
