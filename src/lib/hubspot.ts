import "server-only";

/**
 * HubSpot-Zugriff über einen Service-Schlüssel. HubSpot ist die einzige
 * Datenbasis (CLAUDE.md); kitflow hat keine eigene Datenbank.
 *
 * Zwei Wege zur Anmeldung, beide rein serverseitig:
 *
 *  - `HUBSPOT_TOKEN` gesetzt: wir schicken den Authorization-Header selbst.
 *    So laeuft es in Produktion.
 *  - `HUBSPOT_AUTH_VIA_PROXY=1`: der Schluessel haengt in der Cloud-Umgebung
 *    an den Zugangsdaten fuer api.hubapi.com und der Proxy setzt den Header.
 *    Dann duerfen wir keinen eigenen setzen, sonst stehen zwei drin.
 *
 * Ohne beides laeuft die Oberflaeche mit Beispieldaten weiter, siehe
 * src/lib/vorgaenge.ts. Der Schluessel darf weder ins Bundle noch in ein Log.
 */

const BASIS = "https://api.hubapi.com";

/** Anmeldung ueber den Proxy statt ueber einen eigenen Header. */
function ueberProxy(): boolean {
  return process.env.HUBSPOT_AUTH_VIA_PROXY === "1";
}

export function hubspotAktiv(): boolean {
  return Boolean(process.env.HUBSPOT_TOKEN) || ueberProxy();
}

/** Name der Pipeline aus docs/datenmodell.md. */
export const PIPELINE_NAME = "Ausstattung";

type Abfrage = {
  pfad: string;
  /** Der Rumpf der Anfrage. Gesetzt heisst POST, sofern `methode` fehlt. */
  koerper?: Record<string, unknown>;
  /**
   * Fuer Schreibzugriffe, die kein POST sind: PATCH aendert Eigenschaften,
   * PUT legt eine Verknuepfung an (die hat keinen Rumpf).
   */
  methode?: "GET" | "POST" | "PATCH" | "PUT";
};

/** Nexts Signal „diese Route muss dynamisch sein“, erkennbar am digest. */
function istDynamikSignal(fehler: unknown): boolean {
  return (
    typeof fehler === "object" &&
    fehler !== null &&
    (fehler as { digest?: unknown }).digest === "DYNAMIC_SERVER_USAGE"
  );
}

/**
 * Ein Aufruf gegen die HubSpot-API. Wirft nie: Fehler werden gemeldet und mit
 * `null` beantwortet, damit ein Ausfall die Seite nicht zerlegt.
 *
 * Fehlermeldungen enthalten bewusst weder Token noch Personendaten.
 */
export async function hubspot<T>({ pfad, koerper, methode }: Abfrage): Promise<T | null> {
  if (!hubspotAktiv()) return null;

  const token = process.env.HUBSPOT_TOKEN;
  const kopf: Record<string, string> = { "Content-Type": "application/json" };
  if (token) kopf.Authorization = `Bearer ${token}`;

  try {
    const antwort = await fetch(`${BASIS}${pfad}`, {
      method: methode ?? (koerper ? "POST" : "GET"),
      headers: kopf,
      body: koerper ? JSON.stringify(koerper) : undefined,
      // Der Stand eines Vorgangs aendert sich laufend, deshalb nicht cachen.
      cache: "no-store",
    });

    if (!antwort.ok) {
      console.error(`HubSpot ${antwort.status} bei ${pfad}`);
      return null;
    }

    return (await antwort.json()) as T;
  } catch (fehler) {
    // Next meldet ueber einen geworfenen Fehler, dass die Route wegen
    // `no-store` dynamisch werden muss. Der gehoert nicht uns: schlucken wir
    // ihn, waere die Route faelschlich statisch.
    if (istDynamikSignal(fehler)) throw fehler;

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

/**
 * Die IDs der Objekte, die an einem Objekt haengen – etwa die Positionen und
 * die Kontakte eines Deals. Leer statt `null`, damit die Aufrufer den Vorgang
 * auch dann bauen koennen, wenn eine Verknuepfung fehlt.
 */
export async function assoziierteIds(
  vonTyp: string,
  vonId: string,
  zuTyp: string,
): Promise<string[]> {
  const daten = await hubspot<HsListe<{ toObjectId: number | string }>>({
    pfad: `/crm/v4/objects/${vonTyp}/${vonId}/associations/${zuTyp}?limit=500`,
  });
  if (!daten) return [];
  return daten.results.map((r) => String(r.toObjectId));
}

/**
 * Mehrere Objekte in einem Aufruf lesen. HubSpot nimmt 100 pro Bündel, also
 * bündeln wir selbst. Eigenschaften, die es im Portal nicht gibt, laesst
 * HubSpot in der Antwort einfach weg – ein fehlendes Feld ist kein Fehler.
 */
export async function batchLesen(
  typ: string,
  ids: string[],
  felder: string[],
): Promise<HsObjekt[]> {
  const alle: HsObjekt[] = [];

  for (let i = 0; i < ids.length; i += 100) {
    const daten = await hubspot<HsListe<HsObjekt>>({
      pfad: `/crm/v3/objects/${typ}/batch/read`,
      koerper: {
        properties: felder,
        propertiesWithHistory: [],
        inputs: ids.slice(i, i + 100).map((id) => ({ id })),
      },
    });
    if (daten) alle.push(...daten.results);
  }

  return alle;
}

/* ------------------------------------------------------------------ *
 * Eigenschaften eines Objekts lesen
 * ------------------------------------------------------------------ */

/** Eine Eigenschaft als Text. Leer, null und fehlend sind dasselbe: undefined. */
export function text(o: HsObjekt, feld: string): string | undefined {
  const wert = o.properties[feld];
  return wert === null || wert === undefined || wert === "" ? undefined : wert;
}

/** Eine Eigenschaft als Zahl. Was sich nicht rechnen laesst, ist 0. */
export function zahl(o: HsObjekt, feld: string): number {
  const wert = Number(o.properties[feld]);
  return Number.isFinite(wert) ? wert : 0;
}

/**
 * „2026-09-10“ wird zu „10.09.“. Datums-Eigenschaften stehen bei HubSpot auf
 * Mitternacht UTC; wir zerlegen die Zeichenkette, statt sie in eine lokale Zeit
 * zu rechnen, sonst rutscht der Tag je nach Serverzeitzone.
 */
export function kurzDatum(wert: string | undefined): string | undefined {
  if (!wert) return undefined;
  const treffer = /^(\d{4})-(\d{2})-(\d{2})/.exec(wert);
  return treffer ? `${treffer[3]}.${treffer[2]}.` : undefined;
}
