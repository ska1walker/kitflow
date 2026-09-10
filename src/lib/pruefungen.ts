/**
 * Die sechs Prüfungen vor der Anfrage (docs/konzept.md).
 *
 * Sie sind der Grund, warum F3 existiert: eine Anfrage mit falschen Größen
 * kostet den Händler Arbeit und die Mannschaft eine Runde Zeit. Was sich nicht
 * prüfen lässt, bekommt deshalb den Stand `offen` und sagt warum — nicht
 * `bestanden`. Eine Prüfung, die nichts prüft, ist schlimmer als keine.
 */

export type PruefStand = "bestanden" | "gefallen" | "offen";

export type Pruefung = {
  nr: number;
  titel: string;
  stand: PruefStand;
  /** Was konkret fehlt, im Klartext für Mail M6. */
  details: string[];
};

export function gefallene(pruefungen: Pruefung[]): Pruefung[] {
  return pruefungen.filter((p) => p.stand === "gefallen");
}

export function offene(pruefungen: Pruefung[]): Pruefung[] {
  return pruefungen.filter((p) => p.stand === "offen");
}

/**
 * Bestätigen darf, wer keine gefallene Prüfung hat.
 *
 * Offene blockieren nicht. Sonst könnte niemand je bestätigen, solange kitflow
 * das Vereinslogo nicht kennt — eine Prüfung, die nichts prüfen kann, ist kein
 * Grund, die Mannschaft warten zu lassen. Sie steht aber sichtbar da, damit
 * niemand glaubt, sie sei durchgelaufen.
 */
export function darfBestaetigen(pruefungen: Pruefung[]): boolean {
  return gefallene(pruefungen).length === 0;
}

export function pruefung(nr: number, titel: string, details: string[]): Pruefung {
  return { nr, titel, stand: details.length === 0 ? "bestanden" : "gefallen", details };
}

export function offen(nr: number, titel: string, grund: string): Pruefung {
  return { nr, titel, stand: "offen", details: [grund] };
}
