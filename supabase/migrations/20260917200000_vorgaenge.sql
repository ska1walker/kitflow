-- kitflow · 001 · Vorgänge bekommen eine eigene Datenbank
--
-- Bis hierher war HubSpot die einzige Datenbasis. Was einer Person gehört,
-- bleibt auch dort: Name, Mitgliedschaft, Größen, Initialen. Die Geschäftsstelle
-- pflegt es, die Passantrag-Kette hängt daran, und ein zweiter Bestand von
-- Kindernamen und Größen wäre datenschutzrechtlich ein Rückschritt.
--
-- Hierher zieht, was dem VORGANG gehört: Stufe, Artikel, Fristen, Verlauf — und
-- wer in diesem einen Vorgang ausgeschlossen ist, Torwart spielt oder welche
-- Rückennummer er trägt. Das steht heute als Record-IDs in einem Freitextfeld
-- am Deal, aus dem `ids()` nur Ziffern herausklaubt.
--
-- Diese Datei ist wiederholbar: sie legt nur an, was fehlt, und löscht nichts.
-- Ausgeführt wird sie im Supabase-SQL-Editor.

-- ------------------------------------------------------------------
-- Der Vorgang
-- ------------------------------------------------------------------

create table if not exists vorgang (
  id                  uuid primary key default gen_random_uuid(),
  nummer              text not null unique,
  -- Mehrere, weil ein Vorgang für eine Spielgemeinschaft zweier Jahrgänge
  -- laufen kann. Genau die Werte der HubSpot-Eigenschaft `team`.
  mannschaften        text[] not null default '{}',
  mannschaftscode     text,
  ausstattungsart     text not null,

  -- Stufe 0 bis 9 aus docs/konzept.md. 9 ist der Abbruch; `abbruch_bei` hält
  -- fest, wo der Vorgang stand, als er abgebrochen wurde.
  stufe               smallint not null default 1 check (stufe between 0 and 9),
  stufe_seit          timestamptz not null default now(),
  abbruch_bei         smallint check (abbruch_bei between 0 and 9),

  trainer_name        text,
  trainer_email       text,
  trainer_telefon     text,

  -- Nur in der Voranfrage (Stufe 0): die Schätzung des Trainers.
  personen_geschaetzt integer check (personen_geschaetzt is null or personen_geschaetzt >= 0),

  -- Nur bei „Nur Größen erfassen“: was gefragt wird, wenn kein Artikel es sagt.
  groessenarten       text[] not null default '{}',

  groessen_frist      date,
  stufe_frist         date,
  liste_bestaetigt_am date,

  lieferadresse       text,
  initialen_noetig    boolean not null default false,
  sponsor             text,
  hinweis_haendler    text,

  -- Der dünne Spiegel im CRM. Leer heißt: der Vorgang ist gültig, im CRM fehlt
  -- nur die Sicht darauf. Das ist kein Abbruch, sondern ein Ereignis.
  hs_deal_id          text unique,

  angelegt_am         timestamptz not null default now(),
  aktualisiert_am     timestamptz not null default now()
);

comment on column vorgang.hs_deal_id is
  'Deal im CRM, nur Spiegel. Wird nie zurückgelesen (docs/datenmodell.md).';

-- ------------------------------------------------------------------
-- Die Artikel des Vorgangs
-- ------------------------------------------------------------------
--
-- Bisher waren das Positionen ohne Person am Deal. Der Produktstamm bleibt in
-- HubSpot; `herstellernummer` ist der Schlüssel dorthin (dort `hs_sku`).

