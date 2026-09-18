# Inbetriebnahme

Stand: 18.09.2026. Was noch zu tun ist, in der Reihenfolge, in der es Sinn ergibt.

Alles, was hier steht, kann nur Kai tun: Vercel, Supabase und die Vercel-Adressen
sind aus der Entwicklungsumgebung gesperrt (403 vom Proxy).

---

## Teil 0 · Der Stand, gelesen am 18.09. um 10 Uhr

Aus den Deal-Spiegeln in HubSpot:

| Vorgang | Kontakte | Größenfrist | Stufe |
| --- | --- | --- | --- |
| **AUS-2026-002** · Ü40 Team 3 | **26** | **20.09.** | Größen laufen |
| AUS-2026-001 · Ü40 Team 3 | 1 | 19.09. | Größen laufen |

**AUS-2026-002 ist der echte Vorgang.** AUS-2026-001 hat nur einen Kontakt und
ist der Probelauf von 08:54.

Gebaut und auf `main`, Prüfung grün: die Datenbank, der Umzug, F1/F1b/F2/F3, die
Statusseite, M1, M2a (Größen-Mail je Person), der Login mit `/sparte`, der
Stufenwechsel und M2 (die tägliche Erinnerung).

---

## Teil 1 · Zuerst: der laufende Vorgang hat eine Frist in zwei Tagen

### 1.1 Entscheide über die Testbremse

`MAIL_NUR_AN` steht nach deinem Screenshot **nur auf Production**. Das heißt:

- auf **kitflow-dun.vercel.app** landet jede Mail bei dir
- auf jeder **Branch-Vorschau** geht sie an den echten Empfänger

Das ist genau verkehrt herum. Vercel → Projekt kitflow → Settings →
Environment Variables → `MAIL_NUR_AN`:

1. Haken bei **Production** raus
2. Haken bei **Preview** und **Development** rein (Wert bleibt deine Adresse)

Willst du erst zusehen, lass sie noch auf Production und verschick einmal — dann
kommen 26 Mails zu dir und keine ins Team. **Umgeleitete Mails zählen nicht als
verschickt**, dieser Blick kostet dich also nichts.

### 1.2 Neu bereitstellen

Env-Änderungen greifen **nur bei einem neuen Deployment**. Vercel → Deployments →
das oberste → „Redeploy". Ohne das trägt die laufende Produktion weiter den
alten Wert.

### 1.3 Die Größen-Mails verschicken

Deine Statusseite zu AUS-2026-002 öffnen (der Link steht in der M1-Mail zu
diesem Vorgang) → Karte „Größen-Mail verschicken" → anhaken → abschicken.

- **25 von 26** haben eine Adresse. Ohne: nur noch **Daniel Klein** — seine
  Größen trägst du über die Liste selbst ein (`/b/…`).
- Wer schon eine Mail hat, steht mit Datum da und ist nicht vorausgewählt.

### 1.4 Wichtig: die Frist reicht für keine Erinnerung

Die Erinnerung braucht **drei Tage Abstand** zur letzten Mail. Verschickst du
heute (18.09.), wäre die erste Erinnerung am 21.09. — die Frist ist aber der
20.09. **Für diesen Vorgang geht damit nie eine Erinnerung raus.**

Zwei Wege:

- **Frist verlängern** auf z. B. den 30.09. Dann erinnert kitflow am 21.09. und
  ein zweites Mal am 24.09.
- **So lassen** und in zwei Tagen selbst nachhaken.

**Verlängern geht auf `/sparte`**, Karte „Größenfrist ändern" (seit 18.09.).
Vorgang wählen, Datum wählen, „Setzen". Angeboten werden nur Vorgänge, bei
denen gerade Größen gesammelt werden.

Ohne Anmeldung ginge es auch im Supabase-SQL-Editor:

```sql
update vorgang set groessen_frist = '2026-09-30' where nummer = 'AUS-2026-002';
```

### 1.5 AUS-2026-001 aufräumen

Der Probelauf mit einem Kontakt steht noch auf „Größen laufen" und taucht in
jeder Übersicht auf. Auf `/sparte` (sobald der Login läuft, Teil 2) auf
**Abgebrochen** setzen — dann ist er aus dem Weg, ohne gelöscht zu sein.

---

## Teil 2 · Die vier Variablen und zwei Einstellungen

### 2.1 In Vercel anlegen

Settings → Environment Variables. Alle drei für **Production, Preview und
Development**.

| Variable | Wert | wofür |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → **anon public** | die Anmeldung. Darf in den Browser, anders als der Dienst-Schlüssel |
| `SPARTE_EMAILS` | deine Adresse und die von Sebastian Hebisch, mit Komma getrennt | wer sich anmelden darf |
| `CRON_SECRET` | 32 zufällige Zeichen, siehe unten | der tägliche Erinnerungslauf |

Ein Geheimnis erzeugen:

