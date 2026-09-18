import "server-only";

/**
 * Entwürfe: der Bestätigungsklick an `/neu` (docs/formulare.md).
 *
 * `/neu` ist die einzige Seite ohne Token. Sie prüfte bisher, ob die
 * eingetragene Adresse einem Trainer der Fußballsparte gehört — aber nicht, ob
 * der am Formular diese Adresse besitzt. Die Adressen des Vereins folgen dem
 * Muster `vorname.nachname@…`, und wer Trainer ist, steht auf fussball.de. Ein
 * Fremder konnte damit einen Vorgang in fremdem Namen anlegen: 26 Kontakte
 * daran, M1 an jemanden, der nichts gemeldet hat.
 *
 * Jetzt entsteht beim Abschicken **nichts** — nur ein Entwurf. Erst der Klick
 * auf den Link in der Mail legt den Vorgang an, und den Link bekommt nur, wer
 * das Postfach wirklich hat.
 *
 * Zwei Dinge, die zum Entwurf gehören und leicht vergessen werden:
 *
 * - Er trägt **Name, Adresse und Telefon** des Trainers. Die Tabelle steht
 *   deshalb hinter RLS ohne Policy, und `raeumeEntwuerfe` löscht, was
 *   abgelaufen ist. Ein unbestätigter Entwurf darf nicht liegenbleiben.
 * - Er **verfällt**. Ein Link, der ewig gilt, ist wieder ein Link, der in einer
 *   weitergeleiteten Mail auftaucht und Monate später einen Vorgang anlegt.
 */

import { db, lese, schreibe } from "./db";
import type { BedarfEingabe } from "./bedarf";

/** So lange gilt ein Bestätigungslink. */
export const GUELTIG_STUNDEN = 24;

/** So lange bleibt ein unbestätigter Entwurf überhaupt stehen. */
const AUFBEWAHRUNG_STUNDEN = 72;

type EntwurfRoh = {
  id: string;
  email: string;
  daten: BedarfEingabe;
  angelegt_am: string;
};

export type Entwurf = {
  id: string;
  email: string;
  daten: BedarfEingabe;
  angelegtAm: string;
};

export type EntwurfAbruf =
  | { stand: "da"; entwurf: Entwurf }
  | { stand: "unbekannt" }
  | { stand: "abgelaufen" }
  | { stand: "gestoert" };

/**
 * Parkt eine Eingabe und gibt die ID zurück, oder `null`.
 *
 * `null` heißt ausdrücklich „nicht gespeichert“ — der Aufrufer darf daraus nie
 * einen Erfolg machen, sonst verspricht die Seite eine Mail zu einem Entwurf,
 * den es nicht gibt.
 */
export async function parkeEntwurf(eingabe: BedarfEingabe): Promise<string | null> {
  const zeilen = await schreibe<{ id: string }>("vorgang_entwurf", {
    email: eingabe.email,
    daten: eingabe,
  });
  return zeilen?.[0]?.id ?? null;
}

/** Stunden zwischen zwei Zeitpunkten, als Bruchzahl. */
function stundenSeit(wert: string, jetzt: Date): number | null {
  const zeit = new Date(wert);
  if (Number.isNaN(zeit.getTime())) return null;
  return (jetzt.getTime() - zeit.getTime()) / 3_600_000;
}

/**
 * Holt einen Entwurf. Vier Stände, und sie dürfen nicht zusammenfallen:
 * „gibt es nicht“ und „abgelaufen“ sehen für den Trainer verschieden aus
 * (einmal ist der Link falsch, einmal war er zu langsam), und „gestört“ ist
 * keins von beidem.
 */
export async function holeEntwurf(id: string, jetzt: Date = new Date()): Promise<EntwurfAbruf> {
  // Ohne diese Prüfung ginge ein beliebiger Text als Filterwert an PostgREST.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { stand: "unbekannt" };

  const zeilen = await lese<EntwurfRoh>("vorgang_entwurf", { id: `eq.${id}`, limit: "1" });
  if (zeilen === null) return { stand: "gestoert" };

  const roh = zeilen[0];
  if (!roh) return { stand: "unbekannt" };

  const alter = stundenSeit(roh.angelegt_am, jetzt);
  if (alter === null || alter > GUELTIG_STUNDEN) return { stand: "abgelaufen" };

  return {
    stand: "da",
    entwurf: { id: roh.id, email: roh.email, daten: roh.daten, angelegtAm: roh.angelegt_am },
  };
}

/**
 * Löscht einen Entwurf, nachdem daraus ein Vorgang geworden ist.
 *
 * Scheitert das, ist der Vorgang trotzdem gültig — der Entwurf fällt dann dem
 * Aufräumen zu. Deshalb hält hier nichts den Trainer auf.
 */
export async function loescheEntwurf(id: string): Promise<void> {
  const weg = await db<unknown[]>({
    pfad: "vorgang_entwurf",
    methode: "DELETE",
    suche: { id: `eq.${id}` },
  });
  if (weg === null) console.error("Entwurf nicht gelöscht");
}

/**
 * Räumt abgelaufene Entwürfe weg. Läuft im täglichen Lauf mit.
 *
 * Das ist kein Hausputz, sondern Teil der Sache: in einem Entwurf stehen Name,
 * Adresse und Telefon eines Menschen, der am Ende vielleicht gar nichts
 * gemeldet hat.
 */
export async function raeumeEntwuerfe(jetzt: Date = new Date()): Promise<boolean> {
  const grenze = new Date(jetzt.getTime() - AUFBEWAHRUNG_STUNDEN * 3_600_000).toISOString();
  const weg = await db<unknown[]>({
    pfad: "vorgang_entwurf",
    methode: "DELETE",
    suche: { angelegt_am: `lt.${grenze}` },
  });
  if (weg === null) console.error("Abgelaufene Entwürfe nicht aufgeräumt");
  return weg !== null;
}
