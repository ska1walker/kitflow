-- Nach den Migrationen in den Supabase-SQL-Editor kopieren und ausfuehren.
-- Aendert nichts, ruft auch die Nummernfunktion nicht auf: der erste echte
-- Vorgang soll die 001 bekommen. Eine Abfrage, eine Tabelle, acht Zeilen.

with erwartet(tabelle) as (
  values ('vorgang'), ('vorgang_artikel'), ('vorgang_person'),
         ('ereignis'), ('mail_versand'), ('vorgang_zaehler')
),
da as (
  select c.relname, c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in (select tabelle from erwartet)
)
select * from (
  select 1 as nr, 'Tabellen angelegt' as pruefung,
         count(*) || ' von 6' as befund,
         case when count(*) = 6 then 'ok' else 'FEHLT WAS' end as stand
    from da

  union all
  select 2, 'RLS eingeschaltet',
         count(*) filter (where relrowsecurity) || ' von ' || count(*),
         case when count(*) > 0 and count(*) = count(*) filter (where relrowsecurity)
              then 'ok' else 'RLS FEHLT' end
    from da

  union all
  select 3, 'Policies (erwartet: keine)',
         count(*) || ' Policies',
         case when count(*) = 0 then 'ok' else 'EINE POLICY OEFFNET DIE TUER' end
    from pg_policies
   where schemaname = 'public' and tablename in (select tabelle from erwartet)

  union all
  select 4, 'Rechte fuer anon/authenticated (erwartet: keine)',
         count(*) || ' Rechte',
         case when count(*) = 0 then 'ok' else 'ZU VIEL ERLAUBT' end
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon', 'authenticated')
     and table_name in (select tabelle from erwartet)

  union all
  select 5, 'Nummernfunktion vorhanden',
         count(*) || ' Funktion',
         case when count(*) = 1 then 'ok' else 'FEHLT' end
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'naechste_vorgangsnummer'

  union all
  -- `to_regclass` statt `::regclass`: gibt es die Tabelle nicht, kommt NULL
  -- zurueck statt eines Fehlers. Sonst bricht die ganze Pruefung ab, wenn die
  -- Migration gar nicht gelaufen ist - und man sieht nicht, dass sie fehlt.
  select 6, 'Trigger auf vorgang',
         coalesce(string_agg(tgname, ', '), 'keiner'),
         case when count(*) = 1 then 'ok' else 'FEHLT' end
    from pg_trigger
   where tgrelid = to_regclass('public.vorgang') and not tgisinternal

  -- Migration 002: was ein Vorgang nach der Groessenabfrage noch erlebt.
  union all
  select 7, 'Spalten aus Migration 002',
         count(*) || ' von 27',
         case when count(*) = 27 then 'ok' else 'MIGRATION 002 FEHLT' end
    from information_schema.columns
   where table_schema = 'public' and table_name = 'vorgang'
     and column_name in (
       'angebot_intersport_betrag', 'angebot_intersport_am',
       'angebot_intersport_gueltig_bis', 'angebot_intersport_lieferzeit',
       'angebot_intersport_abweichung', 'angebot_11teamsports_betrag',
       'angebot_11teamsports_am', 'angebot_11teamsports_gueltig_bis',
       'angebot_11teamsports_lieferzeit', 'angebot_11teamsports_abweichung',
       'lieferant_gewaehlt', 'kaskadenstufe', 'zusage_sponsor',
       'eingang_verein', 'eingang_am', 'vorkasse_bestaetigt',
       'spartenbudget_freigegeben', 'zahlweg_mannschaft',
       'rechnungsempfaenger', 'bestellt_am', 'geliefert_am',
       'rechnung_betrag', 'rechnung_abweichung', 'erstattung_betrag',
       'erstattet_am', 'erstattung_kontoinhaber', 'erstattung_iban')

  -- Eine Zusage von -500 schluege sich bis in die Deckungspruefung durch.
  union all
  select 8, 'Geldspalten duerfen nicht negativ sein',
         count(*) || ' von 8',
         case when count(*) = 8 then 'ok' else 'BEDINGUNGEN FEHLEN' end
    from pg_constraint
   where conrelid = to_regclass('public.vorgang') and conname like '%_nicht_negativ'
) x order by nr;
