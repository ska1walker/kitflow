import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { spiegele, spiegelePersonen } from "./spiegel";
import { raeumeUmgebung, stelleUmgebung, vorgangZeile } from "../../test/db-fake";
import { satz } from "../../test/satz";

/**
 * Der Spiegel steht zwischen zwei Systemen, deshalb steht hier auch ein
 * Doppel-Netz: HubSpot und die Datenbank werden am Gastgeber auseinandergehalten.
 *
 * Geprüft wird vor allem eins: **ein gescheiterter Spiegel darf nichts
 * abbrechen.** Der Vorgang steht in der Datenbank und ist gültig; im CRM fehlt
 * nur die Sicht. Still verschwinden darf das trotzdem nicht — es gehört in den
 * Verlauf, und zwar intern.
 */

type Antwort = { status?: number; koerper?: unknown };

function stelleBeide(plan: { hubspot?: Record<string, Antwort>; db?: Record<string, Antwort> }) {
  const aufrufe: { host: "hubspot" | "db"; methode: string; pfad: string; koerper: unknown }[] = [];

  const netz = vi.fn(async (url: string, o?: RequestInit) => {
    const adresse = new URL(String(url));
    const beiHubspot = adresse.host === "api.hubapi.com";
    const pfad = beiHubspot ? adresse.pathname : adresse.pathname.replace(/^\/rest\/v1\//, "");
    const methode = o?.method ?? (o?.body ? "POST" : "GET");

    aufrufe.push({
      host: beiHubspot ? "hubspot" : "db",
      methode,
      pfad,
      koerper: o?.body ? JSON.parse(String(o.body)) : undefined,
    });

    const tisch = beiHubspot ? (plan.hubspot ?? {}) : (plan.db ?? {});
    const treffer =
      tisch[`${methode} ${pfad}`] ??
      Object.entries(tisch).find(([k]) => pfad.startsWith(k.split(" ")[1]) && k.startsWith(methode))?.[1];

    if (!treffer) return new Response(JSON.stringify({ message: "nicht im Plan" }), { status: 404 });
    return new Response(treffer.koerper === undefined ? "" : JSON.stringify(treffer.koerper), {
      status: treffer.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  vi.stubGlobal("fetch", netz);
  return { netz, aufrufe };
}

const PIPELINE = {
  results: [
    {
      id: "pipe1",
      label: "Ausstattung",
      stages: [
        { id: "s0", label: "Voranfrage" },
        { id: "s1", label: "Größen laufen" },
        { id: "s2", label: "Anfrage raus" },
      ],
    },
  ],
};

beforeEach(() => {
  stelleUmgebung();
  process.env.HUBSPOT_TOKEN = "zz-test";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  raeumeUmgebung();
  delete process.env.HUBSPOT_TOKEN;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Einen Vorgang zum ersten Mal spiegeln", () => {
  test("legt einen Deal an und merkt ihn am Vorgang", async () => {
    const { aufrufe } = stelleBeide({
      hubspot: {
        "GET /crm/v3/pipelines/deals": { koerper: PIPELINE },
        "POST /crm/v3/objects/deals": { koerper: { id: "d99", properties: {} } },
      },
      db: { "PATCH vorgang": { koerper: [vorgangZeile({ hs_deal_id: "d99" })] } },
    });

    expect(await spiegele(satz())).toBe("d99");

    const angelegt = aufrufe.find((a) => a.host === "hubspot" && a.methode === "POST");
    const props = (angelegt!.koerper as { properties: Record<string, string> }).properties;
    expect(props).toMatchObject({
      vorgangsnummer: "AUS-2026-001",
      mannschaft: "Ü40 Team 3",
      dealstage: "s1",
      groessen_frist: "2026-09-30",
    });

    // Ohne diesen Vermerk legt der naechste Spiegel einen zweiten Deal an.
    const gemerkt = aufrufe.find((a) => a.host === "db" && a.methode === "PATCH");
    expect(gemerkt?.koerper).toEqual({ hs_deal_id: "d99" });
  });

  test("mehrere Mannschaften stehen als Semikolonliste am Deal", async () => {
    const { aufrufe } = stelleBeide({
      hubspot: {
        "GET /crm/v3/pipelines/deals": { koerper: PIPELINE },
        "POST /crm/v3/objects/deals": { koerper: { id: "d99", properties: {} } },
      },
      db: { "PATCH vorgang": { koerper: [vorgangZeile()] } },
    });

    await spiegele(satz({ mannschaften: ["2014", "2015"] }));

    const props = (aufrufe[1].koerper as { properties: Record<string, string> }).properties;
    // HubSpot erwartet bei einer Mehrfachauswahl Semikolons, nicht Kommas.
    expect(props.mannschaft).toBe("2014;2015");
    expect(props.dealname).toBe("AUS-2026-001 · 2014, 2015");
  });
});

describe("Einen gespiegelten Vorgang nachziehen", () => {
  test("ändert den vorhandenen Deal, statt einen neuen anzulegen", async () => {
    const { aufrufe } = stelleBeide({
      hubspot: {
        "GET /crm/v3/pipelines/deals": { koerper: PIPELINE },
        "PATCH /crm/v3/objects/deals/d99": { koerper: { id: "d99", properties: {} } },
      },
    });

    expect(await spiegele(satz({ hsDealId: "d99", stufe: 2 }))).toBe("d99");

    expect(aufrufe.some((a) => a.host === "hubspot" && a.methode === "POST")).toBe(false);
    const patch = aufrufe.find((a) => a.methode === "PATCH")!;
    expect((patch.koerper as { properties: Record<string, string> }).properties.dealstage).toBe("s2");
  });
});

describe("Wenn das CRM nicht mitspielt", () => {
  test("bleibt der Vorgang gültig und es wird intern vermerkt", async () => {
    const { aufrufe } = stelleBeide({
      hubspot: {
        "GET /crm/v3/pipelines/deals": { koerper: PIPELINE },
        "PATCH /crm/v3/objects/deals/d99": { status: 500 },
      },
      db: { "POST ereignis": { koerper: [{}] } },
    });

    expect(await spiegele(satz({ hsDealId: "d99" }))).toBeNull();

    const vermerk = aufrufe.find((a) => a.host === "db" && a.pfad === "ereignis");
    expect(vermerk).toBeDefined();
    const e = vermerk!.koerper as Record<string, unknown>;
    expect(e.art).toBe("spiegel");
    // Der Trainer kann damit nichts anfangen, die Spartenleitung schon.
    expect(e.intern).toBe(true);
  });

  test("fehlt die Stufe in der Pipeline, wird nichts geschrieben", async () => {
    const { aufrufe } = stelleBeide({
      hubspot: {
        "GET /crm/v3/pipelines/deals": {
          koerper: { results: [{ id: "pipe1", label: "Ausstattung", stages: [{ id: "s0", label: "Voranfrage" }] }] },
        },
      },
      db: { "POST ereignis": { koerper: [{}] } },
    });

    expect(await spiegele(satz({ stufe: 1 }))).toBeNull();
    expect(aufrufe.some((a) => a.host === "hubspot" && a.pfad.includes("/objects/deals"))).toBe(false);
  });

  test("ein angelegter Deal, der nicht vermerkt werden kann, wird gemeldet", async () => {
    // Sonst entsteht beim naechsten Spiegeln ein zweiter Deal zur selben Nummer.
    const { aufrufe } = stelleBeide({
      hubspot: {
        "GET /crm/v3/pipelines/deals": { koerper: PIPELINE },
        "POST /crm/v3/objects/deals": { koerper: { id: "d99", properties: {} } },
      },
      db: { "PATCH vorgang": { status: 500 }, "POST ereignis": { koerper: [{}] } },
    });

    expect(await spiegele(satz())).toBeNull();
    const vermerk = aufrufe.find((a) => a.pfad === "ereignis");
    expect(String((vermerk!.koerper as Record<string, unknown>).text)).toContain("d99");
  });

  test("lässt sich gar kein Deal anlegen, wird auch das vermerkt", async () => {
    const { aufrufe } = stelleBeide({
      hubspot: {
        "GET /crm/v3/pipelines/deals": { koerper: PIPELINE },
        "POST /crm/v3/objects/deals": { status: 500 },
      },
      db: { "POST ereignis": { koerper: [{}] } },
    });

    expect(await spiegele(satz())).toBeNull();

    const vermerk = aufrufe.find((a) => a.host === "db" && a.pfad === "ereignis");
    expect(vermerk).toBeDefined();
    const e = vermerk!.koerper as Record<string, unknown>;
    expect(e.art).toBe("spiegel");
    expect(e.intern).toBe(true);
    // Der Vorgang selbst darf dabei nicht angefasst werden.
    expect(aufrufe.some((a) => a.host === "db" && a.pfad === "vorgang")).toBe(false);
  });

  test("die frische Deal-ID kommt zurück, nicht nur ein Ja", async () => {
    // Beim ersten Spiegeln entsteht die ID hier. Der Aufrufer haelt noch den
    // Satz von vorher in der Hand: wer daraus `hsDealId` liest, bekommt nichts.
    // Genau daran hingen die Personen eines frischen Vorgangs an keinem Deal.
    const { aufrufe } = stelleBeide({
      hubspot: {
        "GET /crm/v3/pipelines/deals": { koerper: PIPELINE },
        "POST /crm/v3/objects/deals": { koerper: { id: "d77", properties: {} } },
        "PUT /crm/v4/objects/deals/d77/associations/default/contacts/111": { koerper: {} },
      },
      db: { "PATCH vorgang": { koerper: [vorgangZeile({ hs_deal_id: "d77" })] } },
    });

    const v = satz({ personen: [{ id: "p1", kontaktId: "111", ausgeschlossen: false, torwart: false }] });
    const dealId = await spiegele(v);
    expect(dealId).toBe("d77");

    // Und mit dieser ID haengen die Personen wirklich am richtigen Deal.
    expect(await spiegelePersonen(v, dealId!)).toBe(true);
    expect(aufrufe.some((a) => a.pfad.includes("/associations/default/contacts/111"))).toBe(true);
  });

  test("ohne CRM-Zugang passiert gar nichts – und das ist kein Fehler", async () => {
    delete process.env.HUBSPOT_TOKEN;
    const { netz } = stelleBeide({});

    expect(await spiegele(satz())).toBeNull();
    // Kein Ereignis: die Datenbank ist die Quelle, HubSpot nur die Sicht.
    expect(netz).not.toHaveBeenCalled();
  });
});
