import "server-only";

/**
 * HubSpot-Zugriff über eine Private App. HubSpot ist die einzige Datenbasis
 * (CLAUDE.md); kitflow hat keine eigene Datenbank.
 *
 * Der Token steht ausschliesslich serverseitig in `HUBSPOT_TOKEN` und darf
 * weder ins Bundle noch in ein Log geraten. Fehlt er, laeuft die Oberflaeche
 * mit Beispieldaten weiter – siehe src/lib/vorgaenge.ts.
 */

const BASIS = "https://api.hubapi.com";

export function hubspotAktiv(): boolean {
  return Boolean(process.env.HUBSPOT_TOKEN);
}

/** Name der Pipeline aus docs/datenmodell.md. */
export const PIPELINE_NAME = "Ausstattung";

type Abfrage = {
  pfad: string;
  suche?: Record<string, unknown>;
};

/**
 * Ein Aufruf gegen die HubSpot-API. Wirft nie: Fehler werden gemeldet und mit
 * `null` beantwortet, damit ein Ausfall die Seite nicht zerlegt.
 *
 * Fehlermeldungen enthalten bewusst weder Token noch Personendaten.
 */
export async function hubspot<T>({ pfad, suche }: Abfrage): Promise<T | null> {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) return null;

  try {
    const antwort = await fetch(`${BASIS}${pfad}`, {
      method: suche ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: suche ? JSON.stringify(suche) : undefined,
      // Der Stand eines Vorgangs aendert sich laufend, deshalb nicht cachen.
      cache: "no-store",
    });

    if (!antwort.ok) {
      console.error(`HubSpot ${antwort.status} bei ${pfad}`);
      return null;
    }

    return (await antwort.json()) as T;
  } catch (fehler) {
    console.error(
      `HubSpot nicht erreichbar bei ${pfad}:`,
      fehler instanceof Error ? fehler.message : "unbekannter Fehler",
    );
    return null;
  }
}

export type HsObjekt = {
  id: string;
  properties: Record<string, string | null>;
};

export type HsListe<T> = { results: T[] };

type HsStufe = { id: string; label: string; displayOrder: number };
type HsPipeline = { id: string; label: string; stages: HsStufe[] };

/**
 * Die Stufen der Ausstattungs-Pipeline, gelesen statt fest verdrahtet.
 * Zurueck kommt eine Zuordnung Stufen-ID zu Bezeichnung; die Uebersetzung in
 * unsere Stufennummer passiert in vorgaenge.ts ueber den Namen.
 */
export async function pipelineStufen(): Promise<Map<string, string> | null> {
  const daten = await hubspot<HsListe<HsPipeline>>({ pfad: "/crm/v3/pipelines/deals" });
  if (!daten) return null;

  const pipeline = daten.results.find((p) => p.label === PIPELINE_NAME);
  if (!pipeline) {
    console.error(
      `HubSpot: Pipeline „${PIPELINE_NAME}“ nicht gefunden. Bitte in HubSpot anlegen (docs/datenmodell.md).`,
    );
    return null;
  }

  return new Map(pipeline.stages.map((s) => [s.id, s.label]));
}
