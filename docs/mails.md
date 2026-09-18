# Mailvorlagen M1–M7

Stand: 10.09.2026 · Versand über Resend (Domain hubsport.club), aus kitflow als React-Email-Vorlagen im Coachbase-Design; Hintergrund-Mails ggf. aus Make (Modul resend:sendAnEmail). Links auf die Statusseite in jede Mail aufnehmen.

Platzhalter in doppelten geschweiften Klammern kommen aus HubSpot bzw. dem Formular, z. B. `{{vorgang}}`.
Anrede: Trainer, Eltern und Spieler per du, Händler per Sie.

Absender für alle Mails: Eintracht Munster Fußball <ausstattung@hubsport.club> (Vorschlag; Domain hubsport.club in Resend verifiziert).
Reply-To: kai.boehm@eintrachtmunster.de – dort landen Antworten, Angebote und Rechnungen

---

## M1 · Vorgang angelegt (AUS-1 → Trainer)

**Betreff:** {{vorgang}} · Größenabfrage für {{mannschaft}} läuft

Hallo {{trainer_vorname}},

danke für deine Meldung. Dein Vorgang hat die Nummer **{{vorgang}}**. Bitte gib sie bei allen Rückfragen an.

**Was angefragt wird**
{{artikelliste}}

**So geht es weiter**
1. Unten findest du für jede Spielerin und jeden Spieler einen persönlichen Link. Schick den Text für die Elterngruppe weiter, die Links stehen schon drin.
2. Größen bitte bis **{{groessen_frist}}** eintragen.
3. Wenn alle eingetragen haben, bekommst du die Liste zum Prüfen. Erst nach deiner Bestätigung geht die Anfrage an Intersport Uelzen und 11teamsports.
4. Die Angebote kommen in Kopie an dich.

**Deine eigenen Links**
Bei dir kannst du zusätzlich Rückennummern vergeben und Spieler für diese Runde herausnehmen:
{{trainer_links}}

**Wichtig zur Bezahlung**
Bestellt wird erst, wenn die Finanzierung steht und das Geld da ist. Wie das genau läuft, steht im Merkblatt im Anhang.

Sportliche Grüße
Kai Böhm
Spartenleiter Fußball · Eintracht Munster

*Anhang: Merkblatt_Zahlwege.pdf*

---

## M1a · Text für die Elterngruppe (Baustein in M1)

> Hallo zusammen,
> für {{mannschaft}} wird neue Ausstattung angefragt: {{artikel_kurz}}.
> Bitte tragt bis {{groessen_frist}} über den persönlichen Link die aktuelle Größe eures Kindes ein. Das dauert eine Minute. Beflockte Sachen können nicht umgetauscht werden, im Zweifel lieber eine Nummer größer.
>
> {{liste_name_link}}
>
> Danke!
> {{trainer_vorname}}

`{{liste_name_link}}` = je Zeile „Vorname Nachname: Link“. Make baut die Zeilen aus den verknüpften Spielern.

---

## M2a · Dein Größen-Link (AUS-1 → eine Person)

Gebaut, verschickt aus kitflow: `sendeM2a` in `src/lib/mail.ts`. Sie geht an **eine** Person und
trägt **deren** Link. Ausgelöst wird sie vom Trainer — auf der Danke-Seite nach F1/F1b und auf
seiner Statusseite, jeweils über Häkchen je Person. Vorausgewählt ist, wer eine Adresse hat und
noch keine Mail bekam; `mail_versand` hält das fest.

**Betreff:** {{mannschaft}}: Größe bitte bis {{groessen_frist}} eintragen

Hallo {{vorname}},

für {{mannschaft}} wird neue Ausstattung angefragt. Dafür fehlt noch deine Größe: {{arten}}.

Bitte trag sie bis {{groessen_frist}} ein. Das dauert eine Minute.

[Größe eintragen] {{link_f2}}

Beflockte Sachen können nicht umgetauscht werden. Im Zweifel lieber eine Nummer größer.

Der Link gilt nur für dich. Bitte gib ihn nicht weiter – wer ihn hat, kann deine Größe ändern.

Bei einem reinen Größencheck steht statt der Beflockungszeile, dass nichts bestellt wird.

**Keine fremden Namen.** Die Mail erreicht Eltern; wer sonst in der Mannschaft ist, geht sie nichts
an (CLAUDE.md). Wer keine Adresse hat, bekommt keine Mail — der Trainer sieht das in der Karte und
trägt die Größe über die Liste selbst ein.

---

## M2 · Erinnerung Größen (AUS-W → Eltern bzw. Spieler) · Phase 3

**Betreff:** Erinnerung: Größe für {{mannschaft}} bis {{groessen_frist}}

Hallo,

für {{spieler_vorname}} fehlt noch die Größe für die neue Ausstattung ({{artikel_kurz}}). Bitte trag sie bis {{groessen_frist}} hier ein:
{{link_f2}}

Danke und sportliche Grüße
Eintracht Munster Fußball

---

## M3 · Größenliste zum Prüfen (AUS-3 → Trainer)

**Betreff:** {{vorgang}} · Größenliste {{mannschaft}} bitte prüfen

Hallo {{trainer_vorname}},

{{status_satz}}

{{tabelle}}

