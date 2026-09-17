# Datenmodell (HubSpot)

Stand 10.09.2026. HubSpot ist die einzige Datenbasis. Neue Eigenschaften in der Gruppe „Ausstattung“.

## Einrichtung

- Erledigt am 10.09.2026 über `npm run hubspot-setup -- --apply`. Angelegt wurden die Pipeline
  „Ausstattung“ (Id 4119853284) mit den neun Stufen aus docs/konzept.md, die Eigenschaftsgruppe
  „Ausstattung“ auf Deals und Kontakten, 33 Deal-Eigenschaften und 2 Kontakt-Eigenschaften.
  Ergänzt wurde `kurze_sporthose` um 116 bis 176 und XS.
- Die alte „Sales Pipeline“ bleibt daneben stehen, statt umbenannt zu werden. Sie hat 0 Deals und
  stört nicht; kitflow sucht die Pipeline über ihre Bezeichnung „Ausstattung“.
- Nachgezogen am 10.09.2026: die Positions-Eigenschaften (`line_items`), die Eigenschaftsgruppe auf
  Produkten, Positionen und Firmen sowie drei Datumsfelder am Deal, die die Statusseite anzeigt:
  `angebot_intersport_am`, `angebot_11teamsports_am`, `eingang_am`.
- Nachgezogen nach Erweiterung der Scopes: die neun Produkt-Eigenschaften und `companies.rolle`.
  Der Service-Schlüssel braucht dafür `inbounddb-product-library-write` und `companies-write`.
- `products.groessenart` und `products.fuer` speichern genau die Schlüssel aus `src/lib/typen.ts`
  (`trikot`/`oberteil`/`shorts`/`trainingshose`/`schuhe`/`ohne` bzw. `alle`/`feldspieler`/`torwart`),
  damit die App ohne Übersetzungstabelle liest. Beim Pflegen die Werte nicht umbenennen.
- Das Skript ist wiederholbar: Vorhandenes wird erkannt und übersprungen, nie überschrieben, nie gelöscht.
- Zugriff für kitflow: HubSpot Service-Schlüssel (früher Private App) mit mindestens
  crm.objects.deals.read/write, crm.objects.contacts.read/write, crm.objects.line_items.read/write,
  crm.objects.products.read, crm.objects.companies.read; für die Einrichtung zusätzlich
  crm.schemas.deals.write, crm.schemas.contacts.write, crm.schemas.companies.write.
- Der Schlüssel liegt nie im Repo. Lokal und in Produktion steht er in `HUBSPOT_TOKEN`. In der
  Claude-Cloud-Umgebung hängt er stattdessen an den Zugangsdaten für api.hubapi.com, der Proxy setzt
  den Authorization-Header, und `.env.local` enthält nur `HUBSPOT_AUTH_VIA_PROXY=1`.
- Die bestehende Make-Verbindung 2981268 bleibt unverändert (gehört zu Spartenzuordnung und Passantrag).

## Deal = Vorgang

| Eigenschaft | Typ | gesetzt bei |
|---|---|---|
| vorgangsnummer | Text, AUS-JJJJ-NNN | F1 |
| ausstattungsart | Auswahl: Trikotsatz / Weitere Ausstattung | F1 |
| mannschaft | Mehrfachauswahl, Werte wie Kontakt-team | F1 |
| mannschaftscode | Text, z. B. JG2014-2015 | F1 |
| personen_geschaetzt | Zahl, geschätzte Kadergröße; nur im einfachen Modus | F1 (Voranfrage) |
| trainer_email, groessen_frist, lieferadresse | Text / Datum / Text | F1 |
| initialen_noetig | Ja/Nein | F1 bzw. F1b – schaltet die Initialen-Abfrage in F2 frei |
| ausgeschlossene_spieler | Text, Record-IDs | F2 (Trainer) |
| torwarte | Text, Record-IDs; wer die Torwartartikel bekommt | F2 (Trainer) |
| liste_bestaetigt_am | Datum | F3 |
| hinweis_haendler | Text; geht in die Anfrage | F3 |
| angebot_intersport_*, angebot_11teamsports_* | Betrag, eingegangen am, gültig bis, Lieferzeit, Abweichung | Angebot eingelesen |
| lieferant_gewaehlt, amount | Auswahl / Betrag | Spartenleitung |
| kaskadenstufe, stufe_frist | Zahl 1–3 / Datum, nur Trikotsatz | Spartenleitung, Fristen |
| zahlweg_mannschaft | Auswahl: Anteil an Verein / Vorkasse | F5 |
| rechnungsempfaenger, erstattung_kontoinhaber, erstattung_iban | Text, nur bei Vorkasse | F5; IBAN nach Abschluss löschen |
| zusage_sponsor, eingang_verein, vorkasse_bestaetigt | Zahl | F4, F6, F7 |
| eingang_am | Datum, Tag der erfüllten Deckung | F6 |
| spartenbudget_freigegeben | Zahl | Spartenleitung |
| bestellt_am, geliefert_am | Datum | Freigabe / F8 |
| rechnung_betrag, rechnung_abweichung, erstattung_betrag, erstattet_am | Zahl / Ja-Nein / Datum | Rechnung, F7 |

