-- kitflow · 004 · Die Freigabe der Händleranfrage
--
-- Bis hierher löste die Bestätigung des Trainers die Anfrage an die Händler
-- unmittelbar aus. Das war falsch herum: M4 geht an zwei echte
-- Geschäftspartner, ist nicht zurückzuholen, und ein Trainer sollte sie nicht
-- allein auslösen können. Kais Ansage: die Spartenleitung genehmigt.
--
-- Der Zustand lebt hier und nicht in Telegram oder Todoist. Die beiden sind
-- Benachrichtigungen ÜBER diesen Zustand; fallen sie aus, wartet die Freigabe
-- trotzdem sichtbar auf /sparte. Eine Freigabe, die nur als Chatnachricht
-- existiert, wäre weg, sobald jemand die Nachricht wegwischt.
--
-- `freigabe_von` trägt, WER entschieden hat — eine Adresse aus SPARTE_EMAILS
-- oder der Name einer Regel. Die Freigabe soll später automatisch durchlaufen
-- können (Kai, 18.09.2026); dann steht dort die Regel statt eines Menschen,
-- und der Verlauf bleibt trotzdem lesbar.
--
-- Wiederholbar: legt nur an, was fehlt, und löscht nichts.

alter table vorgang
  -- keine        – noch nie bestätigt, oder ein reiner Größencheck
  -- offen        – der Trainer hat bestätigt, die Freigabe steht aus
  -- freigegeben  – die Anfrage darf raus (und ging raus)
  -- abgelehnt    – die Spartenleitung hat gestoppt, Grund steht daneben
  add column if not exists freigabe_stand text not null default 'keine'
    check (freigabe_stand in ('keine', 'offen', 'freigegeben', 'abgelehnt')),

  -- Adresse eines Menschen oder Name einer Regel. Beides ist eine Antwort auf
  -- „wer war das“, und beides gehört in den Verlauf.
  add column if not exists freigabe_von   text,
  add column if not exists freigabe_am    timestamptz,

  -- Nur beim Ablehnen: der Grund, den der Trainer zu lesen bekommt.
  add column if not exists freigabe_grund text;

comment on column vorgang.freigabe_stand is
  'Freigabe der Haendleranfrage M4. Ohne freigegeben geht keine Mail nach draussen.';
comment on column vorgang.freigabe_von is
  'Adresse eines Spartenleiters oder Name der Regel, die automatisch freigegeben hat.';

-- Die offenen Freigaben werden auf jedem Aufruf von /sparte gesucht. Es sind
-- nie viele, aber der Index kostet nichts und die Absicht steht damit im
-- Schema statt nur in der Abfrage.
create index if not exists vorgang_freigabe_offen_idx
  on vorgang (freigabe_stand) where freigabe_stand = 'offen';