```
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

**Fehlt eine davon, ist das kein stiller Ausfall**: ohne `SPARTE_EMAILS` kommt
niemand hinein (nicht: jeder), ohne `CRON_SECRET` antwortet der Lauf 503 (nicht:
200). Das ist Absicht — aber es heißt auch, dass nichts passiert, bis sie da sind.

### 2.1b Die Migration 002 einmal laufen lassen

**Neu und nötig**, sonst scheitert jede Bedarfsmeldung. Supabase → SQL Editor →
den Inhalt von `supabase/migrations/002_entwurf.sql` einfügen → Run.

Sie legt die Tabelle `vorgang_entwurf` an. Darin parkt kitflow eine
Bedarfsmeldung, bis der Trainer sie per Mail bestätigt — ohne die Tabelle
entsteht kein Vorgang mehr.

### 2.2 In Supabase einrichten

**Custom SMTP auf Resend.** Authentication → Emails → SMTP Settings. Ohne das
verschickt Supabase aus einer eigenen Domain und lässt nur **zwei Mails pro
Stunde** durch — bei zwei Personen reicht das gerade, aber die Mail sieht nicht
nach kitflow aus.

**Redirect-URL freigeben.** Authentication → URL Configuration → Redirect URLs:

```
https://kitflow-dun.vercel.app/auth/callback
```

Was nicht freigegeben ist, landet auf der Site-URL. Der Link „funktioniert"
dann scheinbar und meldet niemanden an — das ist der Fehler, der am meisten
Zeit kostet, weil er wie ein Fehler im Code aussieht.

### 2.3 Noch einmal neu bereitstellen

Wieder: Env-Änderungen greifen erst beim nächsten Deployment.

---

## Teil 3 · Prüfen, dass es wirklich läuft

### 3.1 Anmeldung

1. `https://kitflow-dun.vercel.app/anmelden` → deine Adresse → Mail kommt an?
2. Link öffnen → landet auf `/sparte`, die Liste steht da?
3. Eine Stufe setzen → steht sie in der Liste, im Verlauf des Vorgangs **und**
   am Deal in HubSpot?
4. Abmelden → `/sparte` schickt wieder zur Anmeldung.
5. **Gegenprobe**: eine Adresse eintragen, die *nicht* in `SPARTE_EMAILS` steht.
   Es muss dieselbe Bestätigung erscheinen — und **keine** Mail ankommen.

Punkt 5 ist der wichtige. Ohne ihn ist nicht belegt, dass die Liste etwas tut.

### 3.2 Erinnerungslauf

Nicht auf den Abend warten, sondern von Hand anstoßen:

```
curl -H "Authorization: Bearer DEIN_CRON_SECRET" \
  https://kitflow-dun.vercel.app/api/erinnerungen
```

Erwartet: `{"ok":true,"vorgaenge":…,"verschickt":…}` mit **Zahlen, keinen Namen**.

**Gegenprobe ohne Kopfzeile** — muss `401` geben:

```
curl -i https://kitflow-dun.vercel.app/api/erinnerungen
```

Am selben Tag, an dem die Größen-Mails rausgingen, ist `verschickt` **0** (drei
Tage Abstand). Das ist richtig so, kein Fehler.

### 3.3 Der ganze Weg an einer Person

Deinen eigenen Größen-Link öffnen, Größe eintragen, speichern, Link erneut
öffnen — steht alles noch da? Danach auf der Statusseite: „x von 26 eingetragen".

---

## Teil 4 · Was danach ansteht

Nichts davon ist dringend, und nichts davon fange ich ohne dein Wort an.

| | |
| --- | --- |
| **M3 · Größenliste zum Prüfen** | die Mail an den Trainer, wenn alle eingetragen haben |
| **M4 · Anfrage an die Händler** | **bleibt ungebaut bis zu deiner ausdrücklichen Freigabe** |
| **Foto-Upload** | meine Empfehlung: harte Größengrenze *und* serverseitig verkleinern, nur Trainer, erst nach dem echten Durchlauf |
| **Frist für die Sponsorensuche** | Stufe 0 hat noch keinen Wecker (docs/offen.md) |
| **Zwei lose HubSpot-Kontakte** | `kai.boehm@eintrachtmunster.de` ohne Name und Funktion, zweiter „Kai Böhm" unter `fussball@eintrachtmunster.de` |

---

## Wenn etwas nicht geht

| Symptom | fast immer |
| --- | --- |
| Anmeldeseite sagt „nicht eingerichtet" | `NEXT_PUBLIC_SUPABASE_ANON_KEY` fehlt oder kein Redeploy |
| Link aus der Mail meldet niemanden an | Redirect-URL in Supabase nicht freigegeben (2.2) |
| `/sparte` schickt dich sofort zurück | deine Adresse steht nicht in `SPARTE_EMAILS`, oder Groß-/Kleinschreibung — die ist egal, aber ein Tippfehler nicht |
| Erinnerungslauf gibt 503 | `CRON_SECRET` fehlt oder ist kürzer als 16 Zeichen |
| Erinnerungslauf gibt 401 | falsches Geheimnis im `Authorization`-Kopf |
| `verschickt: 0`, obwohl Leute fehlen | richtig, wenn: keine drei Tage Abstand, Frist vorbei, oder die erste Größen-Mail ging nie raus |
| Mails kommen bei dir statt beim Team | `MAIL_NUR_AN` steht noch auf Production (1.1) |
| Statusseite meldet eine Störung | Supabase oder HubSpot antwortet nicht — kitflow sagt das, statt „gibt es nicht" zu behaupten |
