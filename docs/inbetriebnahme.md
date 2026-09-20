# Inbetriebnahme

Stand: 18.09.2026, nach der Freigabe-Kette und dem Mail-Rahmen.

**Alles hier kann nur Kai tun.** Vercel, Supabase, Resend, Telegram und Todoist
sind aus der Entwicklungsumgebung gesperrt (403 vom Proxy, Richtlinie — kein
Netzfehler). Ich kann bauen und prüfen, aber keinen dieser Dienste ein einziges
Mal wirklich aufrufen.

---

## Der Stand

**Gebaut, auf `main`, Prüfung grün:** die Datenbank und der Umzug, F1/F1b/F2/F3,
die Statusseite, der Login mit `/sparte`, Stufenwechsel und Größenfrist, die
Mails M0 bis M5 samt M4b, die Freigabe der Händleranfrage mit Telegram und
Todoist, und der tägliche Lauf für Erinnerungen und Größenliste.

**Läuft noch nicht**, weil die Variablen fehlen: der Login, der Erinnerungslauf,
die Händleranfrage und die Benachrichtigungen. Alle vier fallen *geschlossen*
aus — ohne Variable passiert nichts, statt dass alles offensteht. Das ist
Absicht, heißt aber auch: bis Schritt 2 durch ist, steht die Hälfte still.

| Vorgang | Kontakte | Größenfrist | Stufe |
| --- | --- | --- | --- |
| **AUS-2026-002** · Ü40 Team 3 | **26** | **20.09.** | Größen laufen |
| AUS-2026-001 · Ü40 Team 3 | 1 | 19.09. | Größen laufen |

AUS-2026-002 ist der echte Vorgang. AUS-2026-001 ist der Probelauf.

---

## Schritt 1 · Heute, weil die Frist übermorgen ist

### 1.1 Die Testbremse richtig herum stellen

`MAIL_NUR_AN` stand zuletzt **nur auf Production**. Das ist verkehrt herum: auf
der Produktion landet jede Mail bei dir, auf jeder Branch-Vorschau geht sie an
den echten Empfänger.

Vercel → kitflow → Settings → Environment Variables → `MAIL_NUR_AN`:
Haken bei **Production** raus, bei **Preview** und **Development** rein.

Willst du erst zusehen, lass sie noch auf Production und verschick einmal — dann
kommen 26 Mails zu dir und keine ins Team. **Umgeleitete Mails zählen nicht als
verschickt**, dieser Blick kostet dich also nichts.

### 1.2 Die Größenfrist verlängern

**Das ist der eigentliche Grund für die Eile.** Die Erinnerung braucht drei Tage
Abstand zur letzten Mail. Verschickst du heute, wäre die erste Erinnerung am
21.09. — die Frist ist der 20.09. **Für diesen Vorgang ginge damit nie eine
Erinnerung raus.**

Auf `/sparte`, Karte „Größenfrist ändern" — geht aber erst nach Schritt 2, weil
der Login sonst nicht läuft. Bis dahin im Supabase-SQL-Editor:

```sql
update vorgang set groessen_frist = '2026-09-30' where nummer = 'AUS-2026-002';
```

Mit dem 30.09. erinnert kitflow am 21.09. und ein zweites Mal am 24.09.

### 1.3 Die Größen-Mails verschicken

Statusseite zu AUS-2026-002 öffnen (Link steht in der M1-Mail) → Karte
„Größen-Mail verschicken" → anhaken → abschicken.

**25 von 26** haben eine Adresse. Ohne: nur **Daniel Klein** — seine Größen
trägst du über die Liste selbst ein (`/b/…`). Wer schon eine Mail hat, steht mit
Datum da und ist nicht vorausgewählt.

---

## Schritt 2 · Die Variablen und die Migrationen

### 2.1 Zwei Migrationen im SQL-Editor

Supabase → SQL Editor → Inhalt einfügen → Run. Beide sind wiederholbar, ein
zweiter Lauf schadet nicht.

| Datei | Was sie anlegt | Ohne sie |
| --- | --- | --- |
| `supabase/migrations/002_entwurf.sql` | `vorgang_entwurf` | jede Bedarfsmeldung an `/neu` scheitert |
| `supabase/migrations/20260918150000_freigabe.sql` | vier Spalten an `vorgang` | keine Freigabe möglich, die Anfrage bleibt liegen |
| `supabase/migrations/20260920080000_wappen.sql` | `vorgang.wappen_mit` | der Haken in F1 lässt sich nicht speichern |
| `supabase/migrations/20260920090000_bilder.sql` | `vorgang.sponsor_logo`, `vorgang_artikel.bild` | Sponsorlogo und Produktfotos lassen sich nicht hinterlegen |

