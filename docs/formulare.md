# Seiten und Formulare in kitflow

Stand 10.09.2026. Ersetzt die Tally-Entwürfe F1 kdoMYe, F2 Zj7qVo, F3 eqJkAe (nur noch Spezifikation). Alle Seiten nach Coachbase-Archetyp „Formularseite“ (max-w-3xl, Felder nach Rezept 6.4, ein Primärbutton am Ende) bzw. „Detailseite“ für den Status.

Zugang über signierte Links: `/v/{vorgang}?t=…` (Status), `/g/{vorgang}/{hsid}?t=…` (Größen), `/b/{vorgang}?t=…` (Liste bestätigen). Token prüft Vorgang, Rolle, Kontakt und dass die Pipeline-Stufe passt; sonst freundliche Meldung statt Formular.

## Statusseite `/v/{vorgang}`

Entwurf: prototyp/statusseite.html. Drei Ansichten:

- Trainer: Kopf mit Vorgang, Mannschaft, Art; aktueller Stand mit Satz und 8-Schritt-Leiste; „Als Nächstes“ (gelb, wenn der Trainer dran ist); Karten Größen (x von y, wer fehlt, Erinnerung senden, selbst eintragen), Händler (Status je Händler), Finanzierung (Sponsor, Eingang), Artikel (Feldspieler/Torwart); Verlauf.
- Spieler: Gruß mit Vorname, eigener Stand, eigene Größen und Nummer, Hinweis wer zahlt, Größen ändern bis zur Frist; Verlauf ohne interne Einträge; keine Beträge, keine anderen Namen.
- Spartenleitung (`/sparte`, mit Login): alle Vorgänge mit Stand, Mini-Leiste, „wartet auf …“, Hinweis bei Stillstand; „wartet auf dich“ bei Stufe 3 (Angebot wählen) und 5 (Bestellung freigeben).

## F1 · Bedarf melden (Trainer, öffentlicher Link)

Einleitung: „Hier meldest du als Trainerin oder Trainer neuen Ausstattungsbedarf für deine Mannschaft an. Danach bekommen deine Spielerinnen und Spieler einen persönlichen Link für ihre Größen. Du prüfst die fertige Liste, erst dann geht eine Anfrage an beide Händler (Intersport Uelzen und 11teamsports). Die Angebote bekommst du in Kopie.“
Hinweis: „Diese Meldung ist noch keine Bestellung. Bestellt wird erst, wenn die Finanzierung steht und das Geld da ist.“

1. Deine Daten: Vorname, Nachname, E-Mail, Mobilnummer (alle Pflicht)
2. Mannschaft: Mehrfachauswahl mit den HubSpot-team-Werten (2022 … 2007, 1. Herren, 2. Herren, 3. Herren, Ü30 Herren, Ü40 Team 1–3, Damen, Mädchen); Hinweis „Bei Jugendmannschaften die Jahrgänge wählen, zum Beispiel 2014 und 2015.“; optional „Welche Mannschaft im Jahrgang?“
3. Was braucht ihr? Neuer Trikotsatz (Verein verantwortlich) / Weitere Ausstattung, z. B. Trainingsanzüge (Mannschaft finanziert)
4. Artikel (1 bis beliebig viele, „Artikel hinzufügen“ statt fester 5 Seiten):
   - später zuerst Auswahl aus dem Artikelstamm, sonst „nicht in der Liste“ mit freien Feldern
   - Hersteller, Artikelbezeichnung, Artikelnummer des Herstellers (Pflicht; Hinweis: „Die Händler brauchen für ein vergleichbares Angebot die genaue Artikelnummer des Herstellers. Du findest sie im Katalog oder Onlineshop des Herstellers beim jeweiligen Artikel.“), Farbe
   - Größenart: Trikot / Oberteil (Jacke, Hoodie, Shirt) / Kurze Sporthose / Trainingshose / Schuhe, Stutzen (nach Schuhgröße) / ohne Größe (z. B. Tasche, Ball)
   - Stück je Person (Zahl, Standard 1)
   - Für wen: Alle / Nur Feldspieler / Nur Torwart (Standard Alle)
   - Beflockung: Standard / Ohne / Abweichend (dann Pflicht-Textfeld „Wie soll abweichend beflockt werden?“); Standard kurz erklärt: „Vereinslogo vorn links, EINTRACHT MUNSTER hinten oben, Rückennummer darunter. Sponsorlogo nach Absprache. Hosen, Shorts und Stutzen bleiben ohne Druck.“
