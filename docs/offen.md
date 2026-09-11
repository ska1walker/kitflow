# Offen

Stand 10.09.2026

## Kai
- Resend: Konto mit Domain hubsport.club (Region eu-west-1), API-Key für kitflow und Make
- HubSpot: Private App für kitflow anlegen (Scopes siehe docs/datenmodell.md); zusätzlich ggf. Make-Verbindung „HubSpot Ausstattung“
- Vercel-Projekt, Subdomain für kitflow (DNS bei Kai)
- 10–15 Standardartikel von Jens Bormann und Michael Hillebrecht; bei Intersport eigene Artikelnummern erfragen
- Standard-Beflockung mit beiden Händlern bestätigen
- Login für die Spartenleitung festlegen (wer außer Kai: Sebastian?)

## Entscheidungen
- ~~kitflow schreibt HubSpot direkt oder über Make-Webhooks~~ – entschieden: direkt, `src/lib/hubspot.ts` ist der einzige Weg nach außen
- Fristen und Erinnerungen über Vercel Cron oder weiter Make (AUS-W)
- Händler-XLSX in kitflow erzeugen oder Make

## Vor Phase 2
- Mit den Händlern: Rechnung auf Sponsor oder Mannschaft möglich, Vorkasserechnung, Bestätigung per Link
- Beleg-Tabelle mit Schatzmeister bzw. Steuerberater abstimmen (ich bin kein Steuerberater)
- Frist für die Sponsorensuche durch den Trainer. Sie gehört jetzt an Stufe 0 (Voranfrage): solange sie nicht festgelegt ist, bleibt ein Vorgang dort ohne Wecker liegen. `stufe_frist` steht als Eigenschaft bereit, wird aber von keiner Stelle geschrieben.
- Ob die Händler auf eine Voranfrage ohne Personenzeilen überhaupt antworten. Mit Jens Bormann und Michael Hillebrecht besprechen, bevor die Mail M4 scharf gestellt wird.
- Sebastians Todoist-Zugang und Vertretung
