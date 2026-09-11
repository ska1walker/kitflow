"use server";

/**
 * Server Action von F3 · Liste bestätigen.
 *
 * Sie prüft das Token selbst, wie jede Action. Und sie bestätigt nur: die
 * Anfrage an die Händler geht hier noch nicht raus, solange kitflow keine Mail
 * verschickt (docs/offen.md).
 */

import { pruefe } from "@/lib/links";
import { darfBestaetigen, gefallene } from "@/lib/pruefungen";
import { bestaetigeListe, ladeListe } from "@/lib/vorgaenge";

export type Ergebnis =
  | { stand: "leer" }
  | { stand: "bestaetigt" }
  | { stand: "fehler"; text: string };

export async function listeBestaetigen(
  vorgang: string,
  token: string,
  _bisher: Ergebnis,
  formular: FormData,
): Promise<Ergebnis> {
  if (!pruefe(token, "bestaetigen", vorgang)) {
    return { stand: "fehler", text: "Dieser Link funktioniert nicht mehr." };
  }

  const liste = await ladeListe(vorgang);
  if (!liste) return { stand: "fehler", text: "Dieser Link funktioniert nicht mehr." };
  if (!liste.offen) {
    return { stand: "fehler", text: "Dieser Vorgang ist über die Größenphase hinaus." };
  }

  if (formular.get("vollstaendig") !== "ja") {
    return { stand: "fehler", text: "Bitte bestätige, dass die Liste vollständig und richtig ist." };
  }

  // Die Prüfungen entscheiden, nicht das Häkchen. Wer bestätigt, was nicht
  // stimmt, schickt sonst eine falsche Anfrage an beide Händler.
  if (!darfBestaetigen(liste.pruefungen)) {
    const nummern = gefallene(liste.pruefungen).map((p) => p.nr).join(", ");
    return {
      stand: "fehler",
      text: `Prüfung ${nummern} ist noch nicht durch. Was fehlt, steht oben im Klartext.`,
    };
  }

  const lieferadresse = String(formular.get("lieferadresse") ?? "").trim();
  const hinweis = String(formular.get("hinweis") ?? "").trim();

  const ok = await bestaetigeListe(vorgang, lieferadresse, hinweis);
  if (!ok) {
    return {
      stand: "fehler",
      text: "Das hat gerade nicht geklappt. Bitte versuch es in einer Minute noch einmal.",
    };
  }

  return { stand: "bestaetigt" };
}