**Alle vier sind wiederholbar**, und alle vier sind gegen ein echtes PostgreSQL
16 gelaufen, nicht nur geschrieben (`npm run test:db`).

### 2.1b Ein Eimer für die Bilder

Nur nötig, wenn du Sponsorlogo oder Produktfotos benutzen willst — ohne ihn
läuft alles andere unverändert.

Supabase → Storage → New bucket:

- Name **`kitflow`**
- **Public bucket: aus.** Das ist der ganze Punkt (docs/bilder.md).
- Policies braucht es keine: der Dienst-Schlüssel geht an RLS vorbei, wie bei
  den Tabellen.

Das **Vereinswappen** braucht den Eimer nicht. Es gehört als
`src/assets/wappen.png` ins Projekt und kommt per Bereitstellung mit; Maße
stehen in `src/assets/README.md`.

### 2.2 Die Variablen in Vercel

Settings → Environment Variables, alle für **Production, Preview und
Development**.

| Variable | Wert | wofür | fehlt sie |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → **anon public** | die Anmeldung | kein Login |
| `SPARTE_EMAILS` | deine Adresse und die von Sebastian, mit Komma | wer hinein darf | **niemand** kommt hinein |
| `CRON_SECRET` | 32 zufällige Zeichen | der tägliche Lauf | Lauf antwortet 503 |
| `HAENDLER` | siehe unten | die Angebotsanfrage | keine Anfrage, Vorgang bleibt liegen |
| `TELEGRAM_TOKEN` | vom BotFather | Freigabe-Meldung | keine Nachricht |
| `TELEGRAM_CHAT` | Chat- oder Gruppen-ID (bei Gruppen negativ) | dieselbe | keine Nachricht |
| `TODOIST_TOKEN` | Todoist → Einstellungen → Integrationen → Entwickler | Aufgabe je Freigabe | keine Aufgabe |
| `TODOIST_PROJEKT` | optional, Projekt-ID | wohin die Aufgabe geht | landet im Posteingang |

Format für `HAENDLER` — Firma`|`Ansprechpartner`|`Adresse, Händler mit Komma
getrennt:

```
HAENDLER=Intersport Uelzen|Herr Hillebrecht|<adresse>,11teamsports|Herr Bormann|<adresse>
```

Ein Geheimnis erzeugen:

```
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

**Fehlen Telegram und Todoist beide, funktioniert die Freigabe trotzdem** — sie
wartet dann still auf `/sparte`, statt sich zu melden. Der Ausfall steht im
Verlauf des Vorgangs, damit Stille nicht als „nichts zu tun" gelesen wird.

### 2.3 Zwei Einstellungen in Supabase

**Custom SMTP auf Resend.** Authentication → Emails → SMTP Settings. Ohne das
verschickt Supabase aus einer eigenen Domain und lässt nur **zwei Mails pro
Stunde** durch.

**Redirect-URL freigeben.** Authentication → URL Configuration → Redirect URLs:

```
https://kitflow-dun.vercel.app/auth/callback
```

Was nicht freigegeben ist, landet auf der Site-URL. Der Link „funktioniert" dann
scheinbar und meldet niemanden an — der Fehler, der am meisten Zeit kostet, weil
er wie ein Fehler im Code aussieht.

### 2.4 Neu bereitstellen

Env-Änderungen greifen **nur bei einem neuen Deployment**. Vercel → Deployments →
das oberste → „Redeploy". Ohne das trägt die Produktion weiter die alten Werte.

---

## Schritt 3 · Prüfen, dass es wirklich läuft

Fünf Proben. Jede hat eine **Gegenprobe** — ohne sie ist nur belegt, dass etwas
passiert, nicht dass die Grenze hält.

### 3.1 Anmeldung

1. `/anmelden` → deine Adresse → Mail kommt an?
2. Link öffnen → landet auf `/sparte`, die Liste steht da?
3. Abmelden → `/sparte` schickt wieder zur Anmeldung.
4. **Gegenprobe:** eine Adresse eintragen, die *nicht* in `SPARTE_EMAILS` steht.
   Es muss **dieselbe** Bestätigung erscheinen — und **keine** Mail ankommen.

Punkt 4 ist der wichtige: gäbe es eine andere Antwort, verriete die Seite, wer
in der Liste steht.

### 3.2 Erinnerungslauf

```
curl -H "Authorization: Bearer DEIN_CRON_SECRET" \
  https://kitflow-dun.vercel.app/api/erinnerungen
