-- 002 · Entwürfe: der Bestätigungsklick an /neu
--
-- `/neu` steht offen im Netz. Bis hierher prüfte das Formular, ob die Adresse
-- einem Trainer gehört — aber nicht, ob der am Formular diese Adresse besitzt.
-- Die Adressen des Vereins folgen dem Muster vorname.nachname@…, und wer
-- Trainer ist, steht auf fussball.de. Ein Fremder konnte damit einen Vorgang in
-- fremdem Namen anlegen.
--
-- Jetzt entsteht beim Abschicken nur ein Entwurf. Erst der Klick auf den Link
-- in der Mail legt den Vorgang an — und den Link bekommt nur, wer das Postfach
-- wirklich hat.
--
-- Der Entwurf trägt Name, Adresse und Telefon des Trainers. Deshalb: RLS ohne
-- Policy (nur der Dienst-Schlüssel kommt heran) und ein Verfallsdatum, das der
-- tägliche Lauf durchsetzt. Ein unbestätigter Entwurf darf nicht liegenbleiben.

create table if not exists vorgang_entwurf (
  id uuid primary key default gen_random_uuid(),
  -- Die Adresse, an die der Bestätigungslink ging. Steht eigenständig da,
  -- damit sich Entwürfe einer Adresse zählen lassen, ohne das JSON zu öffnen.
  email text not null,
  -- Die Eingabe aus F1, unverändert. Als JSON, weil hier nichts gesucht oder
  -- verknüpft wird: der Entwurf wird einmal geschrieben und einmal gelesen.
  daten jsonb not null,
  angelegt_am timestamptz not null default now()
);

create index if not exists vorgang_entwurf_angelegt_am_idx
  on vorgang_entwurf (angelegt_am);

alter table vorgang_entwurf enable row level security;

-- Bewusst keine Policy: damit kommt weder `anon` noch `authenticated` an eine
-- Zeile. Alle Zugriffe laufen serverseitig über den Dienst-Schlüssel, genau wie
-- bei den übrigen Tabellen (docs/datenbank.md).
