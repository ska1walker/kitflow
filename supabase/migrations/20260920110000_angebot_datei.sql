-- kitflow · 008 · Das Angebot als Datei
--
-- Die Zahlen zum Angebot gibt es seit Migration 001: Betrag, Datum, Gültigkeit,
-- Lieferzeit, Abweichungen — je Händler fünf Spalten. Geschrieben hat sie bis
-- zum 20.09.2026 niemand; es gab keinen Weg hinein.
--
-- Was fehlte, ist das Angebot selbst. Bormann und Hillebrecht schicken ein PDF,
-- und das lag danach in einem Postfach statt am Vorgang. Wer später wissen
-- wollte, warum 840 Euro dort stehen, musste im Mailarchiv suchen.
--
-- Gespeichert wird **der Pfad in der Ablage**, nicht die Datei — dieselbe Regel
-- wie beim Sponsorlogo (Migration 006).
--
-- Wiederholbar: legt nur an, was fehlt, und löscht nichts.

alter table vorgang
  add column if not exists angebot_intersport_datei    text,
  add column if not exists angebot_11teamsports_datei  text;

comment on column vorgang.angebot_intersport_datei is
  'Pfad des Angebots-PDF in der Ablage (privater Eimer "kitflow").';
comment on column vorgang.angebot_11teamsports_datei is
  'Pfad des Angebots-PDF in der Ablage (privater Eimer "kitflow").';
