import type { VorgangSatz } from "@/lib/vorgaenge-db";

/**
 * Ein Vorgang, wie die Datenbank ihn liefert — als Ausgangspunkt für Tests.
 *
 * Steht hier und nicht in jeder Testdatei, damit eine neue Spalte an genau
 * einer Stelle nachgezogen wird. Läuft das auseinander, prüfen zwei Tests
 * zwei verschiedene Vorgänge und niemand merkt es.
 */
export function satz(mehr: Partial<VorgangSatz> = {}): VorgangSatz {
  return {
    id: "v1",
    nummer: "AUS-2026-001",
    mannschaften: ["Ü40 Team 3"],
    ausstattungsart: "Weitere Ausstattung",
    stufe: 1,
    stufeSeit: "2026-09-18T06:00:00+00:00",
    trainerEmail: "kai@example.org",
    groessenarten: [],
    groessenFrist: "2026-09-30",
    lieferadresse: "Am Sportplatz 14",
    initialenNoetig: false,
    angelegtAm: "2026-09-18T06:00:00+00:00",
    aktualisiertAm: "2026-09-18T06:00:00+00:00",
    artikel: [],
    personen: [],
    angebote: { intersport: {}, elfteamsports: {} },
    finanzen: {},
    erstattung: {},
    ...mehr,
  };
}

/** Ein Artikel des Vorgangs. Vollständig, damit die Prüfungen ihn durchlassen. */
export function artikel(mehr: Partial<VorgangSatz["artikel"][number]> = {}) {
  return {
    id: "a1",
    hersteller: "adidas",
    bezeichnung: "Trainingsjacke",
    herstellernummer: "10371232",
    farbe: "schwarz",
    groessenart: "oberteil" as const,
    fuer: "alle" as const,
    stueck: 1,
    beflockung: "Standard",
    ...mehr,
  };
}

/** Eine Person am Vorgang. Nur die HubSpot-ID, so wie in der Datenbank. */
export function person(mehr: Partial<VorgangSatz["personen"][number]> = {}) {
  return {
    id: "p1",
    kontaktId: "111",
    ausgeschlossen: false,
    torwart: false,
    ...mehr,
  };
}

/** Ein Kontakt, wie HubSpot ihn liefert: Name, Größen, Initialen. */
export function kontakt(id: string, props: Record<string, string> = {}) {
  return {
    id,
    properties: { firstname: "Kai", lastname: "Böhm", team: "Ü40 Team 3", ...props },
  };
}
