import { vi } from "vitest";
import { alsZeile } from "./satz";
import type { VorgangSatz } from "@/lib/vorgaenge-db";

/**
 * Eine Welt aus Pappe: die Datenbank und HubSpot zugleich.
 *
 * Seit dem Umzug braucht fast jeder Weg beides — den Vorgang aus der Datenbank
 * und die Personen aus HubSpot. Die Welt hält sie auseinander (am Gastgeber)
 * und beantwortet genau die Pfade, die kitflow benutzt.
 *
 * Sie stellt keines der beiden Systeme nach. Was hier nicht vorkommt, ist auch
 * nicht geprüft; die echten Eigenheiten bleiben Sache eines Durchlaufs gegen
 * echtes PostgREST (`npm run test:db`) und gegen die echte HubSpot.
 */

export type HsObjektRoh = { id: string; properties: Record<string, string | null> };

export type Welt = {
  /** Der Vorgang in der Datenbank. Fehlt er, gibt es ihn nicht. */
  vorgang?: VorgangSatz;
  /** Die Kontakte in HubSpot, nach ID. */
  kontakte?: HsObjektRoh[];
  /** Ereignisse im Verlauf. */
  ereignisse?: Record<string, unknown>[];
  /** Die Datenbank antwortet nicht. */
  dbGestoert?: boolean;
  /** HubSpot antwortet nicht. */
  hubspotGestoert?: boolean;
  /** Die nächste Vorgangsnummer, die die Datenbank vergibt. */
  naechsteNummer?: string;
  /** Zeilen in `mail_versand` – was schon rausging. */
  mails?: { art: string; hs_kontakt_id: string | null; gesendet_am: string; umgeleitet?: boolean }[];
  /** Resend antwortet nicht. */
  resendGestoert?: boolean;
  /**
   * Nur `mail_versand` antwortet nicht. Eigener Schalter, weil `dbGestoert`
   * schon den Vorgang selbst scheitern lässt — ein Test damit sagt nichts über
   * das, was danach kommt.
   */
  mailsGestoert?: boolean;
  /** Geparkte Entwürfe an `/neu` (der Bestätigungsklick). */
  entwuerfe?: { id: string; email: string; daten: unknown; angelegt_am: string }[];
  /** Nur `vorgang_entwurf` antwortet nicht. */
  entwuerfeGestoert?: boolean;
  /**
   * Telegram und Todoist antworten nicht. Eigener Schalter, weil beides nur
   * benachrichtigt: ein Ausfall darf die Freigabe nicht kosten, und das laesst
   * sich nur pruefen, wenn er sich einzeln herbeifuehren laesst.
   */
  meldenGestoert?: boolean;
};

export type Aufruf = {
  host: "db" | "hubspot" | "resend" | "telegram" | "todoist";
  methode: string;
  pfad: string;
  suche: Record<string, string>;
  koerper: unknown;
};

export const STUFEN = [
  "Voranfrage",
  "Größen laufen",
  "Anfrage raus",
  "Angebote da",
  "Finanzierung",
  "Bestellbar",
  "Bestellt",
  "Geliefert",
  "Abgeschlossen",
  "Abgebrochen",
];

export function stelleUmgebung() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://beispiel.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "dienst-schluessel";
  process.env.HUBSPOT_TOKEN = "zz-test";
  process.env.LINK_SECRET = "x".repeat(32);
}

export function raeumeUmgebung() {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.HUBSPOT_TOKEN;
  delete process.env.LINK_SECRET;
}

