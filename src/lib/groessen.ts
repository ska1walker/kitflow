/**
 * Größen: Werte, Zuordnung zu den HubSpot-Feldern und die Frage, ab wann eine
 * Größe als veraltet gilt (docs/datenmodell.md, docs/konzept.md).
 *
 * Diese Datei ist absichtlich nicht `server-only`: das Formular braucht die
 * Werteliste, und die Zuordnung darf nur einmal im Code stehen. Personendaten
 * stehen hier keine.
 */

import type { Groessenart } from "./typen";

/** Beschriftung je Größenart, wie sie im Formular und auf der Seite steht. */
export const GROESSEN_LABEL: Record<Groessenart, string> = {
  trikot: "Trikot",
  oberteil: "Oberteil",
  shorts: "Kurze Sporthose",
  trainingshose: "Trainingshose",
  schuhe: "Schuhgröße",
  ohne: "Ausstattung",
};

/**
 * Die Größenarten, nach denen sich fragen lässt – „ohne“ ist keine: ein Ball
 * hat keine Größe. Reihenfolge wie im Formular.
 */
export const GROESSENARTEN: Groessenart[] = [
  "trikot",
  "oberteil",
  "trainingshose",
  "shorts",
  "schuhe",
];

/**
 * Die Kontakt-Eigenschaft je Größenart. `ohne` hat keine: ein Ball oder eine
 * Tasche braucht keine Größe.
 */
export const GROESSEN_FELD: Record<Groessenart, string | null> = {
  trikot: "trikot",
  oberteil: "trainingsanzug_oberteil",
  shorts: "kurze_sporthose",
  trainingshose: "trainingshose",
  schuhe: "schuhgroesse",
  ohne: null,
};

/** Alle Kontakt-Eigenschaften, die eine Größe halten. */
export const GROESSEN_FELDER = Object.values(GROESSEN_FELD).filter(
  (feld): feld is string => feld !== null,
);

/** Kleidergrößen, exakt die Werte der HubSpot-Auswahl (docs/datenmodell.md). */
export const KLEIDER_GROESSEN = [
  "116", "128", "140", "152", "164", "176",
  "XS", "S", "M", "L", "XL", "XXL", "XXXL",
];

/** Schuhgrößen 35 bis 51. */
export const SCHUH_GROESSEN = Array.from({ length: 51 - 35 + 1 }, (_, i) => String(35 + i));

export function groessenWerte(art: Groessenart): string[] {
  if (art === "ohne") return [];
  return art === "schuhe" ? SCHUH_GROESSEN : KLEIDER_GROESSEN;
}

/**
 * Eine Größe gilt nach vier Monaten als veraltet, bei Erwachsenen nach zwölf
 * (docs/konzept.md). Kinder wachsen schnell; eine alte Größe darf deshalb im
 * Formular nicht vorausgewählt sein, sonst wird sie ungeprüft bestätigt.
 *
 * Ohne Datum gilt die Größe als veraltet: wir wissen dann nicht, wie alt sie
 * ist, und raten hier nicht zugunsten der Bequemlichkeit.
 */
export function istVeraltet(bestaetigtAm: string | undefined, jugend: boolean): boolean {
  if (!bestaetigtAm) return true;

  const zeitpunkt = new Date(bestaetigtAm);
  if (Number.isNaN(zeitpunkt.getTime())) return true;

  const monate = jugend ? 4 : 12;
  const grenze = new Date(zeitpunkt);
  grenze.setMonth(grenze.getMonth() + monate);
  return grenze.getTime() < Date.now();
}

/**
 * Jugendmannschaft? Die Werte von `team` sind Jahrgänge 2007 bis 2022 sowie
 * „Mädchen“; alles andere ist Erwachsenensport (docs/datenmodell.md).
 *
 * Im Zweifel Jugend: dann nennt die Seite keine Namen und die Größe veraltet
 * schneller. Beides ist die vorsichtigere Seite.
 */
export function istJugend(mannschaft?: string, mannschaftscode?: string): boolean {
  if (!mannschaft && !mannschaftscode) return true;
  if (mannschaftscode && /^JG/i.test(mannschaftscode)) return true;
  if (!mannschaft) return true;

  return mannschaft
    .split(";")
    .map((w) => w.trim())
    .some((w) => /^20(0[7-9]|1\d|2[0-2])$/.test(w) || w === "Mädchen");
}
