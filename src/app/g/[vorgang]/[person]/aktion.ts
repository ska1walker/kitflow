"use server";

/**
 * Server Action der Größenabfrage (F2).
 *
 * Sie prüft das Token selbst. Eine Server Action ist eine eigene Adresse und
 * lässt sich ohne die Seite aufrufen; sich darauf zu verlassen, dass die Seite
 * schon geprüft hat, wäre keine Prüfung.
 */

import { pruefe } from "@/lib/links";
import { ladeGroessenAbfrage, speichereGroessen } from "@/lib/vorgaenge";

export type Ergebnis =
  | { stand: "leer" }
  | { stand: "gespeichert" }
  | { stand: "fehler"; text: string };

export async function groessenSpeichern(
  vorgang: string,
  person: string,
  token: string,
  _bisher: Ergebnis,
  formular: FormData,
): Promise<Ergebnis> {
  if (!pruefe(token, "groessen", vorgang, person)) {
    return { stand: "fehler", text: "Dieser Link funktioniert nicht mehr." };
  }

  const abfrage = await ladeGroessenAbfrage(vorgang, person);
  if (!abfrage) {
    return { stand: "fehler", text: "Dieser Link funktioniert nicht mehr." };
  }
  if (!abfrage.offen) {
    return {
      stand: "fehler",
      text: "Die Größen für diesen Vorgang sind schon abgeschlossen.",
    };
  }

  // Nur die Felder lesen, die vorher als Frage rausgingen. Was das Formular
  // sonst noch mitschickt, geht uns nichts an.
  const eingaben: Record<string, string> = {};
  for (const frage of abfrage.fragen) {
    const wert = formular.get(frage.feld);
    if (typeof wert === "string") eingaben[frage.feld] = wert;
  }

  const fehlend = abfrage.fragen.filter((f) => !eingaben[f.feld]);
  if (fehlend.length > 0) {
    return {
      stand: "fehler",
      text: `Bitte noch ausfüllen: ${fehlend.map((f) => f.label).join(", ")}.`,
    };
  }

  const ok = await speichereGroessen(abfrage, eingaben);
  if (!ok) {
    return {
      stand: "fehler",
      text: "Das hat gerade nicht geklappt. Bitte versuch es in einer Minute noch einmal.",
    };
  }

  return { stand: "gespeichert" };
}
