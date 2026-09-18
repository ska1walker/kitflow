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

  const abruf = await ladeGroessenAbfrage(vorgang, person);
  // Eine Stoerung ist kein toter Link. Wer das hier liest, hat gerade seine
  // Groesse eingetippt — er soll es gleich noch einmal versuchen und nicht
  // glauben, sein Link sei abgelaufen.
  if (abruf.stand === "gestoert") {
    return { stand: "fehler", text: "kitflow kommt gerade nicht an die Daten. Bitte versuch es in einer Minute noch einmal." };
  }
  if (abruf.stand !== "da") {
    return { stand: "fehler", text: "Dieser Link funktioniert nicht mehr." };
  }
  const abfrage = abruf.daten;
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

  // Die Initialen stehen nicht in `fragen`: sie haengen am Vorgang, nicht an
  // einer Groessenart. Gelesen werden sie nur, wenn der Vorgang sie braucht.
  if (abfrage.initialenNoetig) {
    const wert = formular.get("initialen");
    eingaben.initialen = typeof wert === "string" ? wert : "";
  }

  const ergebnis = await speichereGroessen(abfrage, eingaben);
  if (!ergebnis.ok) {
    return {
      stand: "fehler",
      text:
        ergebnis.fehler ??
        "Das hat gerade nicht geklappt. Bitte versuch es in einer Minute noch einmal.",
    };
  }

  return { stand: "gespeichert" };
}
