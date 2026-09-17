# Seiten und Formulare in kitflow

Stand 10.09.2026. Ersetzt die Tally-Entwürfe F1 kdoMYe, F2 Zj7qVo, F3 eqJkAe (nur noch Spezifikation). Alle Seiten nach Coachbase-Archetyp „Formularseite“ (max-w-3xl, Felder nach Rezept 6.4, ein Primärbutton am Ende) bzw. „Detailseite“ für den Status.

Zugang über signierte Links: `/v/{vorgang}?t=…` (Status), `/g/{vorgang}/{hsid}?t=…` (Größen), `/b/{vorgang}?t=…` (Liste bestätigen). Token prüft Vorgang, Rolle, Kontakt und dass die Pipeline-Stufe passt; sonst freundliche Meldung statt Formular.

### Stand der Umsetzung (`src/lib/links.ts`)

- Signiert wird `HMAC-SHA256` über Zweck und die Teile, die in der URL stehen, mit `\n` getrennt; Schlüssel aus `LINK_SECRET`, mindestens 32 Zeichen. Fehlt er, funktioniert kein Link — die Anwendung fällt nicht offen auf.
- Die Personen-ID steht mit unter der Signatur. Sonst ließe sie sich in der Adresszeile austauschen und man sähe die Größen eines anderen Kindes.
- Der Zweck steht mit darunter, damit ein Status-Link nicht als Bestätigungs-Link durchgeht.
- Verglichen wird in konstanter Zeit (`timingSafeEqual`).
- **Kein Ablaufdatum.** Ob eine Seite noch etwas darf, entscheidet die Stufe des Vorgangs, nicht die Uhr. Ein Link, den Eltern in einer Gruppe weiterreichen, soll nicht mitten in der Frist sterben.
- Die Rolle steht nicht in der URL: `/v/{vorgang}` ist die Trainer-Ansicht, `/v/{vorgang}/{hsid}` die Spieler-Ansicht derselben Person. Der Umschalter fällt dort weg.
- Vor dem Rendern wird der Vorgang für Spieler gekürzt (`fuerSpieler`): fremde Namen und interne Verlaufseinträge werden entfernt, nicht nur ausgeblendet. Ausgeblendet hieße, sie stünden trotzdem im Quelltext.
- Ein abgelehnter Link bekommt immer dieselbe Antwort, auch wenn es den Vorgang gar nicht gibt. Wer raten will, soll daraus nichts lernen.
- Links baut `npm run link -- <vorgangsnummer> [personen-id]`, bis die Mails sie selbst verschicken.
- Gebaut sind `/v` (Status, zwei Rollen), `/g` (F2) und `/b` (F3). `/` ist ein Schaufenster mit Beispieldaten und fasst HubSpot nicht an.
- Jede Server Action prüft das Token selbst. Eine Action ist eine eigene Adresse und lässt sich ohne die Seite aufrufen; sich darauf zu verlassen, dass die Seite schon geprüft hat, wäre keine Prüfung.

### Stand von F1

**Gebaut unter `/neu`,** die einzige Seite ohne Token. Sie liest nichts aus HubSpot, sie legt nur an; es gibt dort also nichts zu sehen, was jemandem gehört. Gegen Bots hat sie ein verstecktes Feld.

Angelegt werden: der Deal auf Stufe 1 mit der nächsten freien Vorgangsnummer des Jahres, je Artikel ein Produkt (vorhandene werden über `hs_sku` wiederverwendet), je Artikel **eine Position ohne `spieler_hsid`** — das ist die Artikelliste des Vorgangs, aus der F2 die Größenarten liest und die F3 später zu Person mal Artikel aufklappt — und die Verknüpfung zu allen Kontakten, deren `team` eine der gewählten Mannschaften ist.

Findet sich zu keiner gewählten Mannschaft ein Kontakt, steht der Vorgang sofort auf Stufe 9 und die Seite sagt, dass die Mannschaft in HubSpot gepflegt werden muss (docs/formulare.md, M7).

Es fehlt Mail M1. Solange sie fehlt, zeigt die Danke-Seite alle Links im Klartext, damit sie nicht verloren gehen. Ebenfalls offen: die Auswahl aus dem Artikelstamm statt freier Felder, und der Wunschtermin für die Lieferung, für den es keine Eigenschaft gibt.

Die Vorgangsnummer kommt aus einer Suche über die bestehenden Nummern. Zwei Meldungen in derselben Sekunde bekämen dieselbe; bei einer Handvoll Vorgängen im Jahr ist das kein reales Risiko.

