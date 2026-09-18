import { vi } from "vitest";

/**
 * Ein HubSpot aus Pappe.
 *
 * Es beantwortet genau die Pfade, die kitflow benutzt, aus einem Häufchen
 * Objekte. Damit lassen sich F2 und F3 gegen denselben Vorgang stellen — und
 * genau darum geht es: beide müssen dieselben Größen fragen bzw. anzeigen.
 *
 * Es stellt HubSpot nicht nach. Was hier nicht vorkommt, ist auch nicht
 * geprüft; die echten Eigenheiten (Suchindex, Auswahl-Optionen, Zeichengrenzen)
 * bleiben Sache eines Durchlaufs gegen die echte HubSpot.
 */

export type HsObjektRoh = { id: string; properties: Record<string, string | null> };

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

/** Die Stufen-ID zu einer Stufennummer, so wie das Pappe-HubSpot sie vergibt. */
export function stufenId(nr: number): string {
  return `s${nr}`;
}

export type Welt = {
  deal: HsObjektRoh;
  positionen?: HsObjektRoh[];
  produkte?: HsObjektRoh[];
  kontakte?: HsObjektRoh[];
};

function batch(objekte: HsObjektRoh[], koerper: string | undefined) {
  const ids: string[] = koerper ? JSON.parse(koerper).inputs.map((i: { id: string }) => i.id) : [];
  return { results: objekte.filter((o) => ids.includes(o.id)) };
}

/** Setzt `fetch` auf diese Welt. Gibt den Spion zurück, falls er gebraucht wird. */
export function stelleHubSpot(welt: Welt) {
  const positionen = welt.positionen ?? [];
  const produkte = welt.produkte ?? [];
  const kontakte = welt.kontakte ?? [];

  const fake = vi.fn(async (url: string, o?: RequestInit) => {
    const pfad = String(url);
    const koerper = o?.body ? String(o.body) : undefined;

    if (pfad.includes("/pipelines/deals")) {
      return Response.json({
        results: [
          {
            id: "p1",
            label: "Ausstattung",
            stages: STUFEN.map((label, i) => ({ id: stufenId(i), label, displayOrder: i })),
          },
        ],
      });
    }

    if (pfad.includes("/objects/deals/search")) return Response.json({ results: [welt.deal] });

    if (pfad.includes("/associations/line_items")) {
      return Response.json({ results: positionen.map((p) => ({ toObjectId: p.id })) });
    }
    if (pfad.includes("/associations/contacts")) {
      return Response.json({ results: kontakte.map((k) => ({ toObjectId: k.id })) });
    }

    if (pfad.includes("/objects/line_items/batch/read")) return Response.json(batch(positionen, koerper));
    if (pfad.includes("/objects/products/batch/read")) return Response.json(batch(produkte, koerper));
    if (pfad.includes("/objects/contacts/batch/read")) return Response.json(batch(kontakte, koerper));

    return Response.json({ results: [] });
  });

  vi.stubGlobal("fetch", fake);
  return fake;
}

/** Ein Vorgang auf Stufe 1 mit den Angaben, die die Seiten mindestens brauchen. */
export function deal(mehr: Record<string, string> = {}): HsObjektRoh {
  return {
    id: "d1",
    properties: {
      vorgangsnummer: "AUS-2026-001",
      dealstage: stufenId(1),
      mannschaft: "Ü40 Team 3",
      ausstattungsart: "Weitere Ausstattung",
      lieferadresse: "ZZ 1",
      trainer_email: "zz@example.invalid",
      ...mehr,
    },
  };
}

/** Ein Artikel: ein Produkt und die Position ohne Person, die darauf zeigt. */
export function artikel(
  id: string,
  groessenart: string,
  mehr: Record<string, string> = {},
): { position: HsObjektRoh; produkt: HsObjektRoh } {
  return {
    position: { id: `li-${id}`, properties: { hs_product_id: id, quantity: "1" } },
    produkt: {
      id,
      properties: {
        name: `ZZ ${groessenart}`,
        hs_sku: `ZZ-${id}`,
        groessenart,
        farbe: "schwarz",
        aktiv: "true",
        beflockung_standard: "Standard",
        fuer: "alle",
        ...mehr,
      },
    },
  };
}

export function kontakt(id: string, mehr: Record<string, string> = {}): HsObjektRoh {
  return {
    id,
    properties: { firstname: "ZZ", lastname: `Person ${id}`, team: "Ü40 Team 3", ...mehr },
  };
}
