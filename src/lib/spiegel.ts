import "server-only";

/**
 * Der dünne Spiegel im CRM.
 *
 * Seit dem Umzug lebt der Vorgang in der Datenbank. Im CRM bleibt trotzdem ein
 * Deal stehen, damit in HubSpot sichtbar ist, was läuft — neben den Kontakten,
 * an denen die Größen hängen, und den Firmen der beiden Händler.
 *
 * **Gespiegelt wird in eine Richtung.** Der Deal wird geschrieben und **nie**
 * zurückgelesen. Das hat eine Folge, die man kennen muss:
 *
 * > Eine Stufe, die in HubSpot von Hand verschoben wird, kommt nicht mehr bei
 * > kitflow an.
 *
 * Das ist so entschieden (docs/datenbank.md). Den Ausgleich bringt der
 * Stufenwechsel auf `/sparte`.
 *
 * **Ein gescheiterter Spiegel ist kein gescheiterter Vorgang.** Der Vorgang
 * steht in der Datenbank und ist gültig; im CRM fehlt nur die Sicht darauf.
 * Deshalb wirft hier nichts und bricht hier nichts ab — es wird vermerkt, und
 * zwar intern: der Trainer kann damit nichts anfangen, die Spartenleitung schon.
 */

import {
  hubspot,
  hubspotAktiv,
  PIPELINE_NAME,
  verknuepfen,
  type HsListe,
  type HsObjekt,
} from "./hubspot";
import { stufe as stufeVon } from "./stufen";
import { aendereVorgang, vermerke, type VorgangSatz } from "./vorgaenge-db";

type HsPipeline = { id: string; label: string; stages: { id: string; label: string }[] };

/** Die Stufen-ID zu unserer Stufennummer. `null`, wenn HubSpot nicht mitspielt. */
async function stufenId(nr: VorgangSatz["stufe"]): Promise<{ pipeline: string; stufe: string } | null> {
  const daten = await hubspot<HsListe<HsPipeline>>({ pfad: "/crm/v3/pipelines/deals" });
  const pipeline = daten?.results.find((p) => p.label === PIPELINE_NAME);
  if (!pipeline) return null;

  const name = stufeVon(nr).intern;
  const treffer = pipeline.stages.find((s) => s.label === name);
  return treffer ? { pipeline: pipeline.id, stufe: treffer.id } : null;
}

/**
 * Was im CRM zu sehen ist. Bewusst wenig: Nummer, Mannschaft, Art, Stufe und
 * Frist. Alles andere steht in der Datenbank, und zwei Wahrheiten über
 * dasselbe Feld sind schlimmer als eine unvollständige.
 */
function eigenschaften(satz: VorgangSatz, stufe: string, pipeline: string) {
  return {
    dealname: satz.nummer + " · " + (satz.mannschaften.join(", ") || satz.ausstattungsart),
    pipeline,
    dealstage: stufe,
    vorgangsnummer: satz.nummer,
    mannschaft: satz.mannschaften.join(";"),
    ausstattungsart: satz.ausstattungsart,
    groessen_frist: satz.groessenFrist ?? "",
    trainer_email: satz.trainerEmail ?? "",
  };
}

/**
 * Schreibt den Stand des Vorgangs an seinen Deal — und legt den Deal an, wenn
 * es noch keinen gibt.
 *
 * Zurück kommt die Deal-ID, nicht nur ein Ja. Der Grund ist gemessen: beim
 * ersten Spiegeln entsteht die ID hier, der Aufrufer hält aber noch den Satz
 * von vorher in der Hand. Wer daraus `hsDealId` liest, bekommt nichts — und
 * `spiegelePersonen` hängt die Leute dann an keinen Deal.
 */
export async function spiegele(satz: VorgangSatz): Promise<string | null> {
  // Ohne CRM-Zugang gibt es nichts zu spiegeln. Das ist kein Fehler: die
  // Datenbank ist die Quelle, HubSpot ist die Sicht.
  if (!hubspotAktiv()) return null;

  const ids = await stufenId(satz.stufe);
  if (!ids) {
    await vermerke(satz.id, {
      art: "spiegel",
      text: "Im CRM fehlt die Stufe dieses Vorgangs",
      sub: "Der Vorgang läuft weiter; nur die Sicht in HubSpot fehlt.",
      intern: true,
    });
    return null;
  }

  const properties = eigenschaften(satz, ids.stufe, ids.pipeline);

  if (satz.hsDealId) {
    const geaendert = await hubspot<HsObjekt>({
      pfad: `/crm/v3/objects/deals/${satz.hsDealId}`,
      methode: "PATCH",
      koerper: { properties },
    });
    if (geaendert) return satz.hsDealId;

    await vermerke(satz.id, {
      art: "spiegel",
      text: "Der Stand konnte nicht ins CRM geschrieben werden",
      sub: "Der Vorgang läuft weiter; im CRM steht ein älterer Stand.",
      intern: true,
    });
    return null;
  }

  const angelegt = await hubspot<HsObjekt>({ pfad: "/crm/v3/objects/deals", koerper: { properties } });
  if (!angelegt) {
    await vermerke(satz.id, {
      art: "spiegel",
      text: "Im CRM konnte kein Deal angelegt werden",
      sub: "Der Vorgang läuft weiter; im CRM ist er nicht zu sehen.",
      intern: true,
    });
    return null;
  }

  // Ohne das legt der nächste Spiegel einen zweiten Deal an.
  const gemerkt = await aendereVorgang(satz.id, { hsDealId: angelegt.id });
  if (!gemerkt) {
    await vermerke(satz.id, {
      art: "spiegel",
      text: `Der Deal ${angelegt.id} im CRM ist nicht am Vorgang vermerkt`,
      sub: "Beim nächsten Spiegeln entstünde sonst ein zweiter Deal.",
      intern: true,
    });
    return null;
  }

  return angelegt.id;
}

/**
 * Haengt die Personen des Vorgangs auch im CRM an den Deal.
 *
 * Nicht Teil des laufenden Spiegels, sondern nur dann aufgerufen, wenn sich
 * die Runde aendert — beim Anlegen und beim Nachtragen. Sonst waeren es bei
 * 26 Leuten 26 Aufrufe bei jedem Stufenwechsel, fuer nichts.
 *
 * Es geht dabei um eine Faehigkeit, die Kai heute hat und behalten soll: am
 * Deal in HubSpot sehen, wer dazugehoert. Zurueckgelesen wird auch das nie.
 */
export async function spiegelePersonen(satz: VorgangSatz, dealId?: string): Promise<boolean> {
  const deal = dealId ?? satz.hsDealId;
  if (!hubspotAktiv() || !deal) return false;

  let alle = true;
  for (const person of satz.personen) {
    const ok = await verknuepfen("deals", deal, "contacts", person.kontaktId);
    if (!ok) alle = false;
  }

  if (!alle) {
    await vermerke(satz.id, {
      art: "spiegel",
      text: "Nicht alle Personen konnten im CRM an den Deal gehängt werden",
      sub: "Der Vorgang läuft weiter; im CRM fehlt jemand an der Übersicht.",
      intern: true,
    });
  }
  return alle;
}
