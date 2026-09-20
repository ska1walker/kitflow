# kitflow selbst testen

Stand 20.09.2026

Sieben Szenarien. Jedes hat einen **Ausgangspunkt**, ein **Erwartet** und — wo es
zählt — eine **Gegenprobe**. Die Gegenprobe ist der wichtigere Teil: dass etwas
passiert, beweist wenig. Dass die Grenze hält, beweist viel.

Reihenfolge ist nicht beliebig. 1 ist Voraussetzung für alles, 4 ist der Teil,
der noch nie gelaufen ist.

**Fahr das mit Wegwerf-Vorgängen**, nicht mit AUS-2026-002. Am Ende steht, wie
du sie wieder los wirst.

---

## Vorher: die Bremse prüfen

`MAIL_NUR_AN` leitet jede Mail an eine Adresse um. **Sieh in Vercel nach, dass
sie gesetzt ist und deine Adresse trägt**, bevor du irgendetwas abschickst.
Solange sie steht, kann kein Testlauf 26 Leute erreichen.

Umgeleitete Mails zählen nicht als verschickt — du kannst also gefahrlos
zusehen, ohne dass später die echte Erinnerung ausbleibt.

---

## 1 · Anmeldung

Ohne die kommst du nicht auf `/sparte`, und damit geht Szenario 4 nicht.

1. `/anmelden` öffnen, deine Adresse eintragen.
2. Mail kommt an, Link öffnen.
3. Du landest auf `/sparte` und siehst die Liste.
4. Abmelden. `/sparte` schickt dich wieder zur Anmeldung.

**Gegenprobe — die wichtigere Hälfte:** trag eine Adresse ein, die *nicht* in
`SPARTE_EMAILS` steht.

> **Erwartet:** exakt dieselbe Bestätigung wie bei deiner eigenen Adresse, und
> es kommt **keine** Mail an.

Gäbe es eine andere Antwort, verriete die Seite, wer in der Liste steht.

**Wenn der Link ankommt, dich aber nicht anmeldet:** die Redirect-URL ist in
Supabase nicht freigegeben. Das ist der Fehler, der am meisten Zeit kostet, weil
er wie ein Fehler im Code aussieht.

---

## 2 · Ein Vorgang von vorn

1. `/neu` öffnen, „Komplett melden".
2. Deine Adresse, Mannschaft **ZZ Testteam** (oder eine echte, wenn du auch die
   Kontaktsuche prüfen willst), ein erfundener Artikel.
3. Häkchen bei **Initialen** und bei **Vereinswappen** setzen.
4. Abschicken.

> **Erwartet:** die Seite sagt, dass eine Bestätigungsmail unterwegs ist. **Es
> ist noch nichts angelegt.** In der Übersicht auf `/sparte` steht nichts Neues.

5. Die Mail öffnen, auf den Bestätigungslink klicken.

> **Erwartet:** jetzt gibt es den Vorgang, und du bekommst M1 mit deinen Links.

**Gegenprobe A:** trag eine Adresse ein, die in HubSpot niemandem gehört.

> **Erwartet:** „nicht gefunden" — und es entsteht **nichts**, auch kein Entwurf,
> der später auftaucht.

**Gegenprobe B:** schick das Formular ein zweites Mal ab, klick aber die erste
Mail nicht an.

> **Erwartet:** zwei Entwürfe, **null** Vorgänge. Ein Entwurf ist kein Vorgang.

---

## 3 · Der ganze Weg an einer Person

1. Deinen eigenen Größen-Link aus M1 öffnen.

> **Erwartet:** dein Vorname steht da, **kein anderer Name**. Gefragt wird genau
> die Größenart deines Artikels — nicht alle sechs. Das Pflichtfeld *Initialen*
> ist da, höchstens drei Zeichen.

2. Größe und Initialen eintragen, speichern.
3. Denselben Link erneut öffnen.

> **Erwartet:** alles steht noch da.

4. Statusseite `/v/…` öffnen.

