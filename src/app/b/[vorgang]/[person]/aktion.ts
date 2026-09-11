"use server";

/**
 * Server Action von F2 als Trainer.
 *
 * Prüft das Token selbst, wie jede Action. Der Zweck ist `trainer`: ein
 * Spieler-Link öffnet dieses Formular nicht.
 */

import { pruefe } from "@/lib/links";
import { ladeTrainerAbfrage, speichereTrainerAngaben } from "@/lib/vorgaenge";

export type Ergebnis =
  | { stand: "leer" }
  | { stand: "gespeichert" }
  | { stand: "fehler"; text: string };

export async function trainerAngabenSpeichern(
  vorgang: string,
  person: string,
  token: string,
  _bisher: Ergebnis,
  formular: FormData,
): Promise<Ergebnis> {
  if (!pruefe(token, "trainer", vorgang, person)) {
    return { stand: "fehler", text: "Dieser Link funktioniert nicht mehr." };
  }

  const abfrage = await ladeTrainerAbfrage(vorgang, person);
  if (!abfrage) return { stand: "fehler", text: "Dieser Link funktioniert nicht mehr." };
  if (!abfrage.offen) {
    return { stand: "fehler", text: "Dieser Vorgang ist über die Größenphase hinaus." };
  }

  const groessen: Record<string, string> = {};
  for (const frage of abfrage.fragen) {
    const wert = formular.get(frage.feld);
    if (typeof wert === "string" && wert !== "") groessen[frage.feld] = wert;
  }

  const ergebnis = await speichereTrainerAngaben(abfrage, {
    groessen,
    nummer: String(formular.get("nummer") ?? "").trim(),
    ausgeschlossen: formular.get("ausgeschlossen") === "ja",
    torwart: formular.get("torwart") === "ja",
  });

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
