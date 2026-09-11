"use server";

/**
 * Server Action der Statusseite: eine Voranfrage abbrechen.
 *
 * Der Weg nach vorn ist F1b. Der Weg zurueck fehlte bisher ganz: sagt der
 * Sponsor ab, lag der Vorgang ohne Ausweg auf Stufe 0 (docs/konzept.md).
 *
 * Geprueft wird der Trainer-Link. Er traegt den Zweck `status` mit nur der
 * Vorgangsnummer; ein Spieler-Link hat zusaetzlich die Personen-ID unter der
 * Signatur und kommt hier deshalb nicht durch.
 */

import { hubspot, hubspotAktiv, PIPELINE_NAME, type HsListe, type HsObjekt } from "@/lib/hubspot";
import { pruefe } from "@/lib/links";
import { ladeVoranfrage } from "@/lib/ergaenzen";

export type Ergebnis =
  | { stand: "leer" }
  | { stand: "abgebrochen" }
  | { stand: "fehler"; text: string };

export async function voranfrageAbbrechen(
  vorgang: string,
  token: string,
  _bisher: Ergebnis,
  formular: FormData,
): Promise<Ergebnis> {
  if (!pruefe(token, "status", vorgang)) {
    return { stand: "fehler", text: "Dieser Link funktioniert nicht mehr." };
  }
  // Abbrechen passiert nur ueber die Rueckfrage, nie mit einem Klick.
  if (formular.get("abbrechen") !== "ja") {
    return { stand: "fehler", text: "Bitte den Abbruch bestätigen." };
  }
  if (!hubspotAktiv()) {
    return { stand: "fehler", text: "Das hat gerade nicht geklappt. Bitte versuch es später." };
  }

  // Nur eine offene Voranfrage laesst sich hier abbrechen. Alles Weitere
  // entscheidet die Spartenleitung in HubSpot.
  const voranfrage = await ladeVoranfrage(vorgang);
  if (!voranfrage) {
    return { stand: "fehler", text: "Dieser Vorgang ist keine offene Voranfrage mehr." };
  }

  const pipelines = await hubspot<
    HsListe<{ id: string; label: string; stages: { id: string; label: string }[] }>
  >({ pfad: "/crm/v3/pipelines/deals" });
  const stufe9 = pipelines?.results
    .find((p) => p.label === PIPELINE_NAME)
    ?.stages.find((s) => s.label === "Abgebrochen");
  if (!stufe9) {
    return { stand: "fehler", text: "Das hat gerade nicht geklappt. Bitte versuch es später." };
  }

  const gesetzt = await hubspot<HsObjekt>({
    pfad: `/crm/v3/objects/deals/${voranfrage.dealId}`,
    methode: "PATCH",
    koerper: { properties: { dealstage: stufe9.id } },
  });
  if (!gesetzt) {
    return { stand: "fehler", text: "Das hat gerade nicht geklappt. Bitte versuch es später." };
  }

  return { stand: "abgebrochen" };
}