5. Fristen und Lieferung: Größenfrist (Datum, Pflicht; Hinweis „Wir empfehlen 10 bis 14 Tage. Wer bis dahin nichts einträgt, bekommt zwei Erinnerungen, danach entscheidest du.“), Wunschtermin Lieferung (optional), Lieferadresse (Pflicht), Sponsor auf der Kleidung falls bekannt (optional), Hinweise (optional)
6. Pflicht-Checkbox Zahlungsregel: „Ich habe verstanden: Bestellt wird erst, wenn die Finanzierung steht. Zahlt der Verein, muss das Geld auf dem Vereinskonto sein. Legt die Mannschaft aus, überweist sie vorab direkt an den Händler. Ohne Freigabe der Spartenleitung oder Zusage eines Sponsors bleibt die Mannschaft auf den Kosten sitzen.“
7. Danke-Seite: „Du bekommst gleich eine E-Mail mit der Vorgangsnummer, den persönlichen Größenlinks für deine Mannschaft und einem fertigen Text für die Elterngruppe. Wenn alle eingetragen haben, bekommst du die Liste zum Prüfen.“ Dazu Link auf die Statusseite.

Danach: Deal anlegen (Stufe 1), Kontakte der Mannschaft über `team` finden, Größenlinks erzeugen, Mail M1 mit Baustein M1a und Merkblatt Zahlwege. Keine Spieler gefunden: M7 und Stufe 9.

## F2 · Größen (Spieler bzw. Eltern; Trainer)

- Kopf: „Hallo {Vorname}, für deine Mannschaft wird neue Ausstattung angefragt (Vorgang {vorgang}): {Artikel kurz}.“
- „Bitte trag die Größen ein, die jetzt passen. Wenn schon eine Größe vorausgewählt ist, stammt sie aus der letzten Abfrage. Prüf sie kurz, Kinder wachsen schnell.“
- Tipp: „Beflockte Kleidung kann der Händler nicht umtauschen. Im Zweifel lieber eine Nummer größer oder vorher bei einem Teamkollegen anprobieren.“
- Nur die Größenarten dieses Vorgangs erscheinen. Vorbelegung aus HubSpot, außer die Größe ist veraltet (4 bzw. 12 Monate).
- Werte: Kleidung 116, 128, 140, 152, 164, 176, XS, S, M, L, XL, XXL, XXXL; Schuhe/Stutzen 35–51. Pflicht für Spieler, optional für Trainer.
- Nur Trainer: Rückennummer (1–99, in der Mannschaft eindeutig), „Bekommt diesmal nichts“, „Spielt in dieser Runde Torwart und bekommt die Torwartartikel“.
- Optional: Hinweis zur Größe (z. B. „Trikot lieber weiter geschnitten“).
- Danke: „Danke, deine Größen sind da. Du kannst den Link bis zur Frist noch einmal öffnen und etwas ändern, es zählt die letzte Eingabe. Wenn alle eingetragen haben, prüft deine Trainerin oder dein Trainer die Liste, danach geht die Anfrage an die Händler.“
- Schreibt Kontakt-Größen und `groesse_zuletzt_bestaetigt_am` in HubSpot. Wenn alle da sind oder die Frist erreicht ist: Mail M3 an den Trainer.

## F3 · Liste bestätigen (Trainer)

- Tabelle aller Personen mit Größe je Artikel und Rückennummer; fehlend oder veraltet gelb, Nummer doppelt oder leer rot; je Zeile „ändern“ (öffnet F2 als Trainer).
- Pflicht-Checkbox „Liste vollständig und richtig“, optional abweichende Lieferadresse und Hinweis an die Händler.
- Danach die sechs Prüfungen (docs/konzept.md). Bestanden: Positionen am Deal anlegen, Händler-XLSX je Händler, M4 an beide Händler, M5 an Trainer, Stufe 2. Nicht bestanden: M6.

## Später (F4–F8)

- F4 Sponsor-Zusage: Firma, Ansprechpartner, E-Mail, Rechnungsadresse; Betrag ganz oder teilweise; Zahlweg an den Verein oder direkt an den Händler (nur ganzer Betrag); Logo als Vektordatei; Einverständnis Werbeleistung
- F5 Zahlweg Mannschaft: Anteil an den Verein / Vorkasse beim Händler; bei Vorkasse Rechnungsempfänger, Kontoinhaber, IBAN; Bestätigung „Zahlt der Sponsor weniger, trägt die Mannschaft den Rest“
- F6 Zahlung eingegangen (Händler): Betrag, Datum, Zahler
- F7 Kasse (Schatzmeister): Eingang / Rechnung bezahlt / Erstattung erledigt; Betrag, Datum, Zahler
- F8 Lieferung (Trainer): vollständig? sonst was fehlt; Teamfoto nur mit bestätigter Einwilligung der Eltern