> **Erwartet:** „1 von n eingetragen", Artikel, Frist.

**Gegenprobe A:** häng an den Größen-Link eine **fremde** Personen-ID (ändere
die Zahl im Pfad), lass den Token stehen.

> **Erwartet:** nichts. Der Token gilt für eine Person, nicht für den Vorgang.

**Gegenprobe B:** ruf denselben Link **ohne** den `?t=`-Teil auf.

> **Erwartet:** dieselbe Antwort wie bei einem Vorgang, den es nicht gibt. Die
> Seite verrät nicht einmal, ob es ihn gibt.

---

## 4 · Die Freigabe — der Teil, der noch nie gelaufen ist

Hier beweisen sich Telegram und Todoist zum ersten Mal.

1. Liste über `/b/…` bestätigen.

> **Erwartet:** die Seite sagt **„die Anfrage geht zur Freigabe"**. Es geht
> **keine** Mail an die Händler.

2. Telegram und Todoist ansehen.

> **Erwartet:** eine Nachricht und eine Aufgabe. Kommt die Todoist-Aufgabe im
> **Posteingang** statt im Projekt an, ist das richtig so — `TODOIST_PROJEKT`
> ist beim ersten Lauf absichtlich leer, damit ein Fehlschlag unterscheidbar
> bleibt: Token falsch oder Projekt-ID falsch.

3. `/sparte` → Karte „Händleranfragen freigeben" → **Freigeben**.

> **Erwartet:** M4 an die Händler (bei dir, wegen der Bremse), M5 an dich als
> Trainer, Stufe wandert auf „Anfrage raus".

4. **Sieh dir die CSV im Anhang an.**

> **Erwartet:** **kein einziger Name.** Nur Artikel, Größe, Stück, Nummer,
> Initialen. Das ist die Auflage, unter der M4 überhaupt gebaut wurde.

5. Im Kopf der Mail: steht das Wappen da? (Nur wenn du die Datei
   `src/assets/wappen.png` hinterlegt hast — sonst steht dort die Wortmarke, und
   das ist kein Fehler.)

**Gegenprobe A — Stoppen:** zweiter Wegwerf-Vorgang bis zur Freigabe, dort
**Stoppen** mit einem Grund.

> **Erwartet:** keine Händlermail. Stattdessen M4b an dich, mit deinem Grund
> **wörtlich** im Text.

**Gegenprobe B — leere Liste:** dritter Vorgang, Liste bestätigen, **ohne eine
einzige Größe einzutragen**.

> **Erwartet:** „Liste bestätigt – aber es fehlen alle Größen". **Keine**
> Telegram-Nachricht, **keine** Todoist-Aufgabe, **keine** Karte auf `/sparte`.

Das ist der Fall, der vorher eine Freigabe erzeugt hat, die niemand erteilen
konnte.

**Gegenprobe C — abgebrochener Vorgang (neu, 20.09.):** vierter Vorgang, Liste
bestätigen, dann auf `/sparte` die Stufe von Hand auf **Abgebrochen** setzen.

> **Erwartet:** die Freigabe-Karte **verschwindet**. Lädst du die Seite vorher
> nicht neu und klickst trotzdem: „sammelt keine Größen mehr … es geht nichts an
> die Händler raus."

Genau das ging bis zum 20.09. schief: ein Klick auf die stehengebliebene Karte
hätte M4 verschickt und den abgebrochenen Vorgang wiederbelebt.

---

## 5 · Der tägliche Lauf

```
curl -H "Authorization: Bearer DEIN_CRON_SECRET" \
  https://kitflow-dun.vercel.app/api/erinnerungen
```

> **Erwartet:** `{"ok":true,…}` mit **Zahlen, keinen Namen.**

**Gegenprobe:** derselbe Aufruf ohne die Kopfzeile.

> **Erwartet:** `401`.

Am selben Tag, an dem die Größen-Mails rausgingen, ist `verschickt` **0** — drei
Tage Abstand. Das ist richtig, kein Fehler.