create table if not exists vorgang_artikel (
  id               uuid primary key default gen_random_uuid(),
  vorgang_id       uuid not null references vorgang(id) on delete cascade,
  reihenfolge      smallint not null default 0,

  hersteller       text,
  bezeichnung      text not null,
  herstellernummer text,
  farbe            text,

  -- Dieselben Schlüssel wie `Groessenart` und `ArtikelFuer` in src/lib/typen.ts.
  -- Weichen sie ab, fragt F2 eine Größe, die niemand kennt.
  groessenart      text not null
                     check (groessenart in ('trikot','oberteil','shorts','trainingshose','schuhe','ohne')),
  fuer             text not null default 'alle'
                     check (fuer in ('alle','feldspieler','torwart')),

  stueck           smallint not null default 1 check (stueck > 0),
  beflockung       text,

  -- Nur in der Voranfrage: der grobe Bereich statt einzelner Größen.
  groesse_von      text,
  groesse_bis      text
);

create index if not exists vorgang_artikel_vorgang on vorgang_artikel (vorgang_id);

-- ------------------------------------------------------------------
-- Wer zu diesem Vorgang gehört
-- ------------------------------------------------------------------
--
-- Bewusst nur die HubSpot-ID: kein Name, keine Adresse, keine Größe. Der Name
-- wird beim Anzeigen aus HubSpot geholt und steht nirgends doppelt.
--
-- `ausgeschlossen`, `torwart` und `trikotnummer` gelten je Vorgang und nicht je
-- Mensch: wer diese Runde im Tor steht, ist nächste Runde Feldspieler.

create table if not exists vorgang_person (
  id             uuid primary key default gen_random_uuid(),
  vorgang_id     uuid not null references vorgang(id) on delete cascade,
  hs_kontakt_id  text not null,
  ausgeschlossen boolean not null default false,
  torwart        boolean not null default false,
  -- Text, nicht Zahl: „07“ und „7“ sind für den Flexdruck zweierlei, und die
  -- Prüfung auf Doppelte vergleicht ohnehin, was aufgedruckt wird.
  trikotnummer   text,
  angelegt_am    timestamptz not null default now(),
  -- Ein Nachzügler, zweimal nachgetragen, ist trotzdem eine Person.
  unique (vorgang_id, hs_kontakt_id)
);

-- ------------------------------------------------------------------
-- Der Verlauf
-- ------------------------------------------------------------------
--
-- Heute stellen Datums-Eigenschaften am Deal ihn nach: `liste_bestaetigt_am`,
-- `bestellt_am`, `geliefert_am`. Das reicht für „wann“, nie für „wer“ und
-- „was“. `ab_stufe` und `intern` entscheiden, wer den Eintrag sieht —
-- Erinnerungen und Buchungen sehen nur Trainer und Spartenleitung.

create table if not exists ereignis (
  id         bigint generated always as identity primary key,
  vorgang_id uuid not null references vorgang(id) on delete cascade,
  zeitpunkt  timestamptz not null default now(),
  art        text not null,
  text       text not null,
  sub        text,
  intern     boolean not null default false,
  ab_stufe   smallint not null default 0 check (ab_stufe between 0 and 9)
);

create index if not exists ereignis_vorgang on ereignis (vorgang_id, zeitpunkt);

-- ------------------------------------------------------------------
-- Was schon verschickt wurde
-- ------------------------------------------------------------------
--
-- Ohne diese Tabelle wiederholt sich jede Erinnerung, solange die Größe fehlt.
-- Auch hier nur die HubSpot-ID und nicht die Adresse: sie steht in HubSpot, und
-- eine Mailadresse gehört nicht in einen zweiten Bestand.
--
-- `umgeleitet` ist kein Schmuck: eine Mail, die MAIL_NUR_AN an Kai umgeleitet
-- hat, hat den Spieler nicht erreicht. Sie darf nicht als Erinnerung zählen.

create table if not exists mail_versand (
  id            bigint generated always as identity primary key,
  vorgang_id    uuid not null references vorgang(id) on delete cascade,
  art           text not null,
  -- Leer heißt: ging an den Trainer, nicht an eine Person des Kaders.
  hs_kontakt_id text,
  gesendet_am   timestamptz not null default now(),
  umgeleitet    boolean not null default false
);

