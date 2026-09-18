"use server";

/**
 * Server Action von F3 · Liste bestätigen.
 *
 * Sie prüft das Token selbst, wie jede Action.
 *
 * **Hier geht nichts mehr nach draußen.** Die Bestätigung stellt die Anfrage
 * nur noch zur Freigabe (`freigabe.ts`); verschickt wird sie erst, wenn die
 * Spartenleitung zustimmt. Ein Trainer soll die Mail an zwei echte
 * Geschäftspartner nicht allein auslösen können.
 */

import { pruefe } from "@/lib/links";
import { darfBestaetigen, gefallene } from "@/lib/pruefungen";
import { bestaetigeListe, ladeListe, type BestaetigungsErgebnis } from "@/lib/vorgaenge";

/** Wie es ausging, wenn es geklappt hat – ohne den Fehlschlag. */
export type Ausgang = Extract<BestaetigungsErgebnis, { ok: true }>;

export type Ergebnis =
  | { stand: "leer" }
  /** `wie` wird durchgereicht, statt in Flaggen zerlegt und wieder
   *  zusammengesetzt zu werden – die Seite liest es in einem `switch`. */
  | { stand: "bestaetigt"; wie: Ausgang }
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

  return { stand: "bestaetigt", wie: bestaetigt };
}