### Stand von F2 und F3

**F2 fertig.** Gefragt werden nur die Größenarten der Artikel dieses Vorgangs, jede einmal; bei einem Vorgang ohne Artikel („Nur Größen erfassen“) die Arten aus `groessenarten` am Deal. Beide Wege laufen durch **einen** Helfer `gefragteArten(deal, artikel)` in `src/lib/vorgaenge.ts` — F2 und F3 müssen hier zum selben Ergebnis kommen, sonst fragt das Formular etwas anderes, als die Liste anzeigt. Dazu, **nur wenn der Vorgang `initialen_noetig` trägt**, ein Pflichtfeld Initialen: höchstens drei Zeichen, nur Buchstaben und Ziffern. Beide Grenzen stehen so in der HubSpot-Eigenschaft `initialen`; kitflow prüft sie vorher, damit der Spieler erfährt, was falsch ist, statt „hat nicht geklappt“ zu lesen. Die Initialen hängen am Vorgang, nicht an einer Größenart – eine Person hat genau ein Paar, egal wie viele Artikel beflockt werden. Geändert werden darf nur auf Stufe 1. Geschrieben wird nur, was vorher als Frage rausging und in der HubSpot-Werteliste steht. Die Veraltungsregel (4 Monate Jugend, 12 Erwachsene) ist umgesetzt; ohne Bestätigungsdatum gilt eine Größe als veraltet. Es fehlt Mail M3.

**F2 als Trainer** liegt unter `/b/{vorgang}/{person}` mit eigenem Zweck `trainer`; die Links auf die einzelnen Zeilen erzeugt F3 selbst. Größen sind hier optional, weil der Trainer meist nur eine Nummer nachträgt; das Bestätigungsdatum wird nur gesetzt, wenn er wirklich eine Größe angefasst hat. Die Rückennummer muss zwischen 1 und 99 liegen und in der Mannschaft eindeutig sein — geprüft wird beides serverseitig, nicht nur im Browser. „Bekommt diesmal nichts“ und „spielt Torwart“ hängen am Deal (`ausgeschlossene_spieler`, `torwarte`), nicht am Kontakt: beides gilt nur für diesen Vorgang. Wer ausgeschlossen ist, kommt über seinen eigenen Größen-Link nicht mehr hinein und fällt aus der Liste; der Trainer erreicht ihn weiter und kann den Ausschluss zurücknehmen.

**F3 bis zur Bestätigung.** Tabelle mit Größen und Rückennummern, fehlend oder veraltet gelb, Nummer fehlend oder doppelt rot. Die sechs Prüfungen laufen und nennen im Klartext, was fehlt. Eine gefallene Prüfung verhindert das Bestätigen, auch mit gesetztem Häkchen. Prüfung 4 (Vereinslogo als Datei) und 5 (Summen gegen die Positionen) bleiben **offen** statt bestanden: das Logo kennt das Datenmodell nicht, und die Positionen entstehen erst danach. Offene Prüfungen blockieren nicht — sonst könnte niemand je bestätigen — stehen aber sichtbar da.

Bei „Nur Größen erfassen“ bleibt **nur Prüfung 2** (jede Person hat eine aktuelle Größe). Die anderen gelten der Anfrage an die Händler; „Es hängt kein Artikel am Vorgang“ wäre dort ein erfundener Mangel. Lieferadresse und Händlerhinweis fallen aus dem Formular.

Die Bestätigung schreibt `liste_bestaetigt_am`, `lieferadresse` und `hinweis_haendler`. **Die Stufe bleibt auf 1.** „Anfrage raus“ heißt, dass eine Anfrage rausgegangen ist; solange kitflow keine Mail verschickt, wäre dieser Stand eine Behauptung. Es fehlen also: Positionen am Deal anlegen, Händler-XLSX, M4 an beide Händler, M5 an den Trainer, M6 bei nicht bestandener Prüfung, Stufenwechsel. Alles davon hängt am Mailversand über Resend und an der Entscheidung XLSX in kitflow oder in Make (docs/offen.md).

## Statusseite `/v/{vorgang}`

**Person nachtragen.** Verknüpft wird in F1 genau einmal, beim Absenden; wer danach zur Mannschaft
kommt, fehlte am Vorgang und musste in HubSpot von Hand angehängt werden. Auf **Stufe 1** zeigt die
Trainer-Statusseite deshalb eine Karte mit denen, die zur Mannschaft des Vorgangs gehören und noch
nicht dranhängen (`kontakteDerMannschaft` minus `assoziierteIds`) — keine freie Namenssuche. Die
Server Action prüft denselben `status`-Token wie der Abbruch, die Stufe **und** dass die gewählte ID
wirklich in dieser Auswahl steckt; eine untergeschobene ID kommt nicht durch, auch nicht die eines
Kontakts aus einer fremden Mannschaft. Zurück kommt der frische Größen-Link als Pfad, den die Karte
aus der Adresse der Seite absolut macht — `KITFLOW_BASIS` ist für Mails da und darf fehlen.