## Produkte = Artikelstamm

`name`, `hs_sku` = Herstellernummer; angelegt: `artikelnr_intersport`, `artikelnr_11teamsports`, `hersteller`, `farbe`, `groessenart` (trikot / oberteil / shorts / trainingshose / schuhe / ohne), `fuer` (alle / feldspieler / torwart), `beflockung_standard`, `aktiv`, `auslaufdatum`.

Noch leer. Erste echte Artikel aus Kais Anfrage:

| Produktname | Herstellernr. | Artikelnr. 11teamsports | Größenart | Für |
|---|---|---|---|---|
| Hummel hmlCORE XK Poly T-Shirt Weiss F9001 | 211943 | 102.053.402.247 | Trikot | Feldspieler |
| Hummel hmlCORE XK Poly Short Weiss F9001 | 211466 | 102.052.872.245 | Kurze Sporthose | Feldspieler |
| Hummel Pro Football Sock Socken F9124 | 201.160 | 101.020.772.148 | Schuhgröße | Feldspieler |
| adidas Tiro 24 Competition Torwarttrikot langarm Blau | IN0410 | 10.276.017.216 | Trikot | Torwart |
| adidas Tiro 24 Pro Torwartshort Blau | IN0452 | 10.276.061.214 | Kurze Sporthose | Torwart |
| adidas Adisock 23 Strumpfstutzen Blau Weiss Grau | IB7795 | 102.477.136.540 | Schuhgröße | Torwart |

## Positionen (Line Items) = Person × Artikel, am Deal

Produkt, Menge; angelegt: `groesse`, `rueckennummer`, `spieler_hsid`, `spieler_name`, `sponsor`,
`groesse_von`, `groesse_bis`.

`quantity` heißt **Stück je Person**, in beiden Modi von F1. Die Gesamtmenge für einen Händler ist
`personen_geschaetzt × quantity` (Voranfrage) bzw. ergibt sich aus den Positionen je Person (ab F3);
sie wird gerechnet, nie gespeichert. `groesse` ist die Größe **einer** Person; der Größenbereich der
Voranfrage steht getrennt in `groesse_von` und `groesse_bis` und gilt für die ganze Position.

**Eine Position ohne `spieler_hsid` ist die Artikelliste des Vorgangs.** F1 legt je gemeldetem Artikel eine solche Zeile an, F2 liest daraus, welche Größen zu fragen sind, und F3 klappt sie später zu Person mal Artikel auf. So bleibt die Artikelliste in HubSpot sichtbar und bearbeitbar, statt in einem Textfeld zu verschwinden.

`spieler_hsid` ist der Schlüssel, an dem die App hängt: sie zählt darüber Feldspieler und Torwart
(wer eine Torwart-Position hat, ist Torwart) und sucht darüber die Ausstattung der Person, die den
Link geöffnet hat. Ohne `spieler_hsid` bleibt die Spieler-Ansicht leer.

## Kontakte = Spieler, Trainer, Ansprechpartner

Vorhandene Größen-Eigenschaften (Werte müssen exakt passen):

| Eigenschaft | Werte |
|---|---|
| trikot | 116, 128, 140, 152, 164, 176, XS, S, M, L, XL, XXL, XXXL |
| trainingsanzug_oberteil | wie trikot |
| trainingshose | wie trikot |
| kurze_sporthose | derzeit nur S, M, L, XL, XXL, XXXL – um 116–176 und XS ergänzen |
| schuhgroesse | 35–51 |
| trikotnummer | Text |
| initialen | Text, **höchstens 3 Zeichen, nur Buchstaben und Ziffern** (HubSpot prüft das selbst) |

Neu: `groesse_zuletzt_bestaetigt_am`, `bekleidung_zuletzt_erhalten_am`.

Weitere Fakten: `team` (Jahrgänge 2007–2022, 1./2./3. Herren, Ü30, Ü40 Team 1–3, Damen, Mädchen, Sponsoring) ist bei 459 von 648 Fußball-Kontakten gesetzt. Nur rund 35 Kontakte haben schon eine Größe. Kinder haben Ersatz-Mailadressen `@passantrag.de` (keine echten Postfächer). Testkontakte heißen „ZZ Test …“.

## Firmen

Angelegt: `rolle` (Sponsor / Lieferant). Intersport Uelzen mit Jens Bormann, 11teamsports mit Michael Hillebrecht.

## Größenarten – Zuordnung

| Größenart (Formular) | Schlüssel | HubSpot-Kontakt |
|---|---|---|
| Trikot | trikot | trikot |
| Oberteil (Jacke, Hoodie, Shirt) | oberteil | trainingsanzug_oberteil |
| Kurze Sporthose | shorts | kurze_sporthose |
| Trainingshose | trainingshose | trainingshose |
| Schuhe, Stutzen (nach Schuhgröße) | schuhe | schuhgroesse |
| ohne Größe (z. B. Tasche, Ball) | – | – |
