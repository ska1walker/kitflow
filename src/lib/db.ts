import "server-only";

/**
 * Die eigene Datenbank: Supabase über PostgREST.
 *
 * Die Schicht ist absichtlich gebaut wie `hubspot.ts` — gleiche Form, gleiche
 * Regeln, gleiche Tests. Drei Gründe gegen `@supabase/supabase-js` an dieser
 * Stelle: kitflow hat bisher außer Next und React keine Abhängigkeit; ein
 * eigener Aufruf lässt sich mit demselben Papp-Netz prüfen wie HubSpot; und das
 * SDK bringt einen Browser-Client mit, den hier nie jemand benutzen darf. Für
 * die Anmeldung der Spartenleitung (Magic Link) wird `@supabase/ssr` später
 * trotzdem dazukommen — das ist Auth und nicht Datenzugriff.
 *
 * **Alles läuft über den Service-Schlüssel und damit an RLS vorbei.** Genau
 * deshalb tragen die Tabellen RLS ohne eine einzige Policy (Migration 001): von
 * außen kommt niemand heran, und jede Prüfung, wer etwas sehen darf, passiert
 * im Code — beim signierten Link und, ab Schritt 3, in jeder Server Action.
 * Der Schlüssel darf weder ins Bundle noch in ein Log.
 *
 * `null` heißt immer „konnte nicht fragen“, eine leere Liste heißt „da ist
 * wirklich nichts". Der Unterschied hat kitflow schon dreimal wehgetan: ein
 * Ausfall, der als Tatsache gelesen wird, bricht Vorgänge ab und behauptet
 * gegenüber dem Trainer Dinge, die nicht stimmen.
 */

/** Die Adresse des Projekts. `NEXT_PUBLIC_…` ist kein Geheimnis und darf sein. */
function basis(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
}

