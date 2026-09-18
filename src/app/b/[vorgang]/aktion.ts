"use server";

/**
 * Server Action von F3 · Liste bestätigen.
 *
 * Sie prüft das Token selbst, wie jede Action. Seit der Freigabe von M4 geht
 * hier auch die Anfrage an die Händler raus — ohne einen einzigen
 * Spielernamen (`anfrage.ts`).
 */

import { pruefe } from "@/lib/links";
import { darfBestaetigen, gefallene } from "@/lib/pruefungen";
import { bestaetigeListe, ladeListe } from "@/lib/vorgaenge";

export type Ergebnis =
  | { stand: "leer" }
  | {
      stand: "bestaetigt";
      /** An wie viele Haendler die Anfrage ging. 0 bei einem Groessencheck. */
      anHaendler: number;
      /** Es ist kein Haendler hinterlegt – die Anfrage liegt bei der Spartenleitung. */
      ohneHaendler: boolean;
    }
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

  const abruf = await ladeListe(vorgang);
  if (abruf.stand === "gestoert") {
    return { stand: "fehler", text: "kitflow kommt gerade nicht an die Daten. Bitte versuch es in einer Minute noch einmal." };
  }
  if (abruf.stand !== "da") {
    return { stand: "fehler", text: "Dieser Link funktioniert nicht mehr." };
  }
  const liste = abruf.daten;
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

  // `bestaetigeListe` gibt ein Objekt zurueck, kein Ja/Nein: ein Objekt ist
  // immer wahr, `if (!ergebnis)` waere also nie erfuellt und ein Fehlschlag
  // kaeme als Erfolg durch. Deshalb ausdruecklich auf `.ok`.
  const bestaetigt = await bestaetigeListe(vorgang, lieferadresse, hinweis);
  if (!bestaetigt.ok) {
    return {
      stand: "fehler",
      text: "Das hat gerade nicht geklappt. Bitte versuch es in einer Minute noch einmal.",
    };
  }

  return {
    stand: "bestaetigt",
    anHaendler: bestaetigt.anHaendler,
    ohneHaendler: bestaetigt.ohneHaendler,
  };
}
