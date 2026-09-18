-- kitflow · 002 · Was ein Vorgang nach der Größenabfrage noch erlebt
--
-- Migration 001 deckt ab, was bis Stufe 1 gebraucht wird. Die Statusseite liest
-- aber mehr: `haendlerAus` und `verlaufAus` in src/lib/vorgaenge.ts bauen
-- Händlerkarten und Verlauf aus Deal-Eigenschaften, die es hier noch nicht gab.
-- Ohne sie bliebe die Seite ab Stufe 2 leer, sobald die Datenbank die Quelle ist.
--
-- Geschrieben werden sie heute von niemandem — es gibt keine Formulare F4 bis
-- F8. Sie stehen in HubSpot und werden dort von Hand gepflegt. Genau deshalb
-- gehören sie hierher: nach dem Umzug liest kitflow den Deal nicht mehr zurück.
-- Gepflegt werden sie ab Schritt 3 über /sparte.
--
-- Wiederholbar: legt nur an, was fehlt, und löscht nichts.

alter table vorgang
  -- Angebote der beiden Händler (docs/konzept.md)
  add column if not exists angebot_intersport_betrag       numeric(10,2),
  add column if not exists angebot_intersport_am           date,
  add column if not exists angebot_intersport_gueltig_bis  date,
  add column if not exists angebot_intersport_lieferzeit   text,
  add column if not exists angebot_intersport_abweichung   text,

  add column if not exists angebot_11teamsports_betrag      numeric(10,2),
  add column if not exists angebot_11teamsports_am          date,
  add column if not exists angebot_11teamsports_gueltig_bis date,
  add column if not exists angebot_11teamsports_lieferzeit  text,
  add column if not exists angebot_11teamsports_abweichung  text,

  add column if not exists lieferant_gewaehlt text
    check (lieferant_gewaehlt is null or lieferant_gewaehlt in ('Intersport Uelzen', '11teamsports')),

  -- Die Kaskadenstufe gilt nur beim Trikotsatz (1 bis 3).
  add column if not exists kaskadenstufe smallint
    check (kaskadenstufe is null or kaskadenstufe between 1 and 3),

  -- Finanzierung. Bestellt wird erst, wenn das Geld da ist (docs/konzept.md):
  -- eine Zusage allein macht nie bestellbar, deshalb stehen Zusage und Eingang
  -- getrennt.
  add column if not exists zusage_sponsor           numeric(10,2),
  add column if not exists eingang_verein           numeric(10,2),
  add column if not exists eingang_am               date,
  add column if not exists vorkasse_bestaetigt      numeric(10,2),
  add column if not exists spartenbudget_freigegeben numeric(10,2),

  add column if not exists zahlweg_mannschaft text
    check (zahlweg_mannschaft is null or zahlweg_mannschaft in ('Anteil an Verein', 'Vorkasse')),
  add column if not exists rechnungsempfaenger text,

  add column if not exists bestellt_am        date,
  add column if not exists geliefert_am       date,
  add column if not exists rechnung_betrag    numeric(10,2),
  add column if not exists rechnung_abweichung boolean,

  add column if not exists erstattung_betrag      numeric(10,2),
  add column if not exists erstattet_am           date,
  add column if not exists erstattung_kontoinhaber text,
  -- Nach Abschluss des Vorgangs löschen (docs/datenmodell.md). Steht hier als
  -- Kommentar, damit die Regel an der Spalte klebt und nicht nur im Dokument.
  add column if not exists erstattung_iban        text;

comment on column vorgang.erstattung_iban is
  'Bankverbindung für die Erstattung. Nach Abschluss des Vorgangs löschen.';

-- Die Geldbeträge sind nie negativ. Eine Zusage von -500 wäre ein Tippfehler,
-- der sich bis in die Deckungsprüfung durchschlägt.
do $$
declare spalte text;
begin
  foreach spalte in array array[
    'angebot_intersport_betrag', 'angebot_11teamsports_betrag', 'zusage_sponsor',
    'eingang_verein', 'vorkasse_bestaetigt', 'spartenbudget_freigegeben',
    'rechnung_betrag', 'erstattung_betrag'
  ] loop
    if not exists (
      select 1 from pg_constraint
       where conrelid = 'vorgang'::regclass and conname = spalte || '_nicht_negativ'
    ) then
      execute format(
        'alter table vorgang add constraint %I check (%I is null or %I >= 0)',
        spalte || '_nicht_negativ', spalte, spalte);
    end if;
  end loop;
end;
$$;
