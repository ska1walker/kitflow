-- kitflow · 005 · Vereinswappen auf der Händleranfrage
--
-- Kais Ansage (20.09.2026): das Wappen soll nicht immer mit drauf, sondern
-- angehakt werden können. Und es gehört nach draußen, nicht nach innen — der
-- Händler soll den Verein sehen, ein Spieler in der Größenabfrage braucht es
-- nicht.
--
-- Deshalb ein Schalter je Vorgang statt einer globalen Einstellung: ob ein
-- Wappen angemessen ist, hängt am Anlass, nicht am Verein.
--
-- `default false` mit Absicht. Ein Wappen, das ungefragt in jeder Mail an einen
-- Geschäftspartner steht, ist der teurere Fehler — es lässt sich nicht
-- zurückholen, und die Datei ist ohnehin erst nach dem ersten echten Durchlauf
-- geprüft.
--
-- Wiederholbar: legt nur an, was fehlt, und löscht nichts.

alter table vorgang
  add column if not exists wappen_mit boolean not null default false;

comment on column vorgang.wappen_mit is
  'Wappen an die Haendleranfrage M4 anhaengen. Nur nach aussen, nie an Spieler.';