function schluessel(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function dbAktiv(): boolean {
  return Boolean(basis() && schluessel());
}

const VERSUCHE = 3;
const PAUSE_MS = 300;
const PAUSE_MAX_MS = 10_000;

type Methode = "GET" | "POST" | "PATCH" | "DELETE";

/**
 * Wiederholt wird nur, was nichts verändert.
 *
 * Für PostgREST heißt das: GET, sonst nichts. `POST /rpc/naechste_vorgangsnummer`
 * sieht wie ein Lesen aus, erhöht aber den Zähler — ein zweiter Versuch
 * verbrauchte eine Vorgangsnummer, die nie einem Vorgang gehört.
 */
function darfWiederholen(methode: Methode): boolean {
  return methode === "GET";
}

function istVoruebergehend(status: number): boolean {
  // 503 kommt bei Supabase auch, wenn ein pausiertes Projekt erst aufwacht.
  return status === 429 || status >= 500;
}

function pause(versuch: number, kopf: Headers | undefined): number {
  const genannt = Number(kopf?.get("retry-after"));
  if (Number.isFinite(genannt) && genannt > 0) return Math.min(genannt * 1000, PAUSE_MAX_MS);
  return Math.min(PAUSE_MS * 3 ** (versuch - 1), PAUSE_MAX_MS);
}

function schlafe(ms: number): Promise<void> {
  return new Promise((f) => setTimeout(f, ms));
}

/** Nexts Signal „diese Route muss dynamisch sein“, erkennbar am digest. */
function istDynamikSignal(fehler: unknown): boolean {
  return (
    typeof fehler === "object" &&
    fehler !== null &&
    (fehler as { digest?: unknown }).digest === "DYNAMIC_SERVER_USAGE"
  );
}

/**
 * Was PostgREST bei einem Fehler zurückgibt. `details` und `hint` nennen die
 * verletzte Zeile mitsamt Werten – darin steckt eine HubSpot-Kontakt-ID, also
 * ein Personenbezug. Geloggt wird deshalb nur `code`.
 */
type Fehlerkoerper = { code?: string; message?: string };

type Abfrage = {
  /** Tabelle oder `rpc/<funktion>`. */
  pfad: string;
  methode?: Methode;
  /** Wird an die Adresse gehängt: `{ nummer: "eq.AUS-2026-001" }`. */
  suche?: Record<string, string>;
  koerper?: unknown;
  /** Zusätzliche `Prefer`-Angaben, etwa `resolution=ignore-duplicates`. */
  prefer?: string[];
};

/**
 * Ein Aufruf gegen PostgREST. Wirft nie – außer Nexts Dynamik-Signal, das uns
 * nicht gehört. Ein Fehler wird gemeldet und mit `null` beantwortet.
 */
export async function db<T>({ pfad, methode, suche, koerper, prefer }: Abfrage): Promise<T | null> {
  const adresse = basis();
  const key = schluessel();
  if (!adresse || !key) return null;

  const art: Methode = methode ?? (koerper === undefined ? "GET" : "POST");

  const kopf: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    // Ohne das kommt bei POST und PATCH nur ein leerer Rumpf zurück, und der
    // Aufrufer wüsste nicht, was wirklich entstanden ist.
    Prefer: ["return=representation", ...(prefer ?? [])].join(","),
  };

  const parameter = new URLSearchParams(suche ?? {}).toString();
  const ziel = `${adresse.replace(/\/+$/, "")}/rest/v1/${pfad}${parameter ? `?${parameter}` : ""}`;

  const hoechstens = darfWiederholen(art) ? VERSUCHE : 1;

  for (let versuch = 1; versuch <= hoechstens; versuch++) {
    const letzter = versuch === hoechstens;

    try {
      const antwort = await fetch(ziel, {
        method: art,
        headers: kopf,
        body: koerper === undefined ? undefined : JSON.stringify(koerper),
        // Der Stand eines Vorgangs ändert sich laufend, deshalb nicht cachen.
        cache: "no-store",
      });

      if (antwort.ok) {
        const roh = await antwort.text();
        return (roh ? JSON.parse(roh) : null) as T;
      }

      if (istVoruebergehend(antwort.status) && !letzter) {
        await schlafe(pause(versuch, antwort.headers));
        continue;
      }

      let code = "";
      try {
        code = ((await antwort.json()) as Fehlerkoerper).code ?? "";
      } catch {
        // Kein JSON – dann sagt der Status genug.
      }
      console.error(`Datenbank ${antwort.status}${code ? ` (${code})` : ""} bei ${art} ${pfad}`);
      return null;
    } catch (fehler) {
      if (istDynamikSignal(fehler)) throw fehler;

      if (!letzter) {
        await schlafe(pause(versuch, undefined));
        continue;
      }

      console.error(
        `Datenbank nicht erreichbar bei ${art} ${pfad}:`,
        fehler instanceof Error ? fehler.message : "unbekannter Fehler",
      );
      return null;
    }
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * Die vier Zugriffe
 * ------------------------------------------------------------------ */

/**
 * Zeilen lesen. `[]` heißt „es gibt keine“, `null` heißt „die Datenbank hat
 * nicht geantwortet".
 */
export async function lese<T>(
  tabelle: string,
  suche: Record<string, string>,
): Promise<T[] | null> {
  return db<T[]>({ pfad: tabelle, suche: { select: "*", ...suche } });
}

/** Die erste Zeile oder `undefined`; `null` bleibt die Störung. */
export async function leseEine<T>(
  tabelle: string,
  suche: Record<string, string>,
): Promise<T | undefined | null> {
  const zeilen = await lese<T>(tabelle, { ...suche, limit: "1" });
  if (zeilen === null) return null;
  return zeilen[0];
}

/**
 * Zeilen anlegen.
 *
 * `ignoriereDoppelte` nennt die Spalten, auf denen die Eindeutigkeit liegt –
 * und zwar als Text, nicht als Ja/Nein. Der Grund ist gemessen: PostgREST
 * wendet `resolution=ignore-duplicates` **nur auf den Primärschlüssel** an,
 * solange nicht `on_conflict` dabeisteht. Ohne die Spalten antwortet es 409,
 * und das Prefer allein sieht aus, als täte es etwas. Wer die Spalten nicht
 * nennen kann, will kein Ignorieren.
 */
export async function schreibe<T>(
  tabelle: string,
  zeilen: Record<string, unknown> | Record<string, unknown>[],
  optionen: { ignoriereDoppelte?: string } = {},
): Promise<T[] | null> {
  return db<T[]>({
    pfad: tabelle,
    methode: "POST",
    koerper: zeilen,
    suche: optionen.ignoriereDoppelte ? { on_conflict: optionen.ignoriereDoppelte } : undefined,
    prefer: optionen.ignoriereDoppelte ? ["resolution=ignore-duplicates"] : undefined,
  });
}

/** Zeilen ändern. Ohne `suche` weigert sich PostgREST – und das ist gut so. */
export async function aendere<T>(
  tabelle: string,
  suche: Record<string, string>,
  werte: Record<string, unknown>,
): Promise<T[] | null> {
  return db<T[]>({ pfad: tabelle, methode: "PATCH", suche, koerper: werte });
}

/** Eine Datenbankfunktion aufrufen. Verändert womöglich etwas: nie wiederholen. */
export async function rufe<T>(
  funktion: string,
  argumente: Record<string, unknown> = {},
): Promise<T | null> {
  return db<T>({ pfad: `rpc/${funktion}`, methode: "POST", koerper: argumente });
}
