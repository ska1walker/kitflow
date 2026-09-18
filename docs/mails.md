# Mailvorlagen M0–M7

Stand: 10.09.2026 · Versand über Resend (Domain hubsport.club), aus kitflow als React-Email-Vorlagen im Coachbase-Design; Hintergrund-Mails ggf. aus Make (Modul resend:sendAnEmail). Links auf die Statusseite in jede Mail aufnehmen.

Platzhalter in doppelten geschweiften Klammern kommen aus HubSpot bzw. dem Formular, z. B. `{{vorgang}}`.
Anrede: Trainer, Eltern und Spieler per du, Händler per Sie.

Absender für alle Mails: Eintracht Munster Fußball <ausstattung@hubsport.club> (Vorschlag; Domain hubsport.club in Resend verifiziert).
Reply-To: kai.boehm@eintrachtmunster.de – dort landen Antworten, Angebote und Rechnungen

---

## M0 · Bitte bestätigen (→ die Adresse aus F1)

Gebaut: `sendeBestaetigung` in `src/lib/mail.ts`.

**Betreff:** Bitte bestätigen: Ausstattung für {{mannschaft}}

Hallo {{vorname}},

unter dieser Adresse wurde gerade Ausstattung für {{mannschaft}} gemeldet. Bevor etwas passiert, brauchen wir einen Klick von dir.

[Ja, das war ich – Vorgang anlegen] → {{anlegen_link}}

> Warst du das nicht? Dann ignorier diese Mail einfach. Ohne den Klick entsteht kein Vorgang, es wird niemand angeschrieben, und nach kurzer Zeit ist die Meldung von selbst weg.

**Das wurde gemeldet**
{{ausstattungsart}}
{{artikelliste}}

Der Link gilt 24 Stunden. Danach meldest du den Bedarf einfach neu.

### Warum es sie gibt

`/neu` steht offen im Netz. Es prüft, ob die eingetragene Adresse einem Trainer
der Fußballsparte gehört — aber **nicht, ob der am Formular sie besitzt**. Die
Vereinsadressen folgen dem Muster `vorname.nachname@eintrachtmunster.de`, und
wer Trainer ist, steht auf fussball.de. Damit konnte ein Fremder einen Vorgang
in fremdem Namen anlegen: 26 Kontakte daran und M1 an jemanden, der nichts
gemeldet hat.

Seit dem 18.09. entsteht beim Abschicken **nichts** — nur ein Entwurf
(`src/lib/entwurf.ts`). Erst der Klick legt den Vorgang an und löst M1 aus.

Die Mail muss zweierlei können: für den, der es war, ist sie ein
Zwischenschritt; für den, der es **nicht** war, ist sie eine Warnung. Deshalb
steht der Satz „ignorier diese Mail einfach" weit oben und nicht am Ende.

Der Klick landet auf einer Seite, die erst **zeigt**, was angelegt würde, und
einen Knopf hat. Das Öffnen allein legt nichts an: Mailprogramme und
Virenscanner öffnen Links vorab, und dann entstünde der Vorgang, ohne dass ein
Mensch ihn gesehen hat.

Ein Entwurf trägt Name, Adresse und Telefon des Trainers. Die Tabelle steht
hinter RLS ohne Policy, der Link gilt 24 Stunden, und der tägliche Lauf löscht,
was älter als 72 Stunden ist.

---

## M1 · Vorgang angelegt (AUS-1 → Trainer)

Gebaut: `sendeM1` in `src/lib/mail.ts`, drei Zuschnitte (Voranfrage · vollständig · Größencheck).

**Betreff:** {{vorgang}} · Größenabfrage für {{mannschaft}} läuft

Hallo {{trainer_vorname}},

deine Angaben für {{mannschaft}} sind vollständig. Bitte gib die Nummer **{{vorgang}}** bei allen Rückfragen an.

**Was angefragt wird**
{{artikelliste}}

**So geht es weiter**
1. Öffne deine Statusseite und verschick die Größen-Mail. Dort hakst du an, wer eine bekommen soll — jede Person bekommt ihren eigenen Link.
2. Größen bitte bis **{{groessen_frist}}** eintragen.
3. Wenn alle eingetragen haben, prüfst du die Liste. Erst nach deiner Bestätigung geht die Anfrage an Intersport Uelzen und 11teamsports.
4. Die Angebote kommen in Kopie an dich.

[Größen-Mail verschicken] → {{status_link}}

Wer keine E-Mail-Adresse hinterlegt hat, steht dort grau in der Liste — diese Größen trägst du selbst ein.

Liste prüfen und bestätigen: {{bestaetigen_link}}

**Wichtig zur Bezahlung**
Bestellt wird erst, wenn die Finanzierung steht und das Geld da ist. Zahlt der Verein, muss das Geld auf dem Vereinskonto sein. Legt die Mannschaft aus, überweist sie vorab direkt an den Händler.

