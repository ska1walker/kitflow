# Konzept

Stand 10.09.2026. Quelle: Bauplan v3.3 (https://claude.ai/code/artifact/898b2710-ea95-4758-9335-555fcc0c2bb7) und Kais Vorgaben.

## Grundsätze (Kai, 10.09.2026)

- Neuer Trikotsatz: Der Verein ist verantwortlich. Ideal findet der Trainer einen Sponsor, sonst sucht die Fußballsparte, im schlechtesten Fall zahlt das Spartenbudget – nur mit Freigabe der Spartenleitung.
- Weitere Ausstattung (Trainingsanzüge usw.): Die Mannschaft finanziert selbst, oft übernimmt ein Sponsor ganz oder teilweise.
- Es gibt immer erst ein Angebot. Dafür eine saubere Anfrage mit exakten Artikeln, Größen, Mengen und Beflockung.
- Jede Anfrage geht an beide Händler: Intersport Uelzen (Jens Bormann) und 11teamsports (Michael Hillebrecht). Beide beflocken selbst.
- Größen liegen in HubSpot. Der Trainer bekommt die Liste zum Prüfen, bevor die Anfrage rausgeht.
- Größe gilt als veraltet nach 4 Monaten (Jugend, team ist ein Jahrgang) bzw. 12 Monaten (Erwachsene).
- Angebote und Rechnungen gehen an kai.boehm@eintrachtmunster.de, Angebote in Kopie an den Trainer.
- Der Schatzmeister zahlt und bucht; er bekommt den Buchungshinweis in fester Schreibweise.

## Rollen

| Rolle | Sieht und tut |
|---|---|
| Trainer | meldet Bedarf, sieht fehlende Größen, vergibt Rückennummern, nimmt Spieler heraus, markiert Torwart, bestätigt Liste, bestätigt Lieferung |
| Spieler bzw. Eltern | tragen Größen ein, sehen eigene Größen, Nummer und Mannschaftsstand ohne Beträge |
| Spartenleitung (Kai; Sebastian informiert) | sieht alle Vorgänge, wählt Angebot, gibt Spartenbudget und Bestellung frei |
| Sponsor | sagt zu und zahlt (an Verein oder direkt an Händler) |
| Händler | bekommt Anfrage, schickt Angebot, liefert |
| Schatzmeister | bestätigt Eingänge, zahlt Rechnungen, erstattet |

## Stufen (HubSpot-Pipeline „Ausstattung“)

| Nr | intern | auf der Statusseite | Übergang durch |
|---|---|---|---|
| 1 | Größen laufen | Größen werden gesammelt | Bedarfsmeldung F1 |
| 2 | Anfrage raus | Angebote angefragt | Liste bestätigt (F3), Prüfungen bestanden |
| 3 | Angebote da | Beide Angebote sind da | beide Angebote eingelesen oder 5 Tage nach dem ersten |
| 4 | Finanzierung | Finanzierung läuft | Angebot gewählt |
| 5 | Bestellbar | Das Geld ist da | Deckungsprüfung erfüllt |
| 6 | Bestellt | Bestellt | Spartenleitung gibt frei, Bestellung an Händler |
| 7 | Geliefert | Geliefert | Lieferung beim Trainer |
| 8 | Abgeschlossen | Abgeschlossen | Ausgabe bestätigt, Rechnung bezahlt und gebucht |
| 9 | Abgebrochen | Abgebrochen | durch Spartenleitung oder keine Spieler gefunden |

Jede Stufe hat auf der Statusseite: Satz „Aktueller Stand“, „Als Nächstes: wer tut was“, Verlauf mit Datum und Uhrzeit (neueste zuerst). Interne Einträge (Erinnerungen, Sponsor-Mahnung, Buchung) sieht nur der Trainer bzw. die Spartenleitung.

## Deckungsprüfung – wann „Bestellbar“

| Zahlweg | Bestellbar, wenn |
|---|---|
| Verein zahlt (Sponsor und/oder Mannschaftsanteil an den Verein) | eingang_verein ≥ amount |
| Mannschaft legt aus | vorkasse_bestaetigt ≥ amount |
| Sponsor zahlt direkt | vorkasse_bestaetigt ≥ amount |
| Trikotsatz, Kaskadenstufe 3 | eingang_verein + spartenbudget_freigegeben ≥ amount |

Eine Zusage allein macht nie bestellbar. Das Spartenbudget kommt nur über Kais Freigabe ins Spiel.

## Prüfungen vor der Anfrage

1. Jeder Artikel ist ein aktives Produkt mit Herstellernummer und Farbe
2. Jeder nicht ausgeschlossene Spieler hat eine aktuelle Größe je Größenart
3. Rückennummern vollständig und in der Mannschaft eindeutig
4. Beflockung je Artikel festgelegt, Vereinslogo als Datei vorhanden
5. Summen je Artikel und Größe stimmen mit den Positionen überein
6. Lieferadresse und Trainer-Kontakt gesetzt

Nicht bestanden: Mail M6 an den Trainer mit den Fehlern im Klartext.

## Nummern und Schreibweisen

- Vorgangsnummer: AUS-JJJJ-NNN, laufend je Jahr (z. B. AUS-2026-014)
- Token: HMAC-SHA256 über Deal-ID, Zweck und Schlüssel; Schlüssel nur als Umgebungsvariable, nie im Deal
- Verwendungszweck für Überweisungen: `AUS-2026-014 FB JG2014-2015 SPONSOR` bzw. `ELTERN`, `ERSTATTUNG`, `SPARTE`; nur Großbuchstaben, Ziffern, Bindestrich

## Standard-Beflockung (Annahme, von beiden Händlern bestätigen lassen)

| Element | Position | Ausführung |
|---|---|---|
| Vereinslogo | vorne, Brust links | ca. 8 cm breit, Transferdruck mehrfarbig |
| Vereinsname „EINTRACHT MUNSTER“ | hinten, oben mittig | Blockschrift ca. 5 cm, Flexdruck |
| Rückennummer | hinten unter dem Vereinsnamen | 20 cm Erwachsene, 15 cm Kindergrößen 116–164, Flexdruck |
| Farbe | – | weiß, auf hellen Artikeln schwarz |
| Sponsorlogo | Trikot Brust Mitte; Jacke/Hoodie Rücken unter der Nummer | Transferdruck, Größe laut Sponsorpaket und Verbandsvorgaben |
| Hosen, Shorts, Stutzen | – | ohne Beflockung |
| Torwartartikel | wie Trikots | Nummer laut Liste |

## Händleranfrage (Format aus Kais echter Anfrage)

Anhang je Händler als XLSX, Vorlage `Anfrage_Vorlage.xlsx` (liegt in Make.com/Ausstattung auf Kais Rechner):

- Blatt Positionen: eine Zeile je Person und Artikel, mit Namen. Spalten wie bisher: Produktname, Herstellernummer, Artikelnummer, Vorname, Nachname, Trikot, Kurze Sporthose, Trikotnummer, Schuhgroesse, Sponsor; rechts ergänzt: Trainingsanzug Oberteil, Trainingshose, Größenart, Größe, Menge, Beflockung
- Blatt Summen: Stück je Artikel und Größe (Formeln)
- Blatt Artikel: Artikelliste
- Spalte „Artikelnummer“ = Nummer von 11teamsports (z. B. 102.053.402.247). Für Intersport deren Nummer, falls vorhanden, sonst leer.
- Torwart bekommt eigene Artikel (Für = Torwart), Feldspieler die übrigen. Stutzen nach Schuhgröße.
- Beispiel: 18 Personen, 54 Positionen, Sponsor VGH in jeder Zeile.

## Arbeitsteilung kitflow und Make (Vorschlag)

| Aufgabe | kitflow | Make |
|---|---|---|
| Formulare, Statusseite, Übersicht | ja | – |
| HubSpot lesen und schreiben bei Formularen | ja (direkt, Private App) | – |
| Mails bei Formular-Ereignissen | ja (Resend) | – |
| Angebote und Rechnungen aus Gmail lesen (Claude) | – | ja (AUS-5) |
| Fristen, Erinnerungen | Vercel Cron oder Make (AUS-W) | ja |
| Todoist für Kai, Telegram-Fehler | – | ja |
| Händler-XLSX erzeugen | ja (serverseitig) oder Make | – |
