# Die Freigabe der Händleranfrage

Stand 18.09.2026

## Warum es sie gibt

M4 ist die einzige Mail, die kitflow nach draußen schickt — an zwei echte
Geschäftspartner, und sie ist nicht zurückzuholen. Bis zum 18.09.2026 löste die
Bestätigung des Trainers sie unmittelbar aus. Kais Ansage: **die Spartenleitung
genehmigt.**

## Der Ablauf

| Schritt | Wer | Was passiert |
|---|---|---|
| Liste bestätigen (F3) | Trainer | Bestätigung gilt sofort, `freigabe_stand` wird `offen` |
| Ruf | kitflow | Telegram-Nachricht und Todoist-Aufgabe |
| Freigeben (F9 auf `/sparte`) | Spartenleitung | M4 an die Händler, M5 an den Trainer, Stufe 2 |
| oder Stoppen | Spartenleitung | `abgelehnt` mit Grund, M4b an den Trainer |

**Einer genügt.** Kai oder Sebastian — wer aus `SPARTE_EMAILS` angemeldet ist,
darf freigeben. Ein Vier-Augen-Prinzip hätte im Urlaub alles blockiert; wer es
war, steht im Verlauf.

**Die Anmeldung ist Pflicht.** Kein signierter Link wie bei den Trainer-Seiten:
eine Telegram-Nachricht wird weitergeleitet und liegt auf Sperrbildschirmen. Die
Nachricht verlinkt deshalb auf `/sparte`, und dort greift der Login.

## Was wo lebt

**Der Zustand lebt in der Datenbank**, in vier Spalten an `vorgang`
(Migration 004): `freigabe_stand`, `freigabe_von`, `freigabe_am`,
`freigabe_grund`. Telegram und Todoist sind Benachrichtigungen *über* diesen
Zustand. Fallen sie aus, wartet die Freigabe trotzdem sichtbar auf `/sparte` —
und der Ausfall steht im Verlauf, damit Stille nicht als „nichts zu tun“
gelesen wird.

Die vier Stände:

| Stand | Bedeutung |
|---|---|
| `keine` | noch nie bestätigt, oder ein reiner Größencheck |
| `offen` | der Trainer hat bestätigt, die Freigabe steht aus |
| `freigegeben` | die Anfrage darf raus — und ging raus |
| `abgelehnt` | gestoppt, Grund steht daneben |

`keine` und `offen` sind ausdrücklich verschiedene Dinge. Wer beides
zusammenwirft, blendet entweder eine fällige Freigabe aus oder erfindet eine.

**Ein unbekannter Wert wird `keine`**, nie `offen` (`alsFreigabeStand`). Ein
Tippfehler in der Spalte, eine künftige Migration mit einem fünften Wert, eine
Zeile aus der Zeit vor Migration 004: keiner dieser Fälle darf als Freigabe
durchgehen.

## Die Regeln, die im Code stehen

- **Die Stufe wandert erst, wenn wirklich etwas rausging.** Schlägt der Versand
  fehl, bleibt der Stand `offen` und der Vorgang auf Stufe 1. Eine Freigabe,
  nach der nichts passiert ist, wäre schlimmer als gar keine: sie verschwindet
  aus der Liste, und niemand sieht mehr hin.
- **Zweimal freigeben verschickt nicht zweimal.** `gibFrei` nimmt nur an, was
  wirklich `offen` ist.
- **Ohne hinterlegte Händler wird gar nicht erst gefragt.** Es gäbe nichts
  freizugeben, und eine Aufgabe, die ins Leere liefe, ist keine.
- **Ohne eine einzige Größe ebenso wenig.** Die Prüfungen auf der Seite halten
  die Bestätigung ausdrücklich nicht auf, ein Trainer kann also eine leere Liste
  bestätigen. Vorher war die Folge: Telegram meldet sich, die Karte erscheint,
  und der Klick darauf scheitert — eine Freigabe, die von Anfang an nicht
  gelingen konnte. Eine **Störung** beim Nachsehen zählt dabei nicht als „keine
  Größen“: dann wird die Freigabe ganz normal erbeten und beim Versand noch
  einmal geprüft.
- **Eine erneute Bestätigung setzt zurück** — alle vier Spalten, nicht nur den
  Stand. Sonst trüge eine geänderte Liste noch die Unterschrift der alten
  Entscheidung.
- **Ein reiner Größencheck braucht keine Freigabe.** Er bestellt nichts.
- **Der Grund beim Ablehnen ist Pflicht** und geht als M4b an den Trainer. Ohne
  ihn bliebe der Vorgang stumm liegen.

## Später: automatisch durchlaufen

Kais Wunsch vom 18.09.2026. Die Naht dafür steht: `freigabeWeg()` in
`src/lib/freigabe.ts` entscheidet, ob ein Mensch gefragt wird oder eine Regel
entscheidet. Sie nimmt **keinen Parameter** — was die Regel ansehen muss, ist
offen (der Betrag steht zu diesem Zeitpunkt noch gar nicht fest), und einen
geratenen Parameter hereinzureichen und ungelesen wegzuwerfen sähe aus wie eine
Entscheidung, die niemand getroffen hat. Es gibt genau eine Aufrufstelle. Gibt sie einen `Freigeber` vom Typ `regel` zurück, gibt
`beantrageFreigabe` sofort frei — alles danach ist identisch, und der Verlauf
hält fest, welches von beidem es war.

**Heute gibt sie nie eine Regel zurück.** Das ist Absicht und kein halbfertiger
Zustand: eine Automatik, die niemand festgelegt hat, wäre geraten, und geraten
wird bei einer Mail nach draußen nicht.

Was eine Regel prüfen müsste, bevor sie scharf geschaltet wird — offene Fragen
für Kai:

- **Ab welchem Betrag nicht mehr?** Eine Anfrage über 80 Trikots ist etwas
  anderes als eine über zwei Trainingsjacken. Der Betrag steht allerdings erst
  *nach* der Anfrage fest — als Näherung bleibt die Stückzahl.
- **Jugend anders als Erwachsene?**
- **Nur bei bekannten Mannschaften**, oder auch beim ersten Vorgang einer neuen?
- **Was, wenn die Liste Lücken hat?** Die Prüfungen stehen heute auf der Seite
  und halten die Bestätigung nicht auf; eine Automatik müsste sie ernst nehmen.
- **Bleibt die Benachrichtigung?** Empfehlung: ja. Eine automatische Freigabe,
  von der niemand erfährt, ist keine Erleichterung, sondern ein blinder Fleck.

## Was Kai dafür braucht

```
TELEGRAM_TOKEN=   # vom BotFather
TELEGRAM_CHAT=    # Chat- oder Gruppen-ID, bei Gruppen negativ
TODOIST_TOKEN=    # Todoist: Einstellungen > Integrationen > Entwickler
TODOIST_PROJEKT=  # optional; ohne sie landet die Aufgabe im Posteingang
```

Und die Migration `20260918150000_freigabe.sql` einmal im SQL-Editor.

**Fehlt alles davon**, funktioniert die Freigabe trotzdem — sie wartet dann nur
still auf `/sparte`, statt sich zu melden.

## Was hier nicht geprüft ist

**Der echte Aufruf bei Telegram und Todoist.** `api.telegram.org` und
`api.todoist.com` sind aus der Entwicklungsumgebung gesperrt (Proxy antwortet
403 auf CONNECT), genau wie Resend und Vercel. Geprüft ist die Schicht gegen ein
Papp-Netz; ob der Bot-Token stimmt und die Chat-ID die richtige ist, entscheidet
sich beim ersten Lauf auf Vercel.
