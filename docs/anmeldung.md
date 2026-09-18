# Anmeldung der Spartenleitung

Stand: 18.09.2026. Schritt 3 des Programms (siehe docs/konzept.md).

kitflow hat für Trainer, Spieler und Eltern **keinen** Login und soll auch keinen
bekommen. Sie weisen sich über einen signierten Link aus (`src/lib/links.ts`), und
jede dieser Seiten zeigt genau einen Vorgang.

`/sparte` ist der eine Fall, der anders liegt: die Seite zeigt **alle** Vorgänge —
jede Mannschaft, jede Frist, jeden Betrag — und darf die Stufe von Hand setzen.
Dafür gibt es eine echte Anmeldung.

## Verfahren

Supabase Auth, Magic Link, passwortlos — dasselbe Verfahren wie bei coachbase.

```
/anmelden  →  Adresse eintragen  →  Supabase schickt einen Link
           →  /auth/callback     →  Sitzung im Cookie  →  /sparte
```

| Datei | Aufgabe |
| --- | --- |
| `src/lib/sparte.ts` | **Die Regel**: wer auf der Liste steht. Ohne Netz, ohne Next. |
| `src/lib/anmeldung.ts` | Die Datenschicht: Client, `angemeldet()`, `spartenLeitung()`. |
| `src/proxy.ts` | Sitzung auffrischen, Unangemeldete umleiten. **Optimistisch.** |
| `src/app/anmelden/` | Seite und Server Action „Link anfordern“. |
| `src/app/auth/callback/route.ts` | Rückweg aus der Mail, beide Spielarten. |
| `src/app/sparte/` | Übersicht und Stufenwechsel. |

## Zwei Prüfungen, und nur eine zählt

Die Next-Doku nennt die Prüfung im `proxy` ausdrücklich **optimistisch**
(`node_modules/next/dist/docs/01-app/02-guides/authentication.md`) und sagt im
selben Atemzug, sie dürfe nicht die einzige sein. So ist es hier gebaut:

- Der `proxy` liest die Sitzung, frischt sie auf und schickt Unangemeldete
  gleich weiter. Er spart einen Klick. **Löschte man ihn, wäre kitflow langsamer
  und unbequemer — aber nicht offen.**
- Die echte Prüfung ist `spartenLeitung()` und steht in der Seite **und** in
  jeder Server Action. Eine Server Action ist eine eigene Adresse und lässt sich
  ohne die Seite aufrufen; der `proxy` sieht davon nichts.

Dieselbe Disziplin gilt bei den signierten Links seit jeher: „Jede Server Action
prüft das Token selbst.“

`getUser()` und nicht `getSession()`: nur `getUser()` lässt das Cookie vom
Auth-Server prüfen. Ein Cookie kann jeder schreiben.

## Wer hinein darf

`SPARTE_EMAILS`, Komma getrennt. Groß- und Kleinschreibung ist egal, Leerzeichen
auch.

**Ein Konto in Supabase allein reicht nie.** Die Liste entscheidet, und sie wird
an zwei Stellen geprüft: im `proxy` und im Rückweg aus der Mail — wer sich ein
Konto verschafft hat, wird dort wieder abgemeldet.

**Fehlt die Variable, kommt niemand hinein.** Nicht: jeder. Das ist dieselbe
Regel wie bei `LINK_SECRET` — eine Anwendung ohne Schlüssel darf nicht offen
stehen. Acht Prüfungen in `src/lib/sparte.test.ts` halten das fest, darunter der
Fall „`SPARTE_EMAILS=alle`“: ein Eintrag ohne `@` ist kein Freibrief, sondern ein
Tippfehler.

## Der Stufenwechsel

Seit dem Umzug leben die Vorgänge in der eigenen Datenbank, und der Deal in
HubSpot ist nur noch ein dünner Spiegel, der **nie zurückgelesen** wird. Eine
Stufe, die jemand in HubSpot verschiebt, kommt nicht mehr bei kitflow an — vorher
ging das.

