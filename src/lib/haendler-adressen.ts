/**
 * Die Adressen der Händler, an die eine Angebotsanfrage geht (M4).
 *
 * Heisst `anfrageHaendler`, weil `haendler` in `vorgaenge-db.ts` schon vergeben
 * ist: dort sind es die beiden Spalten am Vorgang, in denen die Angebote
 * stehen. Hier geht es um Adressen, an die etwas verschickt wird.
 *
 * Sie stehen in `HAENDLER`, nicht im Code: eine Adresse ändert sich, ein
 * Ansprechpartner wechselt, und beides soll kein Deployment brauchen. Format,
 * je Händler mit `|` getrennt, Händler untereinander mit Komma:
 *
 *     Intersport Uelzen|Herr Hillebrecht|m.hillebrecht@example.de,
 *     11teamsports|Herr Bormann|j.bormann@example.de
 *
 * Der mittlere Teil darf leer bleiben; dann steht „Sehr geehrte Damen und
 * Herren“ in der Mail.
 *
 * **Fehlt die Variable, geht keine Anfrage raus.** Das ist dieselbe Regel wie
 * bei `LINK_SECRET`, `SPARTE_EMAILS` und `CRON_SECRET`: ohne Angabe passiert
 * nichts, statt dass etwas Falsches passiert. Bei M4 wiegt sie am schwersten —
 * sie ist die einzige Mail, die das Haus verlässt, und niemand holt sie zurück.
 */

export type AnfrageHaendler = {
  /** Firmenname, wie er in der Mail und im Verlauf auftaucht. */
  name: string;
  /** „Sehr geehrter Herr Bormann“ – ohne Angabe die neutrale Anrede. */
  anrede: string;
  email: string;
};

const NEUTRAL = "Sehr geehrte Damen und Herren";

/** Grob genug, um Tippfehler zu fangen, ohne gültige Adressen abzuweisen. */
function istAdresse(wert: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(wert);
}

export function anfrageHaendler(): AnfrageHaendler[] {
  return (process.env.HAENDLER ?? "")
    .split(",")
    .map((eintrag) => eintrag.split("|").map((t) => t.trim()))
    .map(([name, anrede, email]) => ({
      name: name ?? "",
      anrede: anrede ? (anrede.startsWith("Sehr") ? anrede : `Sehr geehrter ${anrede}`) : NEUTRAL,
      email: email ?? "",
    }))
    // Ein Eintrag ohne Adresse ist kein Händler, sondern ein Tippfehler. Er
    // wird ausgelassen und nicht etwa an eine halbe Adresse geschickt.
    .filter((h) => h.name.length > 0 && istAdresse(h.email));
}

/** Steht mindestens ein Händler bereit? */
export function haendlerAktiv(): boolean {
  return anfrageHaendler().length > 0;
}
