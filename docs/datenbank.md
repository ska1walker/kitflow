# Eigene Datenbank für Vorgänge

Stand 17.09.2026 · Migration `supabase/migrations/001_vorgaenge.sql`

**Angeschlossen ist noch nichts.** Die App läuft weiter vollständig auf HubSpot. Diese
Schicht steht daneben, ist geprüft, und wird in Schritt 2 angeschlossen.

## Warum überhaupt

HubSpot trägt heute alles: den Vorgang als Deal, die Artikel als Positionen, den Stand als
Pipeline-Stufe, den Verlauf als eine Handvoll Datums-Eigenschaften. Vier Dinge gehen damit
nicht:

1. **Wer diese Runde im Tor steht** und **wer ausgeschlossen ist**, steht als Record-IDs in
   einem Freitextfeld, aus dem `ids()` nur Ziffern herausklaubt.
2. **Der Verlauf** kennt kein „wer“ und kein „was“, nur ein paar „wann“.
3. **Die Vorgangsnummer** zählt über eine Suche, die archivierte Vorgänge mitzählt. Beim
   Aufräumen sprang der Zähler von 002 auf 004.
4. **Was schon verschickt wurde**, weiß niemand. Ohne das wiederholt sich jede Erinnerung,
   solange eine Größe fehlt.

## Der Schnitt

| bleibt in HubSpot | zieht in die Datenbank |
|---|---|
| Name, Adresse, Geburtsdatum, Mitgliedschaft | Vorgang, Stufe, Fristen |
| Größen, Initialen, Mannschaftszugehörigkeit | Artikel des Vorgangs |
| Artikelstamm (Produkte) | wer zum Vorgang gehört, Torwart, Ausschluss, Rückennummer |
| Händler als Firmen-Kontakte | Verlauf, Mailversand |

**Was der Person gehört, bleibt dort, wo die Geschäftsstelle es pflegt.** Ein zweiter Bestand
von Kindernamen und Größen wäre datenschutzrechtlich ein Rückschritt. `vorgang_person` hält
deshalb nur die HubSpot-ID; der Name wird beim Anzeigen dort geholt. Auch `mail_versand` hält
keine Adresse.

`ausgeschlossen`, `torwart` und `trikotnummer` wandern mit, weil sie **je Vorgang** gelten und
nicht je Mensch: wer diese Runde im Tor steht, ist nächste Runde Feldspieler.

## Die Tabellen

| Tabelle | Inhalt |
|---|---|
| `vorgang` | Nummer, Mannschaften, Ausstattungsart, Stufe, Trainer, Fristen, Lieferadresse, `initialen_noetig`, `groessenarten`, Sponsor, `hs_deal_id` |
| `vorgang_artikel` | Hersteller, Bezeichnung, Herstellernummer, Farbe, Größenart, Stück je Person, Für wen, Beflockung, Größenbereich |
| `vorgang_person` | `hs_kontakt_id`, `ausgeschlossen`, `torwart`, `trikotnummer` |
| `ereignis` | Zeitpunkt, Art, Text, `intern`, `ab_stufe` — der Verlauf |
| `mail_versand` | welche Mail wann an wen, und ob `MAIL_NUR_AN` sie umgeleitet hat |
| `vorgang_zaehler` | eine Zeile je Jahr, für die Vorgangsnummer |

Dazu zwei Funktionen: `naechste_vorgangsnummer()` (unter Sperre, zählt zusätzlich die höchste
wirklich vergebene Nummer mit, damit ein Import keine Nummer doppelt vergibt) und der Trigger
`vorgang_zeitstempel` (setzt `aktualisiert_am`, und `stufe_seit` nur beim Stufenwechsel — eine
korrigierte Lieferadresse soll „wartet seit“ nicht zurücksetzen).

## Zugriff

**Alle Tabellen tragen RLS und keine einzige Policy.** Von außen kommt damit niemand heran,
auch kein angemeldeter Spieler. Jeder Zugriff läuft serverseitig über den Service-Schlüssel,
der RLS umgeht. Zusätzlich sind die Rechte von `anon` und `authenticated` entzogen — Supabase
vergibt an neue Tabellen in `public` per Voreinstellung welche, und eine Policy ist schneller
angelegt als durchdacht.

Wer etwas sehen darf, entscheidet weiterhin der Code: heute der signierte Link, ab Schritt 3
zusätzlich die Anmeldung der Spartenleitung — in der Datenschicht und in **jeder** Server
Action, nicht im Proxy. Next nennt die Prüfung im Proxy selbst ausdrücklich optimistisch
(`node_modules/next/dist/docs/01-app/02-guides/authentication.md`).

