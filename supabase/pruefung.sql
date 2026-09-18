-- Nach der Migration in den Supabase-SQL-Editor kopieren und ausfuehren.
-- Aendert nichts, ruft auch die Nummernfunktion nicht auf: der erste echte
-- Vorgang soll die 001 bekommen. Eine Abfrage, eine Tabelle, sechs Zeilen.

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
) x order by nr;