Sportliche Grüße
Kai Böhm
Spartenleiter Fußball · Eintracht Munster

**M1 trägt keinen einzigen persönlichen Größen-Link.** Jeder dieser Links öffnet die Größen genau einer Person; stünden sie in M1, hinge die ganze Mannschaft an einer Mail, die weitergeleitet wird. Verschickt werden sie einzeln über die Statusseite, als M2a.

Die Frist steht deutsch (`19.09.`), nicht als ISO-Datum. Das Formular liefert `2026-09-19`; `kurzesDatum` in `mail.ts` setzt es um. Im ersten echten Versand stand die Rohfassung in der Mail.

---

## M1a · Text für die Elterngruppe — **abgeschafft**

M1 trug einen fertigen Absatz zum Weiterleiten in die Elterngruppe, mit je einer Zeile „Vorname
Nachname: Link“. Das war zweimal falsch: es verteilte die Namen einer ganzen Jugendmannschaft in
eine Gruppe, und jeder dieser Links ist ein Zugang zu den Größen einer einzelnen Person.

Ersetzt durch M2a: eine Mail je Person, mit genau deren Link. Der Trainer wählt auf der
Statusseite aus, wer sie bekommt (`src/components/mail-karte.tsx`).

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

## M2 · Erinnerung Größen (→ Spieler bzw. Eltern)

Gebaut: `sendeM2` in `src/lib/mail.ts`, verschickt vom täglichen Lauf in
`src/lib/erinnerung.ts`.

**Betreff:** Erinnerung: Größe für {{mannschaft}} bis {{frist}}
(bei der zweiten: „Letzte Erinnerung: …“)

Hallo {{vorname}},

für {{mannschaft}} fehlt noch deine Größe: {{arten}}.

Bitte trag sie bis {{frist}} ein. Noch {{tage}} Tage. Das dauert eine Minute.

[Größe jetzt eintragen] → {{groessen_link}}

*(erste)* Beflockte Sachen können nicht umgetauscht werden. Im Zweifel lieber eine Nummer größer.
*(zweite)* Das ist die letzte Erinnerung. Kommt bis zur Frist nichts, trägt deine Trainerin oder dein Trainer die Größe nach bestem Wissen ein.

Hast du sie schon eingetragen? Dann ist diese Mail unterwegs gewesen, bevor es ankam – dann ist alles gut.

Der Link gilt nur für dich. Bitte gib ihn nicht weiter – wer ihn hat, kann deine Größe ändern.

### Die Grenzen

Dies ist der einzige Mailweg in kitflow, den **kein Mensch auslöst**. Bei allem
anderen sitzt jemand davor und sieht, was rausgeht; hier läuft es abends durch.
Die Grenzen stehen deshalb alle an einer Stelle (`erinnerung.ts`) und sind
einzeln geprüft:

| | |
| --- | --- |
| **höchstens zwei** je Person und Vorgang | danach nie wieder, auch nicht nächste Woche |
| **mindestens drei Tage Abstand** | zur letzten Mail dieses Vorgangs, auch zur ersten Größen-Mail |
| **nie nach der Frist** | am Tag der Frist noch, danach nicht mehr |
| **nur, wer die erste Mail hatte** | sonst wäre die „Erinnerung“ die erste Ansprache und klänge wie ein Vorwurf |
| **nur auf Stufe 1** | danach ließe sich nichts mehr eintragen |
| **nur ohne Größe** | wer eingetragen hat, ist fertig |
| **umgeleitete Mails zählen nicht** | `MAIL_NUR_AN` legt sie in Kais Postfach, nicht in das des Spielers |

Datum **und** Restzeit stehen in der Mail: „Noch 10 Tage“ allein rechnet falsch,
sobald die Mail zwei Tage liegenbleibt; ein Datum allein sagt nicht, wie eilig
es ist. (Das fiel erst durch einen Test auf — die erste Fassung nannte die
Frist nur im Betreff.)

### Der Zeitgeber

Vercel Cron, täglich **16:00 UTC** = 18:00 Berlin im Sommer, 17:00 im Winter —
nach Feierabend, wenn Eltern ihr Postfach ansehen. Steht in `vercel.json`.

Die Adresse `/api/erinnerungen` **steht offen im Netz**; ein Zeitgeber ist kein
Zugangsschutz. Sie prüft `CRON_SECRET` selbst, in konstanter Zeit, und
antwortet **503 statt 200**, wenn das Geheimnis fehlt oder kürzer als 16 Zeichen
ist. Dieselbe Regel wie bei `LINK_SECRET` und `SPARTE_EMAILS`: eine Anwendung
ohne Schlüssel darf nicht offen stehen.

Der Lauf berichtet in **Zahlen**. Vorname und Adresse eines Kindes gehören in
die Mail und in kein Log (CLAUDE.md) — auch das ist geprüft.

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
