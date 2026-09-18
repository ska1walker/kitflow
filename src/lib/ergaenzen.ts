import "server-only";

/**
 * F1b · Angaben vervollständigen (docs/formulare.md).
 *
 * Der Gegenpart zum einfachen Modus von F1. Dort meldet der Trainer grob, um
 * einen Richtpreis für einen Sponsor zu bekommen; hier kommt nach, was ein
 * Händler für ein verbindliches Angebot braucht: Artikelnummer, Farbe, Für wen,
 * Beflockung, Frist, Lieferadresse und die Zahlungsregel.
 *
 * Danach hebt der Vorgang von Stufe 0 auf Stufe 1, die Kontakte der Mannschaft
 * kommen dazu und die Größenabfrage läuft wie bei jedem anderen Vorgang.
 *
 * Seit dem Umzug ist das erheblich weniger Arbeit: die Artikel sind Zeilen am
 * Vorgang und werden geändert. Der ganze Apparat aus Platzhalter-Nummern,
 * Produkten und Positionen — und die Sortierung, die nötig war, weil HubSpot
 * Positionen in beliebiger Reihenfolge herausgab — fällt ersatzlos weg.
 */

import { kontakteDerMannschaft } from "./bedarf";
import { GROESSEN_LABEL } from "./groessen";
import { groessenLink, statusLink, bestaetigenLink } from "./links";
import { spiegele, spiegelePersonen } from "./spiegel";
import {
  aendereArtikel,
  aendereVorgang,
  haengePersonenAn,
  setzeStufe,
  vermerke,
  vorgangPerNummer,
} from "./vorgaenge-db";
import type { BedarfErgebnis } from "./bedarf";
import type { ArtikelFuer, Groessenart } from "./typen";

/** Ein Artikel der Voranfrage, so wie ihn das Formular anzeigt. */
export type VoranfrageArtikel = {
  artikelId: string;
  hersteller: string;
  bezeichnung: string;
  groessenart: Groessenart;
  groessenartLabel: string;
  /** Die Artikelnummer fehlt noch – im einfachen Modus kennt sie der Trainer oft nicht. */
  platzhalter: boolean;
  herstellernummer: string;
  farbe: string;
  stueck: number;
  groesseVon: string;
  groesseBis: string;
};

export type Voranfrage = {
  vorgang: string;
  vorgangId: string;
  trainerEmail: string;
  mannschaft: string;
  teams: string[];
  ausstattungsart: string;
  personenGeschaetzt: number;
  sponsor: string;
  hinweise: string;
  artikel: VoranfrageArtikel[];
};

export type ErgaenzungArtikel = {
  artikelId: string;
  herstellernummer: string;
  farbe: string;
  fuer: ArtikelFuer;
  beflockung: string;
  beflockungAbweichend: string;
};

export type ErgaenzungEingabe = {
  groessenFrist: string;
  lieferadresse: string;
  /** Wie in F1: schaltet die Initialen-Abfrage in F2 frei. */
  initialenNoetig: boolean;
  sponsor: string;
  hinweise: string;
  artikel: ErgaenzungArtikel[];
};

/**
 * Die Voranfrage zu einer Nummer. `null` heisst: gibt es nicht, ist keine
 * Voranfrage mehr, oder die Datenbank antwortet nicht.
 *
 * Nur Stufe 0: ein Vorgang, bei dem die Groessen schon laufen, wird nicht noch
 * einmal ergaenzt – sonst wechselte die Stufe ein zweites Mal und die Kontakte
 * kaemen doppelt dazu.
 */
export async function ladeVoranfrage(nummer: string): Promise<Voranfrage | null> {
  const ergebnis = await vorgangPerNummer(nummer);
  if (ergebnis.stand !== "da") return null;
  const satz = ergebnis.vorgang;
  if (satz.stufe !== 0) return null;

  return {
    vorgang: satz.nummer,
    vorgangId: satz.id,
    trainerEmail: satz.trainerEmail ?? "",
    mannschaft: satz.mannschaften.join(", ") || (satz.mannschaftscode ?? ""),
    teams: satz.mannschaften,
    ausstattungsart: satz.ausstattungsart,
    personenGeschaetzt: satz.personenGeschaetzt ?? 0,
    sponsor: satz.sponsor ?? "",
    hinweise: satz.hinweisHaendler ?? "",
    artikel: satz.artikel.map((a) => ({
      artikelId: a.id,
      hersteller: a.hersteller ?? "",
      bezeichnung: a.bezeichnung,
      groessenart: a.groessenart,
      groessenartLabel: GROESSEN_LABEL[a.groessenart],
      platzhalter: !a.herstellernummer,
      herstellernummer: a.herstellernummer ?? "",
      farbe: a.farbe ?? "",
      stueck: a.stueck,
      groesseVon: a.groesseVon ?? "",
      groesseBis: a.groesseBis ?? "",
    })),
  };
}

