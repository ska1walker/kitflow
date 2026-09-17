"use server";

/**
 * Die Server Actions der Statusseite: eine Voranfrage abbrechen und eine
 * Person in einen laufenden Vorgang nachtragen.
 *
 * Beide pruefen denselben Nachweis – den Trainer-Link. Er traegt den Zweck
 * `status` mit nur der Vorgangsnummer; ein Spieler-Link hat zusaetzlich die
 * Personen-ID unter der Signatur und kommt hier deshalb nicht durch.
 *
 * Abbrechen: der Weg nach vorn ist F1b, der Weg zurueck fehlte bisher ganz –
 * sagt der Sponsor ab, lag der Vorgang ohne Ausweg auf Stufe 0
 * (docs/konzept.md).
 */

import { hubspot, hubspotAktiv, PIPELINE_NAME, type HsListe, type HsObjekt } from "@/lib/hubspot";
import { groessenLink, pruefe } from "@/lib/links";
import { ladeVoranfrage } from "@/lib/ergaenzen";
import { trageNach } from "@/lib/vorgaenge";

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

export type NachtragErgebnis =
  | { stand: "leer" }
  | { stand: "fertig"; name: string; pfad: string }
  | { stand: "fehler"; text: string };

/**
 * Traegt eine Person in einen laufenden Vorgang nach.
 *
 * Derselbe Token wie beim Abbrechen: der Trainer-Link mit dem Zweck `status`
 * und nur der Vorgangsnummer. Ein Spieler-Link traegt zusaetzlich die
 * Personen-ID unter der Signatur und kommt hier nicht durch.
 *
 * Zurueck kommt der frische Groessen-Link, als Pfad. Absolut macht ihn die
 * Karte aus der Adresse, unter der die Seite gerade laeuft: `KITFLOW_BASIS`
 * ist fuer Mails da und kann fehlen: dann stuende hier nur ein Versprechen
 * und kein Link. Solange M2 nicht gebaut ist, verteilt der Trainer ihn
 * selbst – er muss ihn also wirklich sehen.
 */
export async function personNachtragen(
  vorgang: string,
  token: string,
  _bisher: NachtragErgebnis,
  formular: FormData,
): Promise<NachtragErgebnis> {
  if (!pruefe(token, "status", vorgang)) {
    return { stand: "fehler", text: "Dieser Link funktioniert nicht mehr." };
  }

  const person = String(formular.get("person") ?? "").trim();
  if (!person) return { stand: "fehler", text: "Bitte eine Person wählen." };

  if (!hubspotAktiv()) {
    return { stand: "fehler", text: "Das hat gerade nicht geklappt. Bitte versuch es später." };
  }

  const ergebnis = await trageNach(vorgang, person);
  if (!ergebnis.ok) return { stand: "fehler", text: ergebnis.fehler };

  return { stand: "fertig", name: ergebnis.name, pfad: groessenLink(vorgang, person) ?? "" };
}