## Migration ausführen

Im Supabase-SQL-Editor, Inhalt von `supabase/migrations/001_vorgaenge.sql` einfügen und
ausführen. Die Datei ist wiederholbar: sie legt nur an, was fehlt, und löscht nichts.

Danach in Vercel und `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<Service-Schlüssel>
```

Fehlt eines von beiden, ist die Schicht schlicht nicht aktiv (`dbAktiv()` ist falsch) und
meldet `null` — sie läuft nicht halb.

## Wie geprüft wurde

Von dieser Umgebung aus ist `*.supabase.co` gesperrt (der Proxy beantwortet CONNECT mit 403),
der Supabase-MCP dagegen erreichbar. Geprüft wurde deshalb gegen ein lokal aufgesetztes
PostgreSQL 16 mit den Supabase-Rollen `anon`, `authenticated` und `service_role`:

- Migration zweimal hintereinander gelaufen — beim zweiten Mal nur „already exists, skipping“.
- Nummern 001, 002, 003 der Reihe nach; ein gelöschter Vorgang gibt seine Nummer **nicht**
  zurück; eine importierte höhere Nummer zieht den Zähler mit.
- Trigger: Lieferadresse ändern lässt `stufe_seit` stehen, Stufe ändern setzt es neu.
- Person zweimal nachtragen bleibt eine Person; eine unbekannte Größenart wird abgewiesen;
  Vorgang löschen räumt Artikel und Personen mit weg.
- `anon` und `authenticated` bekommen „permission denied“, auch für die Nummernfunktion.
  Gegenprobe: mit zurückgegebenem `select`-Recht liefert RLS trotzdem null Zeilen.
- Die 17 Aufrufe, die `vorgaenge-db.ts` wirklich schickt, wurden mitgeschrieben und als echtes
  SQL gegen dieses Schema gefahren. Jeder Spaltenname, jeder Typ, jede Bedingung hielt. Ohne
  das wäre nur belegt, dass die Schicht zu meinem eigenen Papp-PostgREST passt.

### Gegen ein echtes PostgREST

Danach kam PostgREST 13.0.4 dazu — als Binärdatei aus dem GitHub-Release, davor ein Adapter,
der das Supabase-Präfix `/rest/v1` abschneidet, und Schlüssel, die echte HS256-JWTs mit
`role: service_role` sind. Genau das ist ein Supabase-Dienstschlüssel. Damit läuft die
**unveränderte** Datenschicht gegen einen echten Stapel:

```
bash scripts/db-testumgebung.sh   # setzt auf und startet
export DIENST='...'               # das Skript druckt den Schlüssel
npm run test:db                   # 14 Prüfungen gegen echtes PostgREST
```

Diese Prüfungen laufen **nicht** in `npm test` und nicht in der PR-Prüfung: die müssen ohne
Netz und ohne Dienste grün sein.

**Dabei kam ein echter Fehler heraus, den das Papp-PostgREST nicht finden konnte** — es hat
meine eigene Annahme zurückgespiegelt:

> `Prefer: resolution=ignore-duplicates` wirkt bei PostgREST **nur auf den Primärschlüssel**.
> Liegt die Eindeutigkeit auf anderen Spalten — hier `(vorgang_id, hs_kontakt_id)` — muss
> `on_conflict=vorgang_id,hs_kontakt_id` an die Adresse. Ohne das antwortet PostgREST mit 409.

Folge im Betrieb wäre gewesen: ein Nachzügler, der schon am Vorgang hängt, hätte die Karte
scheitern lassen — und beim Anlegen eines Vorgangs hätte eine doppelte Kontakt-ID den
**ganzen Vorgang zurückgenommen**. `schreibe()` verlangt deshalb jetzt die Spalten als Text
statt eines Ja/Nein: wer sie nicht nennen kann, will kein Ignorieren.

Mitgeprüft und in Ordnung: die eingebetteten Kinder `vorgang_artikel(*),vorgang_person(*)` in
einem Aufruf, das Array `mannschaften`, `is.null` und `is.false`, `order`, `limit`, DELETE,
die Rücknahme eines halben Vorgangs bei verletzter Bedingung (23514), und die Nummernfunktion
über `rpc/`. **anon bekommt auch hier 401 „permission denied“** — RLS greift durch den echten
Stapel, nicht nur in psql.