---

## 6 · Bilder

Nur, wenn du den Eimer `kitflow` angelegt hast (docs/bilder.md). Ohne ihn läuft
alles andere unverändert.

1. Statusseite deines Wegwerf-Vorgangs → Karte **Bilder**.
2. Ein Produktfoto zu einem Artikel hochladen.

> **Erwartet:** die Vorschau daneben zeigt es **sofort** — nicht erst nach einem
> Neuladen.

3. Deinen eigenen Größen-Link öffnen.

> **Erwartet:** das Foto steht über den Größenfeldern.

4. Ein Sponsorlogo hochladen, freigeben, Händlermail ansehen.

> **Erwartet:** ein Anhang `AUS-…_Sponsorlogo.png` und im Text die Bitte, das
> Format zu bestätigen. **Druckmaße stehen bewusst nicht drin** — die sind mit
> Bormann und Hillebrecht nicht abgestimmt.

**Gegenprobe A:** benenne eine PDF-Datei in `.png` um und lade sie hoch.

> **Erwartet:** „Nur PNG, JPEG oder WebP." Gemessen wird der Inhalt, nicht der
> Name.

**Gegenprobe B:** nimm ein Handyfoto, ungefähr 4 MB.

> **Erwartet:** „Das Bild ist zu groß" **schon bevor du auf Hochladen drückst**,
> und der Knopf ist gesperrt. Die Seite bleibt heil.

**Gegenprobe C:** kopier die Bildadresse aus der Seite und ruf sie **ohne** den
`token=`-Teil auf.

> **Erwartet:** 404. Kein Bild, und auch keine Auskunft darüber, ob es eins gibt.

---

## 7 · Aufräumen

Jeden Wegwerf-Vorgang auf `/sparte` auf **Abgebrochen** setzen. Er ist dann aus
dem Weg, ohne gelöscht zu sein — der Verlauf bleibt lesbar, falls du später
nachsehen willst, was passiert ist.

**Das gilt auch für AUS-2026-001**, den Probelauf mit einem Kontakt. Der steht
noch auf „Größen laufen" und taucht in jeder Übersicht auf.

**Was in HubSpot zurückbleibt:** die Deals, die der Spiegel angelegt hat. Die
sind nur Sicht; archivier sie im CRM, wenn sie dich stören.

**Was am Kontakt zurückbleibt:** die Größen, die du in Szenario 3 eingetragen
hast. Die gehören der Person, nicht dem Vorgang — die bleiben mit Absicht
stehen.

---

## Was du dabei nicht prüfst

Damit es niemand später für geprüft hält:

| | |
|---|---|
| **Outlook und Apple Mail** | die Mails sind in Chromium angesehen. Wenn du eine an dich selbst weiterleitest und in Outlook öffnest, weißt du mehr als ich |
| **Die echten Händler** | ob Bormann und Hillebrecht auf eine Anfrage in dieser Form antworten, entscheidet kein Test, sondern ein Gespräch |
| **Last** | 26 Personen sind kein Lasttest, und das ist auch nie die Frage gewesen |

---

## Für mich: dieselben Wege automatisch

Vieles davon läuft hier schon als Browser-Lauf, gegen echtes Postgres, echtes
PostgREST und Attrappen für Ablage und HubSpot:

```
bash scripts/db-testumgebung.sh
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3344
export HUBSPOT_BASIS=http://127.0.0.1:3346
export LINK_SECRET=zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz
npm run build && npx next start -p 3100
npm run test:ui      # 22 Pruefungen: die Bilder-Karte
npm run test:kette   # 16 Pruefungen: F2 und F3
```

**Das echte CRM wird dabei nie angefasst.** Eine Prüfung der Oberfläche hat dort
nichts herumzuschreiben — eine Testmannschaft anzulegen und wieder zu löschen
wäre jedes Mal eine Gelegenheit, etwas Echtes zu erwischen.

Nicht Teil der PR-Prüfung: die bleibt netzfrei.