/** Der Text, der als Beflockung am Artikel steht. */
function beflockung(artikel: ErgaenzungArtikel): string {
  if (artikel.beflockung === "Abweichend") return artikel.beflockungAbweichend;
  if (artikel.beflockung === "Ohne") return "ohne Beflockung";
  return "Standard";
}

/**
 * Macht aus der Voranfrage einen laufenden Vorgang.
 *
 * `null` heisst: nichts geaendert. Auch hier gilt, dass eine gescheiterte
 * Kontaktsuche keine leere Mannschaft ist – hier haengt sogar mehr daran als
 * in F1, weil der Vorgang schon existiert und die Stufe wechselt.
 */
export async function ergaenzeVorgang(
  nummer: string,
  eingabe: ErgaenzungEingabe,
): Promise<BedarfErgebnis | null> {
  const voranfrage = await ladeVoranfrage(nummer);
  if (!voranfrage) return null;

  for (const artikel of voranfrage.artikel) {
    const dazu = eingabe.artikel.find((a) => a.artikelId === artikel.artikelId);
    if (!dazu) continue;

    const ok = await aendereArtikel(artikel.artikelId, {
      herstellernummer: dazu.herstellernummer,
      farbe: dazu.farbe,
      fuer: dazu.fuer,
      beflockung: beflockung(dazu),
    });
    if (!ok) return null;
  }

  const kontakte = await kontakteDerMannschaft(voranfrage.teams);
  if (kontakte === null) return null;
  const ohnePersonen = kontakte.length === 0;

  const geaendert = await aendereVorgang(voranfrage.vorgangId, {
    groessenFrist: eingabe.groessenFrist,
    lieferadresse: eingabe.lieferadresse,
    initialenNoetig: eingabe.initialenNoetig,
    sponsor: eingabe.sponsor,
    hinweisHaendler: eingabe.hinweise,
  });
  if (!geaendert) return null;

  // Erst die Personen, dann die Stufe: ein Vorgang auf „Groessen laufen“ ohne
  // die Leute, die eintragen sollen, waere fuer einen Moment eine Luege.
  const angehaengt = await haengePersonenAn(
    voranfrage.vorgangId,
    kontakte.map((k) => k.id),
  );
  if (!angehaengt) return null;

  // Ohne Personen gibt es nichts anzufragen: der Vorgang endet sofort
  // (docs/formulare.md, M7).
  if (!(await setzeStufe(voranfrage.vorgangId, ohnePersonen ? 9 : 1, ohnePersonen ? 0 : undefined))) {
    return null;
  }

  await vermerke(voranfrage.vorgangId, {
    art: "ergaenzt",
    text: ohnePersonen
      ? "Angaben ergänzt, aber zur Mannschaft ist niemand hinterlegt"
      : "Angaben ergänzt, die Größenabfrage läuft",
    abStufe: 0,
  });

  const frisch = await vorgangPerNummer(nummer);
  if (frisch.stand === "da") {
    await spiegele(frisch.vorgang);
    await spiegelePersonen(frisch.vorgang);
  }

  return {
    vorgang: nummer,
    modus: "vollstaendig",
    // F1b gibt es nur fuer eine Voranfrage, und die bestellt am Ende. Einen
    // Groessencheck kann sie deshalb nie ergeben.
    nurGroessen: false,
    ohnePersonen,
    artikelText: voranfrage.artikel.map((a) => ({
      name: [a.hersteller, a.bezeichnung].filter(Boolean).join(" "),
      detail: `${a.groessenartLabel} · ${a.stueck} Stück je Person`,
    })),
    trainerStatus: statusLink(nummer) ?? "",
    bestaetigen: bestaetigenLink(nummer) ?? "",
    ergaenzen: "",
    personen: kontakte.map((k) => ({
      name: `${k.properties.firstname ?? ""} ${k.properties.lastname ?? ""}`.trim() || k.id,
      groessen: groessenLink(nummer, k.id) ?? "",
      status: statusLink(nummer, k.id) ?? "",
    })),
  };
}
