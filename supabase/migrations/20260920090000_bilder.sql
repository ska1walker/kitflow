-- kitflow · 006 · Sponsorlogo und Artikelbilder
--
-- Zwei Bilder, zwei ganz verschiedene Anlässe:
--
-- `vorgang.sponsor_logo` geht mit der Anfrage an den Händler — der braucht die
-- Datei zum Drucken. Es wechselt je Vorgang, weil der Sponsor wechselt.
--
-- `vorgang_artikel.bild` sieht der Spieler, wenn er seine Größe einträgt. Kais
-- Ansage vom 20.09.2026: „dass die Spieler auch gleich sehen, um was es geht."
--
-- Gespeichert wird **der Pfad in der Ablage**, nicht die Datei. Bytes gehören
-- nicht in eine Zeile, die bei jeder Übersicht mitgelesen wird.
--
-- Beide bleiben leer, solange niemand etwas hochlädt, und beide sind nullable:
-- ein Vorgang ohne Sponsor und ein Artikel ohne Foto sind der Normalfall, nicht
-- der Mangel.
--
-- Was hier NICHT hingehört: das Vereinswappen. Das ändert sich nie und liegt als
-- Datei im Projekt (`src/assets/wappen.png`, Migration 005).
--
-- Wiederholbar: legt nur an, was fehlt, und löscht nichts.

alter table vorgang
  add column if not exists sponsor_logo text;

alter table vorgang_artikel
  add column if not exists bild text;

comment on column vorgang.sponsor_logo is
  'Pfad in der Ablage (privater Eimer "kitflow"). Haengt an M4 fuer den Druck.';
comment on column vorgang_artikel.bild is
  'Pfad in der Ablage. Zeigt dem Spieler in F2, worum es geht. Nie ein Personenfoto.';