Zu wissen: der HubSpot-Suchindex hinkt Schreibvorgängen bis zu einer Minute nach. Wer gerade erst
`team` bekommen hat, steht so lange nicht in der Auswahl. Die Karte sagt das.

Entwurf: prototyp/statusseite.html. Drei Ansichten:

- Trainer: Kopf mit Vorgang, Mannschaft, Art; aktueller Stand mit Satz und 8-Schritt-Leiste; „Als Nächstes“ (gelb, wenn der Trainer dran ist); Karten Größen (x von y, wer fehlt, Erinnerung senden, selbst eintragen), Händler (Status je Händler), Finanzierung (Sponsor, Eingang), Artikel (Feldspieler/Torwart); Verlauf.
- Spieler: Gruß mit Vorname, eigener Stand, eigene Größen und Nummer, Hinweis wer zahlt, Größen ändern bis zur Frist; Verlauf ohne interne Einträge; keine Beträge, keine anderen Namen.
- Spartenleitung (`/sparte`, mit Login): alle Vorgänge mit Stand, Mini-Leiste, „wartet auf …“, Hinweis bei Stillstand; „wartet auf dich“ bei Stufe 3 (Angebot wählen) und 5 (Bestellung freigeben).

## F1 · Bedarf melden (Trainer, öffentlicher Link)

**Zwei Modi.** Ganz oben wählt der Trainer, wie weit er ist. Die Vorauswahl ist der einfache Modus –
er ist der häufigere Fall, weil vor dem Sponsor noch nichts feststeht. Der Modus steht als verstecktes
Feld `modus` im Formular; die Server Action fällt bei fehlendem oder unbekanntem Wert auf den strengen
Modus zurück, damit ein manipuliertes Formular keine Pflichtfelder abwählen kann.

- **Erst ein Richtangebot** (`voranfrage`): Deine Daten, Mannschaft, Was braucht ihr, „Für wie viele
  Personen?“ (Zahl 1–60), je Artikel nur Hersteller, Artikelbezeichnung, Größenart, Größen von/bis
  (Auswahl aus den Werten der Größenart) und Stück je Person; dazu Sponsor und Hinweise. Keine
  Artikelnummer, keine Farbe, kein Für wen, keine Beflockung, keine Frist, keine Lieferadresse, keine
  Zahlungsregel. Ergebnis: Deal auf Stufe 0, Produkte mit Platzhalter-Nummer, keine Kontakte am Deal.
  Danke-Seite zeigt den Status-Link und den Link auf F1b.
- **Komplett melden** (`vollstaendig`): unverändert der Ablauf unten, Deal auf Stufe 1.

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

## F1b · Angaben vervollständigen (Trainer, signierter Link `/e/{vorgang}`)

Der zweite Halt des einfachen Wegs, Zweck `ergaenzen`. Erreichbar nur, solange der Vorgang auf Stufe 0
steht; danach antwortet die Seite wie bei einem falschen Token.

Kopf: Vorgangsnummer, Mannschaft, Ausstattungsart und die geschätzte Personenzahl.

1. Artikel, in der Reihenfolge der Meldung. Bezeichnung, Größenbereich und Stück je Person stehen fest
   und sind nicht änderbar – wer etwas anderes braucht, meldet neu. Gefragt wird je Artikel:
   Artikelnummer des Herstellers (Pflicht), Farbe, Für wen, Beflockung samt Freitext bei „Abweichend“.
2. Fristen und Lieferung: Größenfrist (Pflicht), Lieferadresse (Pflicht), Sponsor, Hinweise.
3. Pflicht-Checkbox Zahlungsregel, wortgleich mit F1.

Danach: Produkt bekommt die echte Artikelnummer und `aktiv = true`. Gibt es zu der Nummer schon ein
Produkt, hängt die Position darauf um und der Platzhalter wird stillgelegt statt gelöscht. Deal
bekommt Frist, Lieferadresse und Hinweis, die Kontakte der Mannschaft kommen über `team` dazu, Stufe
wird 1. Kein Kontakt gefunden: Stufe 9, wie in F1.

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
