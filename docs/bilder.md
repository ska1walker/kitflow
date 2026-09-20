# Bilder in kitflow

Stand 20.09.2026

Drei Bilder, drei ganz verschiedene Anlässe — und deshalb drei verschiedene
Orte. Sie sehen sich nur ähnlich, weil alle drei Dateien sind.

| | Was | Wo es liegt | Wer es sieht |
|---|---|---|---|
| **Vereinswappen** | ändert sich nie | Datei im Projekt, `src/assets/wappen.png` | der Händler, im Kopf von M4 |
| **Sponsorlogo** | wechselt je Vorgang | Ablage, `sponsor/<vorgang-id>.<endung>` | der Händler, als Anhang an M4 |
| **Produktfoto** | wechselt je Artikel | Ablage, `artikel/<artikel-id>.<endung>` | der Spieler, in der Größenabfrage |

**Das Wappen braucht keinen Upload.** Es ändert sich nie; eine Hochlade-Strecke
dafür zu bauen hieße, einen Weg zu öffnen, der genau einmal benutzt wird.
Details in `docs/mails.md` und `src/assets/README.md`.

## Die Ablage

Ein **privater** Eimer `kitflow` in Supabase Storage. Es gibt keine öffentliche
Adresse. Gelesen wird serverseitig mit dem Dienst-Schlüssel, und an den Browser
gehen die Bytes über `/api/bild`.

Ein öffentlicher Eimer wäre einfacher gewesen. Dagegen sprach nicht der Inhalt —
hier liegen Sachbilder, keine Gesichter —, sondern dass seine Adressen für immer
und für jeden gelten. Was einmal öffentlich war, holt man nicht zurück.

### Was hineindarf

PNG, JPEG oder WebP, höchstens 2 MB. **Gemessen wird an den ersten Bytes, nicht
am gemeldeten Typ**: ein Browser schickt als Content-Type, was der Dateiname
nahelegt, und der ist frei wählbar. Ein PDF mit der Endung `.png` prallt ab.

**Verkleinert wird nichts.** Das bräuchte `sharp`, und kitflow hat außer Next
und React keine Abhängigkeit. Die harte Grenze ist der ehrlichere Ersatz: sie
weist zu große Dateien ab, statt sie klaglos anzunehmen und 26 Leuten auf dem
Handy zuzumuten. Wenn sich herausstellt, dass Trainer regelmäßig an der Grenze
scheitern, ist das der Moment, über `sharp` zu reden — nicht vorher.

### Wer hochladen darf

**Nur der Trainer, über den signierten Link auf `/v/{vorgang}`.** Es gibt
bewusst kein Feld auf `/neu`: die Seite steht offen im Netz und legt seit
Migration 002 nur Entwürfe an. Ein Upload dort hieße, Dateien von Unbekannten
für Vorgänge zu speichern, die es noch gar nicht gibt.

Die Karte erscheint nur bis Stufe 1 und nie bei einem reinen Größencheck: danach
ist die Anfrage raus, und ein neues Bild käme zu spät.

### Wer sie zu sehen bekommt

`/api/bild` verlangt denselben Token wie die Seite, auf der das Bild steht — den
Trainer-Token oder den persönlichen Token des Spielers. Zwei Regeln stehen dort
im Code und sind mit Tests festgenagelt:

- **Der Pfad kommt nie von außen.** Die Anfrage nennt Vorgang, Art und
  allenfalls eine Artikel-ID; den Pfad schlägt die Route in der Datenbank nach.
  Ein Pfad als Parameter wäre ein Leseschlüssel für den ganzen Eimer — mit `../`
  und etwas Geduld auch für alles daneben.
- **Immer 404, nie 403.** Ein „verboten" verriete, dass es das Bild gibt.

## Was bei einem Ausfall passiert

Überall dasselbe: **das Bild fehlt, der Vorgang läuft.**

- Sponsorlogo nicht auffindbar → M4 geht ohne raus, und im Verlauf steht, warum.
  Eine Angebotsanfrage wegen eines fehlenden Logos aufzuhalten, wäre der
  teurere Fehler; der Händler fragt zur Not nach.
- Produktfoto nicht auffindbar → das Formular zeigt keins. Die Größenabfrage
  funktioniert ohne Bild genauso.
- Ablage gar nicht eingerichtet → Hochladen sagt das in einem Satz. Nichts
  anderes an kitflow ändert sich.

Beim Ersetzen wird der alte Pfad entfernt, wenn er ein anderer war (etwa PNG
nach JPEG). Scheitert das, bleibt eine verwaiste Datei liegen — der Verweis in
der Datenbank stimmt trotzdem. Andersherum wäre schlimmer: die Seite zeigte auf
ein Bild, das der Trainer gerade weggenommen hat.

## Was Kai einrichten muss

1. **Migration `20260920090000_bilder.sql`** im SQL-Editor des
   **kitflow**-Projekts (nicht Coachbase).
2. **Einen Eimer `kitflow` in Supabase Storage**, Storage → New bucket:
   - Name `kitflow`
   - **Public bucket: aus.** Das ist der ganze Punkt.
   - Policies braucht es keine — der Dienst-Schlüssel geht an RLS vorbei, genau
     wie bei den Tabellen (docs/datenbank.md).
3. **Redeploy**, wie immer.

Danach ein Bild hochladen und die Größenabfrage einer Testperson öffnen. Das ist
der Punkt, an dem sich entscheidet, ob die Annahmen unten stimmen.

## Im Browser geprüft

`npm run test:ui` fährt die Karte mit Playwright durch — 22 Prüfungen: hochladen,
ersetzen, entfernen, das getarnte PDF, die Größengrenze, ob das Vorschaubild
wirklich lädt (`naturalWidth > 0`) und ob `/api/bild` ohne Token 404 gibt.

Voraussetzung sind `bash scripts/db-testumgebung.sh` (Postgres, PostgREST und
die Ablage-Attrappe) und ein laufendes `npx next start`. Nicht Teil der
PR-Prüfung — die bleibt netzfrei.

**Der Lauf hat sich sofort bezahlt gemacht.** Er fand, was kein Unit-Test finden
konnte: **Next kappt den Körper einer Server Action bei 1 MB**, und diese Absage
erreicht den eigenen Code nie. Die Grenze in `ablage.ts` war damit unerreichbar,
und statt „höchstens 2 MB" brach die Seite mit „This page couldn't load" ab.

Ein Handyfoto hat 3 bis 8 MB. Das hätte **jeden** Trainer getroffen, der ein Foto
seiner Trainingsjacke hochlädt. Zwei Änderungen: `serverActions.bodySizeLimit`
steht jetzt über der eigenen Grenze, und das Formular misst schon im Browser, so
dass eine zu große Datei gar nicht erst losgeschickt wird. Die Prüfung im Browser
ist Höflichkeit, die in `ablage.ts` bleibt die Sicherung.

## Was hier nicht geprüft ist

**Supabase Storage selbst.** `*.supabase.co` ist aus der Bauumgebung gesperrt
(403 vom Proxy, wie Resend, Telegram und Todoist). Geprüft ist die Schicht gegen
ein Papp-Netz und gegen absichtlich gebrochene Fassungen — ob der Eimer heißt
wie erwartet, ob `x-upsert` so wirkt und ob der Dienst-Schlüssel darauf
schreiben darf, entscheidet sich beim ersten Lauf.

Scheitert es, steht der Status-Code im Vercel-Log, und das Hochladen sagt „Das
Bild konnte nicht gespeichert werden" statt so zu tun, als sei es da.
