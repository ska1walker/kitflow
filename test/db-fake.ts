import { vi } from "vitest";

/**
 * Ein PostgREST aus Pappe.
 *
 * Es ist ausdrücklich **keine** Datenbank: es filtert nicht, es prüft keine
 * Bedingung, es kennt keine Fremdschlüssel. Es beantwortet Aufrufe nach Plan
 * und schreibt mit, was gefragt wurde. Damit lässt sich prüfen, was kitflow
 * schickt und wie es Antworten liest — nicht, ob das Schema stimmt. Dafür gibt
 * es die Migration und einen Lauf gegen ein echtes Postgres.
 *
 * Der Plan wird über „METHODE pfad“ angesprochen, z. B. `"POST vorgang"`. Steht
 * dort eine Liste, wird sie der Reihe nach abgearbeitet; die letzte Antwort
 * bleibt danach stehen.
 */

export type Antwort = {
  status?: number;
  koerper?: unknown;
  /** Für den Wiederholungs-Test: „Retry-After“ in Sekunden. */
  wartet?: number;
};

export type Plan = Record<string, Antwort | Antwort[]>;

export const BASIS = "https://beispiel.supabase.co";

/** Setzt die Umgebung so, dass `dbAktiv()` wahr ist. */
export function stelleUmgebung() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = BASIS;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "dienst-schluessel";
}

export function raeumeUmgebung() {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL;
}

/** Was von einem Aufruf mitgeschrieben wird. */
export type Aufruf = {
  methode: string;
  /** Tabelle bzw. `rpc/…`, ohne Parameter. */
  pfad: string;
  /** Die Parameter hinter dem Fragezeichen. */
  suche: Record<string, string>;
  koerper: unknown;
  prefer: string;
};

export function stelleDb(plan: Plan) {
  const offen = new Map<string, Antwort[]>();
  for (const [schluessel, wert] of Object.entries(plan)) {
    offen.set(schluessel, Array.isArray(wert) ? [...wert] : [wert]);
  }

  const aufrufe: Aufruf[] = [];

  const netz = vi.fn(async (url: string, o?: RequestInit) => {
    const adresse = new URL(String(url));
    const pfad = adresse.pathname.replace(/^\/rest\/v1\//, "");
    const methode = o?.method ?? "GET";
    const kopf = new Headers(o?.headers as HeadersInit);

    aufrufe.push({
      methode,
      pfad,
      suche: Object.fromEntries(adresse.searchParams),
      koerper: o?.body ? JSON.parse(String(o.body)) : undefined,
      prefer: kopf.get("Prefer") ?? "",
    });

    const schlange = offen.get(`${methode} ${pfad}`);
    const antwort = schlange && (schlange.length > 1 ? schlange.shift()! : schlange[0]);

    if (!antwort) {
      return new Response(JSON.stringify({ code: "PGRST000", message: "nicht im Plan" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const status = antwort.status ?? 200;
    const kopfzeilen: Record<string, string> = { "Content-Type": "application/json" };
    if (antwort.wartet !== undefined) kopfzeilen["Retry-After"] = String(antwort.wartet);

    return new Response(antwort.koerper === undefined ? "" : JSON.stringify(antwort.koerper), {
      status,
      headers: kopfzeilen,
    });
  });

  vi.stubGlobal("fetch", netz);
  return { netz, aufrufe };
}

/* ------------------------------------------------------------------ *
 * Zeilen, wie die Datenbank sie liefert
 * ------------------------------------------------------------------ */

/** Eine `vorgang`-Zeile mit allen Spalten aus Migration 001. */
export function vorgangZeile(mehr: Record<string, unknown> = {}) {
  return {
    id: "v1",
    nummer: "AUS-2026-001",
    mannschaften: ["Ü40 Team 3"],
    mannschaftscode: null,
    ausstattungsart: "Weitere Ausstattung",
    stufe: 1,
    stufe_seit: "2026-09-17T10:00:00+00:00",
    abbruch_bei: null,
    trainer_name: "Kai Böhm",
    trainer_email: "kai@example.org",
    trainer_telefon: null,
    personen_geschaetzt: null,
    groessenarten: [],
    groessen_frist: "2026-09-30",
    stufe_frist: null,
    liste_bestaetigt_am: null,
    lieferadresse: "Am Sportplatz 14",
    initialen_noetig: false,
    sponsor: null,
    hinweis_haendler: null,
    hs_deal_id: null,
    angelegt_am: "2026-09-17T10:00:00+00:00",
    aktualisiert_am: "2026-09-17T10:00:00+00:00",
    vorgang_artikel: [],
    vorgang_person: [],

    // Migration 002. Leer ist der Normalfall: geschrieben wird hier heute
    // nichts, weil es die Formulare F4 bis F8 noch nicht gibt.
    angebot_intersport_betrag: null,
    angebot_intersport_am: null,
    angebot_intersport_gueltig_bis: null,
    angebot_intersport_lieferzeit: null,
    angebot_intersport_abweichung: null,
    angebot_11teamsports_betrag: null,
    angebot_11teamsports_am: null,
    angebot_11teamsports_gueltig_bis: null,
    angebot_11teamsports_lieferzeit: null,
    angebot_11teamsports_abweichung: null,
    lieferant_gewaehlt: null,
    kaskadenstufe: null,
    zusage_sponsor: null,
    eingang_verein: null,
    eingang_am: null,
    vorkasse_bestaetigt: null,
    spartenbudget_freigegeben: null,
    zahlweg_mannschaft: null,
    rechnungsempfaenger: null,
    bestellt_am: null,
    geliefert_am: null,
    rechnung_betrag: null,
    rechnung_abweichung: null,
    erstattung_betrag: null,
    erstattet_am: null,
    erstattung_kontoinhaber: null,
    erstattung_iban: null,
    ...mehr,
  };
}

export function artikelZeile(mehr: Record<string, unknown> = {}) {
  return {
    id: "a1",
    reihenfolge: 0,
    hersteller: "adidas",
    bezeichnung: "Trainingsjacke",
    herstellernummer: "10371232",
    farbe: null,
    groessenart: "oberteil",
    fuer: "alle",
    stueck: 1,
    beflockung: "Standard",
    groesse_von: null,
    groesse_bis: null,
    ...mehr,
  };
}

export function personZeile(mehr: Record<string, unknown> = {}) {
  return {
    id: "p1",
    hs_kontakt_id: "36737235175",
    ausgeschlossen: false,
    torwart: false,
    trikotnummer: null,
    ...mehr,
  };
}