```

Erwartet: `{"ok":true,…}` mit **Zahlen, keinen Namen**.

**Gegenprobe ohne Kopfzeile** — muss `401` geben:

```
curl -i https://kitflow-dun.vercel.app/api/erinnerungen
```

Am selben Tag, an dem die Größen-Mails rausgingen, ist `verschickt` **0** (drei
Tage Abstand). Das ist richtig, kein Fehler.

### 3.3 Der ganze Weg an einer Person

Deinen eigenen Größen-Link öffnen, Größe eintragen, speichern, Link erneut
öffnen — steht alles noch da? Danach auf der Statusseite: „x von 26 eingetragen".

### 3.4 Die Freigabe — der Teil, der noch nie gelaufen ist

Am besten mit einem **Wegwerf-Vorgang** üben, nicht mit AUS-2026-002:

1. Über `/neu` einen Vorgang für **eine Person** anlegen (deine Adresse), mit
   einem erfundenen Artikel.
2. Größe eintragen, Liste über `/b/…` bestätigen.
3. Erwartet: die Seite sagt **„die Anfrage geht zur Freigabe"**, und es geht
   **keine** Mail an die Händler.
4. Telegram-Nachricht und Todoist-Aufgabe kommen an?
5. `/sparte` → Karte „Händleranfragen freigeben" → **Freigeben**.
6. Erwartet: M4 an die Händler (mit `MAIL_NUR_AN` an dich), M5 an dich als
   Trainer, Stufe wandert auf „Anfrage raus".
7. **Sieh dir die CSV im Anhang an.** Dort darf **kein einziger Name** stehen —
   nur Artikel, Größe, Stück, Nummer, Initialen.

**Gegenprobe 1:** einen zweiten Wegwerf-Vorgang bis zur Freigabe bringen und
dort **Stoppen** mit einem Grund. Erwartet: keine Händlermail, stattdessen M4b an
dich mit dem Grund im Text.

**Gegenprobe 2:** einen dritten anlegen und die Liste bestätigen, **ohne eine
Größe einzutragen**. Erwartet: „Liste bestätigt – aber es fehlen alle Größen",
keine Telegram-Nachricht, keine Todoist-Aufgabe, keine Karte auf `/sparte`. Das
ist der Fall, der vorher eine Freigabe erzeugt hat, die niemand erteilen
konnte.

Danach beide Wegwerf-Vorgänge auf `/sparte` **abbrechen** und das Nachlesen nicht
vergessen.

### 3.5 Die Bilder, falls du den Eimer angelegt hast

Auf der Statusseite deines Wegwerf-Vorgangs steht jetzt eine Karte **Bilder**.

1. Ein Produktfoto zu einem Artikel hochladen → die Vorschau daneben zeigt es
   sofort.
2. **Gegenprobe:** eine PDF-Datei in `.png` umbenennen und hochladen. Erwartet:
   „Nur PNG, JPEG oder WebP." Gemessen wird der Inhalt, nicht der Name.
3. Deinen eigenen Größen-Link öffnen → das Foto steht über den Größenfeldern.
4. **Gegenprobe:** denselben Link ohne den `t=`-Teil aufrufen. Erwartet: nichts,
   auch kein Bild.
5. Ein Sponsorlogo hochladen, freigeben, und in der Händlermail nachsehen: der
   Anhang heißt `AUS-…_Sponsorlogo.png`, und im Text steht die Bitte, das Format
   zu bestätigen. **Druckmaße stehen bewusst nicht drin** — die sind mit Bormann
   und Hillebrecht nicht abgestimmt.

### 3.6 AUS-2026-001 aufräumen

Der Probelauf mit einem Kontakt steht noch auf „Größen laufen" und taucht in
jeder Übersicht auf. Auf `/sparte` auf **Abgebrochen** setzen — dann ist er aus
dem Weg, ohne gelöscht zu sein.

---

## Schritt 4 · Der echte Durchlauf

Erst wenn Schritt 3 sitzt. AUS-2026-002 läuft bis zur verlängerten Frist, du
trägst Daniel Kleins Größe nach, bestätigst die Liste, gibst frei — und die
Anfrage geht an Bormann und Hillebrecht.

**Vorher zwei Dinge klären**, beide nicht technisch:

- **Reden die Händler über eine Voranfrage?** Ob Bormann und Hillebrecht auf
  eine Anfrage ohne Personenzeilen überhaupt antworten, weiß niemand. Das ist
  ein Gespräch, kein Code (docs/offen.md).
- **Die Beflockung bestätigen.** Der Standardtext steht in `vorgaenge.ts`; er
  geht so in jede Anfrage.

---

## Danach, in dieser Reihenfolge

Nichts davon ist dringend, und nichts davon fange ich ohne dein Wort an.

| | |
| --- | --- |
| **Freigabe automatisch** | die Naht steht (`freigabeWeg`), die Regel nicht. Die offenen Fragen — ab welchem Betrag? Jugend anders? was bei lückenhafter Liste? — stehen in docs/freigabe.md |
| **`Anfrage_Vorlage.xlsx`** | ersetzt die CSV im Anhang durch die Vorlage, die die Händler kennen |
| **M7 · keine Spieler gefunden** | steht heute auf der Seite; eine Mail wäre für den, der sie zu früh schließt |
| **Vereinswappen in den Mails** | **gebaut** (Migration 005). Fehlt nur noch die Datei `src/assets/wappen.png` |
| **Bilder** | **gebaut** (Migration 006, docs/bilder.md): Sponsorlogo an M4, Produktfotos in der Größenabfrage. Verkleinert wird nicht — dafür eine harte Grenze bei 2 MB |
| **Frist für die Sponsorensuche** | Stufe 0 hat noch keinen Wecker |
| **Zwei lose HubSpot-Kontakte** | `kai.boehm@eintrachtmunster.de` ohne Name und Funktion, zweiter „Kai Böhm" unter `fussball@eintrachtmunster.de` |

---

## Wenn etwas nicht geht

| Symptom | fast immer |
| --- | --- |
| Anmeldeseite sagt „nicht eingerichtet" | `NEXT_PUBLIC_SUPABASE_ANON_KEY` fehlt oder kein Redeploy |
| Link aus der Mail meldet niemanden an | Redirect-URL in Supabase nicht freigegeben (2.3) |
| `/sparte` schickt dich sofort zurück | deine Adresse steht nicht in `SPARTE_EMAILS` — Groß-/Kleinschreibung ist egal, ein Tippfehler nicht |
| Erinnerungslauf gibt 503 | `CRON_SECRET` fehlt oder ist kürzer als 16 Zeichen |
| Erinnerungslauf gibt 401 | falsches Geheimnis im `Authorization`-Kopf |
| `verschickt: 0`, obwohl Leute fehlen | richtig, wenn: keine drei Tage Abstand, Frist vorbei, oder die erste Größen-Mail ging nie raus |
| Mails kommen bei dir statt beim Team | `MAIL_NUR_AN` steht noch auf Production (1.1) |
| Bestätigen sagt „die Anfrage schickt die Spartenleitung raus" | `HAENDLER` fehlt — es wird gar keine Freigabe erbeten, weil es nichts freizugeben gäbe |
| Freigabe-Karte erscheint nicht auf `/sparte` | Migration 004 fehlt, oder kein Vorgang steht auf „offen" |
| Keine Telegram-Nachricht, Freigabe aber da | genau so gebaut. Der Grund steht im Verlauf des Vorgangs |
| Statusseite meldet eine Störung | Supabase oder HubSpot antwortet nicht — kitflow sagt das, statt „gibt es nicht" zu behaupten |

---

## Was in dieser Umgebung nie geprüft werden konnte

Damit niemand später denkt, es sei geprüft gewesen:

| | |
| --- | --- |
| **Resend** | der Mailversand ist nie wirklich gelaufen. Ob hubsport.club verifiziert ist, entscheidet sich beim ersten Absenden |
| **Telegram und Todoist** | nie aufgerufen. Ob Token und Chat-ID stimmen, zeigt erst Schritt 3.4 |
| **Supabase Storage** | nie aufgerufen. Ob der Eimer `kitflow` so heißt und der Dienst-Schlüssel darauf schreiben darf, zeigt Schritt 3.5 |
| **Das Inline-Wappen** | ob Resend das Feld `content_id` so annimmt, ist nicht nachprüfbar. Deshalb steht das Wappen neben dem Vereinsnamen: fällt es aus, fehlt ein Bild und nicht der Absender |
| **Supabase über HTTP** | nur gegen ein lokales Postgres und ein echtes PostgREST geprüft, nie gegen das echte Projekt |
| **Outlook und Apple Mail** | die Mails sind in Chromium angesehen. VML-Knopf und Dunkelmodus sind nach Regeln gebaut, nicht in den echten Programmen gesehen |
