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
    wappenMit: false,
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
    freigabe: { stand: "keine" },
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

/**
 * Ein Vorgang als Zeile, so wie PostgREST sie liefert — die Umkehrung dessen,
 * was `vorgaenge-db.ts` beim Lesen tut.
 *
 * Damit beschreiben Tests ihre Welt als `VorgangSatz` und bekommen trotzdem
 * echte Rohdaten durch die Umwandlung geschickt. Wer die Zeile von Hand baute,
 * prüfte am Umwandler vorbei.
 */
export function alsZeile(v: VorgangSatz): Record<string, unknown> {
  return {
    id: v.id,
    nummer: v.nummer,
    mannschaften: v.mannschaften,
    mannschaftscode: v.mannschaftscode ?? null,
    ausstattungsart: v.ausstattungsart,
    stufe: v.stufe,
    stufe_seit: v.stufeSeit,
    abbruch_bei: v.abbruchBei ?? null,
    trainer_name: v.trainerName ?? null,
    trainer_email: v.trainerEmail ?? null,
    trainer_telefon: v.trainerTelefon ?? null,
    personen_geschaetzt: v.personenGeschaetzt ?? null,
    groessenarten: v.groessenarten,
    groessen_frist: v.groessenFrist ?? null,
    stufe_frist: v.stufeFrist ?? null,
    liste_bestaetigt_am: v.listeBestaetigtAm ?? null,
    lieferadresse: v.lieferadresse ?? null,
    initialen_noetig: v.initialenNoetig,
    wappen_mit: v.wappenMit,
    sponsor_logo: v.sponsorLogo ?? null,
    sponsor: v.sponsor ?? null,
    hinweis_haendler: v.hinweisHaendler ?? null,
    hs_deal_id: v.hsDealId ?? null,
    angelegt_am: v.angelegtAm,
    aktualisiert_am: v.aktualisiertAm,
    vorgang_artikel: v.artikel.map((a, i) => ({
      id: a.id,
      reihenfolge: i,
      hersteller: a.hersteller ?? null,
      bezeichnung: a.bezeichnung,
      herstellernummer: a.herstellernummer ?? null,
      farbe: a.farbe ?? null,
      groessenart: a.groessenart,
      fuer: a.fuer,
      stueck: a.stueck,
      beflockung: a.beflockung ?? null,
    bild: a.bild ?? null,
      groesse_von: a.groesseVon ?? null,
      groesse_bis: a.groesseBis ?? null,
    })),
    vorgang_person: v.personen.map((p) => ({
      id: p.id,
      hs_kontakt_id: p.kontaktId,
      ausgeschlossen: p.ausgeschlossen,
      torwart: p.torwart,
      trikotnummer: p.trikotnummer ?? null,
    })),
    angebot_intersport_betrag: v.angebote.intersport.betrag ?? null,
    angebot_intersport_am: v.angebote.intersport.am ?? null,
    angebot_intersport_gueltig_bis: v.angebote.intersport.gueltigBis ?? null,
    angebot_intersport_lieferzeit: v.angebote.intersport.lieferzeit ?? null,
    angebot_intersport_abweichung: v.angebote.intersport.abweichung ?? null,
    angebot_11teamsports_betrag: v.angebote.elfteamsports.betrag ?? null,
    angebot_11teamsports_am: v.angebote.elfteamsports.am ?? null,
    angebot_11teamsports_gueltig_bis: v.angebote.elfteamsports.gueltigBis ?? null,
    angebot_11teamsports_lieferzeit: v.angebote.elfteamsports.lieferzeit ?? null,
    angebot_11teamsports_abweichung: v.angebote.elfteamsports.abweichung ?? null,
    lieferant_gewaehlt: v.lieferantGewaehlt ?? null,
    kaskadenstufe: v.kaskadenstufe ?? null,
    zusage_sponsor: v.finanzen.zusageSponsor ?? null,
    eingang_verein: v.finanzen.eingangVerein ?? null,
    eingang_am: v.finanzen.eingangAm ?? null,
    vorkasse_bestaetigt: v.finanzen.vorkasseBestaetigt ?? null,
    spartenbudget_freigegeben: v.finanzen.spartenbudgetFreigegeben ?? null,
    zahlweg_mannschaft: v.finanzen.zahlwegMannschaft ?? null,
    rechnungsempfaenger: v.finanzen.rechnungsempfaenger ?? null,
    bestellt_am: v.bestelltAm ?? null,
    geliefert_am: v.geliefertAm ?? null,
    rechnung_betrag: v.rechnungBetrag ?? null,
    rechnung_abweichung: v.rechnungAbweichung ?? null,
    erstattung_betrag: v.erstattung.betrag ?? null,
    erstattet_am: v.erstattung.am ?? null,
    erstattung_kontoinhaber: v.erstattung.kontoinhaber ?? null,
    erstattung_iban: v.erstattung.iban ?? null,
    freigabe_stand: v.freigabe.stand,
    freigabe_von: v.freigabe.von ?? null,
    freigabe_am: v.freigabe.am ?? null,
    freigabe_grund: v.freigabe.grund ?? null,
  };
}
