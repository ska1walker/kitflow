/**
 * Die Saetze der Statusseite.
 *
 * Sie entstehen aus dem Vorgang, nicht aus einer festen Tabelle: sobald die
 * Daten aus HubSpot kommen, stimmen Zahlen und Namen automatisch. Ton nach
 * docs/konzept.md – Trainer und Spieler per du.
 */

import { ERSTE_STUFE, LETZTE_STUFE } from "./stufen";
import type { Ansicht, NaechsterSchritt, Vorgang } from "./typen";

/**
 * „einen Händler“ oder „3 Händler“ — nie „1 Händler“.
 *
 * Stand an vier Stellen, davon eine falsch: die Todoist-Aufgabe schrieb
 * „1 Händler“, während die Mail und die Karte daneben es richtig machten. Eine
 * Regel, ein Test, vier Aufrufer.
 *
 * Kein `server-only` in dieser Datei — die Freigabe-Karte im Browser braucht
 * denselben Satz.
 */
export function haendlerZahl(anzahl: number): string {
  return anzahl === 1 ? "einen Händler" : `${anzahl} Händler`;
}

function gewaehlterHaendler(v: Vorgang): string {
  return v.haendler.find((h) => h.gewaehlt)?.name ?? "der gewählte Händler";
}

function fehlend(v: Vorgang): number {
  return Math.max(0, v.groessenGesamt - v.groessenEingetragen);
}

/** Der Satz unter „Aktueller Stand“. */
export function statusText(v: Vorgang, ansicht: Ansicht): string {
  const spieler = ansicht === "spieler";
  const sponsor = v.sponsor ? `Sponsor ${v.sponsor}` : "der Sponsor";

  switch (v.stufe) {
    case 0:
      return spieler
        ? "Für deine Mannschaft wird gerade ein Richtpreis eingeholt. Größen kommen später."
        : "Die Voranfrage steht. Mit dem Richtpreis kannst du einen Sponsor ansprechen; die genauen Größen kommen danach.";
    case 1:
      return spieler
        ? "Deine Größen sind drin. Bis zur Frist kannst du sie noch ändern."
        : `${v.groessenEingetragen} von ${v.groessenGesamt} haben ihre Größen eingetragen.`;
    case 2:
      return spieler
        ? "Die Liste ist bei zwei Händlern. Sie erstellen jetzt ihre Angebote."
        : `${v.haendler.map((h) => h.name).join(" und ")} haben die Liste.`;
    case 3:
      return spieler
        ? "Beide Angebote sind da. Die Spartenleitung entscheidet in den nächsten Tagen."
        : "Beide Angebote sind da. Die Spartenleitung vergleicht Preis, Lieferzeit und Beflockung.";
    case 4:
      return spieler
        ? "Ein Angebot ist gewählt. Jetzt kommt das Geld vom Sponsor."
        : `${gewaehlterHaendler(v)} ist gewählt. ${sponsor} hat zugesagt, das Geld ist aber noch nicht auf dem Vereinskonto.`;
    case 5:
      return spieler
        ? "Das Geld ist da, die Bestellung geht in Kürze raus."
        : "Das Geld ist da, die Deckungsprüfung ist erfüllt. Die Bestellung kann raus.";
    case 6:
      return spieler
        ? "Bestellt. Die Lieferung ist angekündigt."
        : `Bestellt bei ${gewaehlterHaendler(v)}.`;
    case 7:
      return spieler
        ? "Die Sachen sind beim Trainer. Er gibt sie beim nächsten Training aus."
        : "Geliefert. Bitte ausgeben und kurz bestätigen.";
    case 8:
      return spieler
        ? "Fertig. Deine Größen sind für die nächste Bestellung gespeichert."
        : "Alles ausgegeben, die Rechnung ist bezahlt und gebucht. Die Größen sind für die nächste Runde gespeichert.";
    case 9:
      return spieler
        ? "Dieser Vorgang wurde abgebrochen. Es wurde nichts bestellt."
        : "Dieser Vorgang wurde von der Spartenleitung abgebrochen. Es wurde nichts bestellt.";
  }
}

/** „Als Nächstes: wer tut was“. `null` heisst: nichts mehr offen. */
export function naechsterSchritt(v: Vorgang, ansicht: Ansicht): NaechsterSchritt | null {
  const spieler = ansicht === "spieler";
  const nichtsZuTun = "Für dich gibt es gerade nichts zu tun.";

  switch (v.stufe) {
    case 0:
      return spieler
        ? { wer: "Trainer", was: nichtsZuTun }
        : {
            wer: "Du",
            was: "Sobald der Richtpreis da ist und die Finanzierung klar wird, vervollständigst du die Angaben. Erst dann werden Größen abgefragt.",
            du: true,
          };
    case 1:
      return spieler
        ? {
            wer: "Die Mannschaft",
            was: "Sobald alle ihre Größen eingetragen haben, prüft der Trainer die Liste.",
          }
        : {
            wer: "Du",
            was: `Wenn alle drin sind, bekommst du die Liste zum Prüfen. ${fehlend(v)} ${
              fehlend(v) === 1 ? "fehlt" : "fehlen"
            } noch.`,
            du: true,
          };
    case 2:
      return spieler
        ? { wer: "Die Händler", was: nichtsZuTun }
        : {
            wer: "Die Händler",
            was: "Sobald beide Angebote da sind, wählt die Spartenleitung aus, spätestens fünf Tage nach dem ersten.",
          };
    case 3:
      return spieler
        ? { wer: "Spartenleitung", was: nichtsZuTun }
        : { wer: "Spartenleitung", was: "wählt ein Angebot aus. Du bekommst danach eine Mail." };
    case 4:
      return spieler
        ? { wer: "Sponsor", was: nichtsZuTun }
        : {
            wer: v.sponsor ? `Sponsor ${v.sponsor}` : "Der Sponsor",
            was: "überweist. Bestellt wird erst, wenn das Geld da ist. Eine Zusage allein reicht nicht.",
          };
    case 5:
      return spieler
        ? { wer: "Spartenleitung", was: nichtsZuTun }
        : { wer: "Spartenleitung", was: "gibt die Bestellung frei." };
    case 6:
      return spieler
        ? { wer: "Händler", was: "liefert an deinen Trainer. Er gibt die Sachen aus." }
        : { wer: gewaehlterHaendler(v), was: "liefert beflockt an dich als Trainer." };
    case 7:
      return spieler
        ? { wer: "Trainer", was: "gibt die Sachen aus." }
        : {
            wer: "Du",
            was: "gibst die Sachen aus und bestätigst es mit einem Klick.",
            du: true,
          };
    default:
      return null;
  }
}

/** Die Zeile unter der Schrittleiste. */
export function fortschrittText(stufe: Vorgang["stufe"]): string {
  if (stufe > LETZTE_STUFE) return "Abgebrochen";
  if (stufe < ERSTE_STUFE) return `Vor Schritt 1 von ${LETZTE_STUFE}`;
  if (stufe < LETZTE_STUFE) return `Schritt ${stufe} von ${LETZTE_STUFE}`;
  return `Alle ${LETZTE_STUFE} Schritte erledigt`;
}