function json(wert: unknown, status = 200) {
  return new Response(wert === undefined ? "" : JSON.stringify(wert), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Setzt `fetch` auf diese Welt. Gibt Spion und Mitschrift zurück. */
export function stelleWelt(welt: Welt) {
  const kontakte = welt.kontakte ?? [];
  const aufrufe: Aufruf[] = [];
  let vorgang = welt.vorgang;

  const netz = vi.fn(async (url: string, o?: RequestInit) => {
    const adresse = new URL(String(url));
    const beiHubspot = adresse.host === "api.hubapi.com";
    const beiResend = adresse.host === "api.resend.com";
    const beiTelegram = adresse.host === "api.telegram.org";
    const beiTodoist = adresse.host === "api.todoist.com";
    const pfad = beiHubspot ? adresse.pathname : adresse.pathname.replace(/^\/rest\/v1\//, "");
    const methode = o?.method ?? (o?.body ? "POST" : "GET");
    const koerper = o?.body ? JSON.parse(String(o.body)) : undefined;

    aufrufe.push({
      host: beiResend
        ? "resend"
        : beiHubspot
          ? "hubspot"
          : beiTelegram
            ? "telegram"
            : beiTodoist
              ? "todoist"
              : "db",
      methode,
      pfad,
      suche: Object.fromEntries(adresse.searchParams),
      koerper,
    });

    if (beiResend) {
      if (welt.resendGestoert) return json({ message: "kaputt" }, 422);
      return json({ id: "mail-1" });
    }

    if (beiTelegram) {
      if (welt.meldenGestoert) return json({ ok: false }, 403);
      return json({ ok: true });
    }

    if (beiTodoist) {
      if (welt.meldenGestoert) return json({ error: "kaputt" }, 500);
      return json({ id: "aufgabe-1" });
    }

    if (beiHubspot) {
      if (welt.hubspotGestoert) return json({ message: "kaputt" }, 500);
      return hubspotAntwort(pfad, methode, koerper, kontakte);
    }

    if (welt.dbGestoert) return json({ code: "PGRST000" }, 500);
    return dbAntwort(pfad, methode, koerper, adresse.searchParams, () => vorgang, (v) => {
      vorgang = v;
    }, welt, welt.ereignisse ?? []);
  });

  vi.stubGlobal("fetch", netz);
  return { netz, aufrufe };
}

function hubspotAntwort(
  pfad: string,
  methode: string,
  koerper: unknown,
  kontakte: HsObjektRoh[],
) {
  if (pfad.includes("/pipelines/deals")) {
    return json({
      results: [
        {
          id: "pipe1",
          label: "Ausstattung",
          stages: STUFEN.map((label, i) => ({ id: `s${i}`, label, displayOrder: i })),
        },
      ],
    });
  }

  if (pfad.endsWith("/contacts/batch/read")) {
    const ids: string[] = ((koerper as { inputs?: { id: string }[] })?.inputs ?? []).map((i) => i.id);
    return json({ results: kontakte.filter((k) => ids.includes(k.id)) });
  }

  if (pfad.endsWith("/contacts/search")) {
    const filter = (koerper as { filterGroups?: { filters: { propertyName: string; value: string }[] }[] })
      ?.filterGroups ?? [];
    const gesucht = filter.flatMap((g) => g.filters);
    const treffer = kontakte.filter((k) =>
      gesucht.some((f) => (k.properties[f.propertyName] ?? "") === f.value),
    );
    return json({ results: treffer });
  }

  if (pfad.includes("/objects/deals")) {
    return json({ id: "d1", properties: {} });
  }
  if (pfad.includes("/objects/contacts/")) {
    return json({ id: pfad.split("/").pop(), properties: {} });
  }
  if (pfad.includes("/associations/")) {
    return json({});
  }

  return json({ message: "nicht in der Welt" }, 404);
}

function dbAntwort(
  pfad: string,
  methode: string,
  koerper: unknown,
  suche: URLSearchParams,
  hole: () => VorgangSatz | undefined,
  setze: (v: VorgangSatz | undefined) => void,
  welt: Welt,
  ereignisse: Record<string, unknown>[],
) {
  const vorgang = hole();

  if (pfad === "rpc/naechste_vorgangsnummer") {
    return json(welt.naechsteNummer ?? "AUS-2026-001");
  }

  if (pfad === "vorgang") {
    if (methode === "GET") {
      if (!vorgang) return json([]);
      const nummer = suche.get("nummer");
      if (nummer && nummer !== `eq.${vorgang.nummer}`) return json([]);
      const id = suche.get("id");
      if (id && id !== `eq.${vorgang.id}`) return json([]);
      const stufe = suche.get("stufe");
      if (stufe && stufe !== `eq.${vorgang.stufe}`) return json([]);
      // `offeneFreigaben` sucht danach. Ohne diesen Filter faende die Abfrage
      // jeden Vorgang, und ein Test auf „nichts offen“ waere blind.
      const freigabe = suche.get("freigabe_stand");
      if (freigabe && freigabe !== `eq.${vorgang.freigabe.stand}`) return json([]);
      return json([alsZeile(vorgang)]);
    }
    if (methode === "POST") {
      const zeile = koerper as Record<string, unknown>;
      const neu: VorgangSatz = {
        ...(welt.vorgang ?? ({} as VorgangSatz)),
        id: "v-neu",
        nummer: String(zeile.nummer),
        mannschaften: (zeile.mannschaften as string[]) ?? [],
        ausstattungsart: String(zeile.ausstattungsart),
        stufe: Number(zeile.stufe) as VorgangSatz["stufe"],
        stufeSeit: "2026-09-18T06:00:00+00:00",
        trainerEmail: (zeile.trainer_email as string) ?? undefined,
        groessenarten: (zeile.groessenarten as VorgangSatz["groessenarten"]) ?? [],
        groessenFrist: (zeile.groessen_frist as string) ?? undefined,
        lieferadresse: (zeile.lieferadresse as string) ?? undefined,
        initialenNoetig: Boolean(zeile.initialen_noetig),
        sponsor: (zeile.sponsor as string) ?? undefined,
        hinweisHaendler: (zeile.hinweis_haendler as string) ?? undefined,
        personenGeschaetzt: (zeile.personen_geschaetzt as number) ?? undefined,
        angelegtAm: "2026-09-18T06:00:00+00:00",
        aktualisiertAm: "2026-09-18T06:00:00+00:00",
        artikel: [],
        personen: [],
        angebote: { intersport: {}, elfteamsports: {} },
        finanzen: {},
        erstattung: {},
        freigabe: { stand: "keine" },
      };
      setze(neu);
      return json([alsZeile(neu)]);
    }
    if (methode === "PATCH" && vorgang) {
      const zu = koerper as Record<string, unknown>;
      const neu = { ...vorgang };
      if ("stufe" in zu) neu.stufe = Number(zu.stufe) as VorgangSatz["stufe"];
      if ("groessen_frist" in zu) neu.groessenFrist = String(zu.groessen_frist);
      if ("lieferadresse" in zu) neu.lieferadresse = String(zu.lieferadresse);
      if ("hinweis_haendler" in zu) neu.hinweisHaendler = String(zu.hinweis_haendler);
      if ("liste_bestaetigt_am" in zu) neu.listeBestaetigtAm = String(zu.liste_bestaetigt_am);
      if ("initialen_noetig" in zu) neu.initialenNoetig = Boolean(zu.initialen_noetig);
      if ("sponsor" in zu) neu.sponsor = String(zu.sponsor);
      if ("hs_deal_id" in zu) neu.hsDealId = String(zu.hs_deal_id);
      // Die Freigabe wandert immer als Ganzes: Stand, Wer, Wann und Grund
      // gehoeren zusammen. Uebernaehme das Papp-Netz nur den Stand, liesse sich
      // nicht pruefen, dass eine neue Bestaetigung die alte Unterschrift loescht.
      if ("freigabe_stand" in zu) {
        neu.freigabe = {
          stand: String(zu.freigabe_stand) as VorgangSatz["freigabe"]["stand"],
          von: (zu.freigabe_von as string) ?? undefined,
          am: (zu.freigabe_am as string) ?? undefined,
          grund: (zu.freigabe_grund as string) ?? undefined,
        };
      }
      setze(neu);
      return json([alsZeile(neu)]);
    }
    if (methode === "DELETE") {
      setze(undefined);
      return json([]);
    }
  }

  if (pfad === "vorgang_artikel" && vorgang) {
    if (methode === "POST") {
      const zeilen = (Array.isArray(koerper) ? koerper : [koerper]) as Record<string, unknown>[];
      setze({
        ...vorgang,
        artikel: [
          ...vorgang.artikel,
          ...zeilen.map((z, i) => ({
            id: `a${vorgang.artikel.length + i + 1}`,
            hersteller: (z.hersteller as string) ?? undefined,
            bezeichnung: String(z.bezeichnung),
            herstellernummer: (z.herstellernummer as string) ?? undefined,
            farbe: (z.farbe as string) ?? undefined,
            groessenart: z.groessenart as VorgangSatz["artikel"][number]["groessenart"],
            fuer: z.fuer as VorgangSatz["artikel"][number]["fuer"],
            stueck: Number(z.stueck),
            beflockung: (z.beflockung as string) ?? undefined,
            groesseVon: (z.groesse_von as string) ?? undefined,
            groesseBis: (z.groesse_bis as string) ?? undefined,
          })),
        ],
      });
      return json([{}]);
    }
    if (methode === "PATCH") {
      const id = (suche.get("id") ?? "").replace("eq.", "");
      const zu = koerper as Record<string, unknown>;
      setze({
        ...vorgang,
        artikel: vorgang.artikel.map((a) =>
          a.id === id
            ? {
                ...a,
                herstellernummer: ("herstellernummer" in zu
                  ? (zu.herstellernummer as string | null) ?? undefined
                  : a.herstellernummer),
                farbe: "farbe" in zu ? ((zu.farbe as string | null) ?? undefined) : a.farbe,
                fuer: "fuer" in zu ? (zu.fuer as typeof a.fuer) : a.fuer,
                beflockung: "beflockung" in zu ? ((zu.beflockung as string | null) ?? undefined) : a.beflockung,
              }
            : a,
        ),
      });
      return json(vorgang.artikel.some((a) => a.id === id) ? [{}] : []);
    }
  }

  if (pfad === "vorgang_person" && vorgang) {
    if (methode === "POST") {
      const zeilen = (Array.isArray(koerper) ? koerper : [koerper]) as Record<string, unknown>[];
      const dabei = new Set(vorgang.personen.map((p) => p.kontaktId));
      setze({
        ...vorgang,
        personen: [
          ...vorgang.personen,
          ...zeilen
            .filter((z) => !dabei.has(String(z.hs_kontakt_id)))
            .map((z, i) => ({
              id: `p${vorgang.personen.length + i + 1}`,
              kontaktId: String(z.hs_kontakt_id),
              ausgeschlossen: false,
              torwart: false,
            })),
        ],
      });
      return json([{}]);
    }
    if (methode === "PATCH") {
      const kontaktId = (suche.get("hs_kontakt_id") ?? "").replace("eq.", "");
      const zu = koerper as Record<string, unknown>;
      const gefunden = vorgang.personen.some((p) => p.kontaktId === kontaktId);
      setze({
        ...vorgang,
        personen: vorgang.personen.map((p) =>
          p.kontaktId === kontaktId
            ? {
                ...p,
                ausgeschlossen: "ausgeschlossen" in zu ? Boolean(zu.ausgeschlossen) : p.ausgeschlossen,
                torwart: "torwart" in zu ? Boolean(zu.torwart) : p.torwart,
                trikotnummer:
                  "trikotnummer" in zu ? ((zu.trikotnummer as string | null) ?? undefined) : p.trikotnummer,
              }
            : p,
        ),
      });
      return json(gefunden ? [{}] : []);
    }
  }

  if (pfad === "ereignis") {
    if (methode === "GET") return json(ereignisse);
    if (methode === "POST") return json([{}]);
  }

  if (pfad === "vorgang_entwurf") {
    if (welt.entwuerfeGestoert) return json({ code: "PGRST000" }, 500);
    const liste = (welt.entwuerfe ??= []);
    if (methode === "POST") {
      const z = koerper as { email: string; daten: unknown };
      const neu = {
        id: `00000000-0000-4000-8000-${String(liste.length + 1).padStart(12, "0")}`,
        email: z.email,
        daten: z.daten,
        angelegt_am: new Date().toISOString(),
      };
      liste.push(neu);
      return json([neu]);
    }
    if (methode === "GET") {
      const id = (suche.get("id") ?? "").replace("eq.", "");
      return json(liste.filter((e) => !id || e.id === id));
    }
    if (methode === "DELETE") {
      const id = (suche.get("id") ?? "").replace("eq.", "");
      const vorher = liste.length;
      welt.entwuerfe = liste.filter((e) => (id ? e.id !== id : false));
      return json(Array(vorher - welt.entwuerfe.length).fill({}));
    }
  }

  if (pfad === "mail_versand") {
    if (welt.mailsGestoert) return json({ code: "PGRST000" }, 500);
    if (methode === "GET") {
      const art = (suche.get("art") ?? "").replace("eq.", "");
      // `umgeleitet=is.false` ist der Kern: eine umgeleitete Mail lag in Kais
      // Postfach, nicht im Postfach des Spielers, und zaehlt deshalb nicht.
      const nurEchte = suche.get("umgeleitet") === "is.false";
      // Und je Person: `mailsAn` fragt nach genau einer Kontakt-ID. Ohne diesen
      // Filter bekaeme jeder die Verlaufsliste aller — ein Test gegen so eine
      // Attrappe pruefte etwas anderes, als der Code tut.
      const wen = suche.get("hs_kontakt_id");
      const passt = (m: { hs_kontakt_id: string | null }) =>
        wen === null
          ? true
          : wen === "is.null"
            ? m.hs_kontakt_id === null
            : m.hs_kontakt_id === wen.replace("eq.", "");
      return json(
        (welt.mails ?? [])
          .filter((m) => (art ? m.art === art : true))
          .filter((m) => (nurEchte ? m.umgeleitet !== true : true))
          .filter(passt)
          .sort((a, b) => b.gesendet_am.localeCompare(a.gesendet_am)),
      );
    }
    if (methode === "POST") return json([{}]);
  }

  return json([]);
}
