-- kitflow · 007 · Wunschtermin als eigene Spalte
--
-- `stufe_frist` trug zwei Bedeutungen. In `ansicht.ts` heißt sie „Frist der
-- Kaskadenstufe" — wann eine Stufe abläuft. In `vorgaenge.ts` ging sie als
-- **Wunschtermin** in die Händleranfrage M4.
--
-- Geschrieben hat sie nie jemand, deshalb fiel es nicht auf. Die Folge war
-- trotzdem sichtbar: M4 sagte ausnahmslos „Wunschtermin: nach Absprache", und
-- auf /sparte trug ab Stufe 2 kein Vorgang mehr eine Frist.
--
-- Gefährlich wäre erst der Tag gewesen, an dem jemand die Spalte für ihren
-- dokumentierten Zweck füllt — eine Frist für die Sponsorensuche auf Stufe 0.
-- Sie hätte stillschweigend als Liefertermin in einer Mail an einen echten
-- Geschäftspartner gestanden.
--
-- `stufe_frist` bleibt, was sie heißt. Der Wunschtermin bekommt eine eigene
-- Spalte und wird in F1 gefragt.
--
-- Wiederholbar: legt nur an, was fehlt, und löscht nichts.

alter table vorgang
  add column if not exists wunschtermin date;

comment on column vorgang.wunschtermin is
  'Wunschtermin fuer die Lieferung. Geht so in M4. Leer heisst "nach Absprache".';
comment on column vorgang.stufe_frist is
  'Frist der aktuellen Stufe (z. B. Sponsorensuche auf Stufe 0). NICHT der Liefertermin.';
