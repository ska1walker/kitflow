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
- **Offen, blockiert durch fehlende Scopes:** die Produkt-Eigenschaften (`groessenart`, `fuer`,
  `artikelnr_intersport`, `artikelnr_11teamsports`, `hersteller`, `farbe`, `beflockung_standard`,
  `aktiv`, `auslaufdatum`) und `companies.rolle`. HubSpot verlangt dafür
  `inbounddb-product-library-write` bzw. `companies-write`. Bis die Scopes am Service-Schlüssel
  hängen, liest die App Artikel ohne Größenart und ohne Rollenzuordnung; das Skript legt sie beim
  nächsten Lauf nach.
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
| trainer_email, groessen_frist, lieferadresse | Text / Datum / Text | F1 |
| ausgeschlossene_spieler | Text, Record-IDs | F2 (Trainer) |
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

`name`, `hs_sku` = Herstellernummer; neu: `artikelnr_intersport`, `artikelnr_11teamsports`, `hersteller`, `farbe`, `groessenart` (trikot / oberteil / shorts / trainingshose / schuhe / ohne), `fuer` (Alle / Feldspieler / Torwart), `beflockung_standard`, `aktiv`, `auslaufdatum`.

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

Produkt, Menge; angelegt: `groesse`, `rueckennummer`, `spieler_hsid`, `spieler_name`, `sponsor`.

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
| initialen | Text |

Neu: `groesse_zuletzt_bestaetigt_am`, `bekleidung_zuletzt_erhalten_am`.

Weitere Fakten: `team` (Jahrgänge 2007–2022, 1./2./3. Herren, Ü30, Ü40 Team 1–3, Damen, Mädchen, Sponsoring) ist bei 459 von 648 Fußball-Kontakten gesetzt. Nur rund 35 Kontakte haben schon eine Größe. Kinder haben Ersatz-Mailadressen `@passantrag.de` (keine echten Postfächer). Testkontakte heißen „ZZ Test …“.

## Firmen

Neu: `rolle` (Sponsor / Lieferant). Intersport Uelzen mit Jens Bormann, 11teamsports mit Michael Hillebrecht.

## Größenarten – Zuordnung

| Größenart (Formular) | Schlüssel | HubSpot-Kontakt |
|---|---|---|
| Trikot | trikot | trikot |
| Oberteil (Jacke, Hoodie, Shirt) | oberteil | trainingsanzug_oberteil |
| Kurze Sporthose | shorts | kurze_sporthose |
| Trainingshose | trainingshose | trainingshose |
| Schuhe, Stutzen (nach Schuhgröße) | schuhe | schuhgroesse |
| ohne Größe (z. B. Tasche, Ball) | – | – |