Die Karte „Stufe von Hand setzen“ unter der Liste ist der Ausgleich dafür. Sie
liegt bewusst nicht in jeder Zeile: das ist ein Werkzeug für den Ausnahmefall.
Der Verlauf hält fest, **wer** es war (`sub` am Ereignis, `intern`) — der Sinn
des Logins ist ja, dass es nicht mehr anonym passiert.

## Die Größenfrist ändern

Zweite Karte auf `/sparte`, aus demselben Grund wie der Stufenwechsel: es gab
keine Stelle dafür. F1 setzt die Frist beim Anlegen, F1b beim Vervollständigen
einer Voranfrage — danach stand sie fest.

Aufgefallen ist das an einem echten Vorgang: seine Frist lag zwei Tage voraus,
und der Erinnerungslauf verlangt drei Tage Abstand zur letzten Mail. Es wäre
also nie eine Erinnerung rausgegangen, ohne dass jemand es gemerkt hätte.
Verlängern ist deshalb keine Kosmetik — es entscheidet, ob überhaupt erinnert
wird.

Angeboten wird sie nur für Vorgänge auf Stufe 1. Ein Datum mehr als zwei Jahre
voraus gilt als Vertipper (`2206` statt `2026`) und wird abgewiesen; eine Frist
in der Vergangenheit ist erlaubt — man korrigiert damit einen Tippfehler —, und
die Rückmeldung sagt dazu, dass danach keine Erinnerung mehr rausgeht.

## Was in Supabase eingerichtet sein muss

1. **Custom SMTP auf Resend.** Ohne das verschickt Supabase aus einer eigenen
   Domain und lässt nur zwei Mails pro Stunde durch. Authentication → Emails →
   SMTP Settings, Absender wie bei den übrigen kitflow-Mails.
2. **Redirect-URLs freigeben.** Authentication → URL Configuration:
   `https://<domain>/auth/callback`, für die Vorschau zusätzlich die
   Vercel-Adresse. Was nicht freigegeben ist, landet auf der Site-URL — der Link
   „funktioniert“ dann scheinbar und meldet niemanden an.
3. **Keine Selbstregistrierung nötig.** Die Konten entstehen beim ersten
   Anmeldelink. Wer nicht auf `SPARTE_EMAILS` steht, bekommt gar keinen.

## Umgebungsvariablen

| | |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | war schon da (Datenbank) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **neu**, öffentlicher Schlüssel, darf in den Browser |
| `SPARTE_EMAILS` | **neu**, die Liste |
| `KITFLOW_BASIS` | für den Rückweg; fehlt sie, nimmt kitflow `VERCEL_URL` |

## Was geprüft ist — und was nicht

**Geprüft, ohne Netz** (`npm test`): die Regel selbst in neun Fällen, darunter
fehlende und kaputte Liste; der Stufenwechsel in fünfzehn, darunter „ohne
Anmeldung wird nichts geschrieben“, „eine Störung ist kein unbekannter Vorgang“
und „eine Stufe, die es nicht gibt“. Jede dieser Prüfungen einmal gegen eine
absichtlich gebrochene Fassung gehalten.

**Geprüft im Browser** (`npm run test:browser`): `/sparte` gibt ohne Anmeldung
nichts her — auch dann nicht, wenn die Anmeldung gar nicht eingerichtet ist —,
`/auth/callback` legt ohne gültiges Token keine Sitzung an, und die
Anmeldeseite sagt Trainern, dass sie kein Konto brauchen.

**Nicht geprüft: der Weg mit gültiger Sitzung.** Ein echter Magic Link braucht
eine echte Supabase, und `*.supabase.co` ist aus der Bauumgebung gesperrt (403
vom Proxy). Der erste Durchlauf muss auf Vercel stattfinden:

1. `/anmelden` mit einer Adresse aus `SPARTE_EMAILS` → Mail kommt an?
2. Link öffnen → landet auf `/sparte`, Liste steht da?
3. Eine Stufe setzen → steht sie in der Datenbank, im Verlauf **und** am Deal?
4. Abmelden → `/sparte` schickt wieder zur Anmeldung.
5. **Gegenprobe**: eine Adresse, die *nicht* auf der Liste steht, eintragen →
   dieselbe Bestätigung auf der Seite, aber **keine** Mail.