create index if not exists mail_versand_suche
  on mail_versand (vorgang_id, art, hs_kontakt_id, gesendet_am desc);

-- ------------------------------------------------------------------
-- Die Vorgangsnummer
-- ------------------------------------------------------------------
--
-- Bisher zählte eine Suche über bestehende Nummern — und zählte archivierte
-- Vorgänge mit, deren Nummern der Suchindex noch kannte. Beim Aufräumen sprang
-- der Zähler dadurch von 002 auf 004.
--
-- Der Zähler steht jetzt in einer Zeile je Jahr und wird unter Sperre erhöht.
-- Er schaut zusätzlich nach der höchsten wirklich vergebenen Nummer, damit ein
-- Einmal-Import oder eine von Hand angelegte Zeile keine Nummer doppelt vergibt.

create table if not exists vorgang_zaehler (
  jahr   smallint primary key,
  letzte integer not null check (letzte >= 0)
);

create or replace function naechste_vorgangsnummer() returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  j        integer := extract(year from (now() at time zone 'Europe/Berlin'))::integer;
  hoechste integer;
  n        integer;
begin
  select max((substring(nummer from '[0-9]+$'))::integer)
    into hoechste
    from vorgang
   where nummer like 'AUS-' || j || '-%';

  insert into vorgang_zaehler (jahr, letzte)
  values (j, greatest(1, coalesce(hoechste, 0) + 1))
  on conflict (jahr) do update
    set letzte = greatest(vorgang_zaehler.letzte + 1, coalesce(hoechste, 0) + 1)
  returning letzte into n;

  return 'AUS-' || j || '-' || lpad(n::text, 3, '0');
end;
$$;

-- ------------------------------------------------------------------
-- Stufe und Änderungszeitpunkt
-- ------------------------------------------------------------------
--
-- „Wartet seit“ fragt nach der Stufe, nicht nach der letzten Änderung: eine
-- korrigierte Lieferadresse setzt die Wartezeit sonst zurück. Beides steht
-- deshalb im selben Trigger, damit `stufe_seit` nicht vergessen werden kann.

create or replace function vorgang_zeitstempel() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.aktualisiert_am := now();
  if new.stufe is distinct from old.stufe then
    new.stufe_seit := now();
  end if;
  return new;
end;
$$;

drop trigger if exists vorgang_zeitstempel on vorgang;
create trigger vorgang_zeitstempel
  before update on vorgang
  for each row execute function vorgang_zeitstempel();

-- ------------------------------------------------------------------
-- Zugriff: von außen nichts
-- ------------------------------------------------------------------
--
-- Alle fünf Tabellen tragen personenbezogene Daten oder verweisen darauf. Sie
-- bekommen RLS und KEINE Policy: damit liest der anon-Schlüssel nichts, auch
-- nicht ein angemeldeter Spieler. Jeder Zugriff läuft serverseitig über den
-- Service-Schlüssel, der RLS umgeht — so wie `getSupabaseAdmin()` bei coachbase.
--
-- Die Entzüge sind Gürtel und Hosenträger: Supabase vergibt an neue Tabellen in
-- `public` per Voreinstellung Rechte an anon und authenticated. Ohne Policy
-- griffe das zwar ins Leere, aber eine Policy ist schneller angelegt als
-- durchdacht, und dann stünde die Tür offen.

alter table vorgang         enable row level security;
alter table vorgang_artikel enable row level security;
alter table vorgang_person  enable row level security;
alter table ereignis        enable row level security;
alter table mail_versand    enable row level security;
alter table vorgang_zaehler enable row level security;

do $$
declare rolle text;
begin
  foreach rolle in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = rolle) then
      execute format(
        'revoke all on table vorgang, vorgang_artikel, vorgang_person,
                             ereignis, mail_versand, vorgang_zaehler from %I', rolle);
      execute format('revoke all on function naechste_vorgangsnummer() from %I', rolle);
    end if;
  end loop;
end;
$$;
