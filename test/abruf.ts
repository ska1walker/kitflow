import type { Abruf } from "@/lib/vorgaenge-db";

/**
 * Packt einen erfolgreichen Abruf aus und fällt laut um, wenn er keiner ist.
 *
 * Vorher stand in den Tests `(await ladeListe(…))!`. Das Ausrufezeichen macht
 * aus „kam gar nichts zurück“ einen Folgefehler drei Zeilen später, und die
 * Meldung nennt dann irgendein Feld statt des Grundes.
 */
export function da<T>(abruf: Abruf<T>): T {
  if (abruf.stand !== "da") {
    throw new Error(`Abruf erwartet: „da“, bekommen: „${abruf.stand}“`);
  }
  return abruf.daten;
}