Die Tabelle zeigt je Person die Größe für jeden Artikel und die Rückennummer.
- Gelb markiert: Größe fehlt noch oder ist älter als {{veraltet_monate}} Monate.
- Rot markiert: Rückennummer doppelt oder fehlt.

**Etwas ändern:** Hinter jeder Zeile steht ein Link. Damit kannst du Größe und Rückennummer anpassen oder jemanden für diese Runde herausnehmen.

**Alles richtig?** Dann bestätige hier. Danach geht die Anfrage an beide Händler:
{{link_f3}}

Sportliche Grüße
Kai Böhm

`{{status_satz}}` je nach Auslöser:
- alle da: „alle haben ihre Größe eingetragen.“
- Frist erreicht: „die Frist ist abgelaufen. {{anzahl_offen}} Größen fehlen noch, sie sind unten markiert.“

---

## M4 · Angebotsanfrage (AUS-4 → Intersport Uelzen und 11teamsports, je eine Mail)

**An:** {{haendler_email}}
**Reply-To:** kai.boehm@eintrachtmunster.de
**Betreff:** Angebotsanfrage {{vorgang}} · Eintracht Munster · {{mannschaft}}

{{haendler_anrede}},

für unsere Mannschaft {{mannschaft}} bitten wir um ein Angebot für die Artikel in der angehängten Liste.

**Bitte im Angebot angeben**
- Preis je Position inklusive Beflockung durch Sie
- Gültigkeit des Angebots
- Lieferzeit ab Bestellung
- Vorgangsnummer {{vorgang}} im Betreff oder auf dem Angebot

**Beflockung**
Die Beflockung je Artikel steht in der Liste. Unser Standard:
- Vereinslogo vorne, Brust links, ca. 8 cm breit, Transferdruck mehrfarbig
- „EINTRACHT MUNSTER“ hinten oben mittig, Blockschrift, ca. 5 cm hoch, Flexdruck
- Rückennummer hinten unter dem Vereinsnamen, 20 cm bei Erwachsenengrößen, 15 cm bei Kindergrößen 116–164, Flexdruck
- Farbe weiß, auf hellen Artikeln schwarz
- Hosen, Shorts und Stutzen ohne Beflockung
- Torwartartikel wie Trikots, Nummer laut Liste

Wenn Sie davon abweichen würden oder etwas nicht passt, geben Sie es bitte im Angebot an.

**Wunschtermin Lieferung:** {{wunschtermin}}
**Lieferadresse:** {{lieferadresse}}
{{hinweis_trainer}}

Bitte schicken Sie das Angebot als PDF an kai.boehm@eintrachtmunster.de und in Kopie an {{trainer_email}}. Die gleiche Anfrage geht auch an einen zweiten Händler.

Mit freundlichen Grüßen
Kai Böhm
Spartenleiter Fußball · Eintracht Munster 2020 e.V.

*Anhang: {{vorgang}}_Anfrage.xlsx im bisherigen Format: Blatt Positionen (Produktname, Herstellernummer, Artikelnummer, Vorname, Nachname, Größen, Trikotnummer, Sponsor, eine Zeile je Person und Artikel), Blatt Summen (Stück je Artikel und Größe), Blatt Artikel. Vorlage: `Anfrage_Vorlage.xlsx`. Spalte „Artikelnummer“: für 11teamsports deren Nummer, für Intersport deren Nummer falls vorhanden, sonst leer*

`{{haendler_anrede}}`: „Sehr geehrter Herr Bormann“ bzw. „Sehr geehrter Herr Hillebrecht“ – aus dem Firmen-Kontakt in HubSpot.

---

## M5 · Anfrage ist raus (AUS-4 → Trainer)

**Betreff:** {{vorgang}} · Anfrage an beide Händler verschickt

Hallo {{trainer_vorname}},

die Anfrage für {{mannschaft}} ist heute an Intersport Uelzen und 11teamsports gegangen. Beide Angebote kommen in Kopie an dich. Wenn beide da sind, wählt die Spartenleitung aus und du bekommst den Betrag und das Sponsorpaket.

Bis dahin muss nichts bezahlt und nichts bestellt werden.

Sportliche Grüße
Kai Böhm

---

## M6 · Liste noch nicht vollständig (AUS-4, Prüfung nicht bestanden → Trainer)

**Betreff:** {{vorgang}} · Anfrage noch nicht verschickt

Hallo {{trainer_vorname}},

du hast die Liste bestätigt, aber bei der Prüfung ist noch etwas aufgefallen:

{{pruef_fehler}}

Bitte korrigiere das über die Links in der letzten Mail mit der Größenliste. Danach bestätigst du die Liste noch einmal.

Sportliche Grüße
Kai Böhm

`{{pruef_fehler}}` = eine Zeile je nicht bestandener Prüfung aus Blatt 05, im Klartext, z. B. „Rückennummer 7 ist doppelt (Name A, Name B)“.

---

## M7 · Keine Spieler gefunden (AUS-1 → Trainer)

**Betreff:** {{vorgang}} · Keine Spieler für {{mannschaft}} gefunden

Hallo {{trainer_vorname}},

zu {{mannschaft}} sind in unserer Mitgliederliste keine Spielerinnen oder Spieler hinterlegt, deshalb konnten keine Größenlinks verschickt werden. Die Spartenleitung ist informiert und meldet sich bei dir.

Sportliche Grüße
Kai Böhm
