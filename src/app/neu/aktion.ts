"use server";

/**
 * Server Action von F1 · Bedarf melden.
 *
 * Diese Seite hat als einzige keinen Token: der Link geht offen an alle
 * Trainer (docs/formulare.md). Deshalb prüft die Action jedes Feld selbst und
 * hat ein verstecktes Feld als Honigtopf. Wer es ausfüllt, ist kein Mensch.
 */

import { meldeBedarf, gueltigeTeams, type ArtikelEingabe, type BedarfErgebnis } from "@/lib/bedarf";
import { AUSSTATTUNGSARTEN, BEFLOCKUNGEN } from "@/lib/mannschaften";
import { GROESSEN_FELD } from "@/lib/groessen";
import type { ArtikelFuer, Groessenart } from "@/lib/typen";

export type Ergebnis =
  | { stand: "leer" }
  | { stand: "fertig"; ergebnis: BedarfErgebnis }
  | { stand: "fehler"; text: string };

function pflicht(formular: FormData, feld: string): string {
  return String(formular.get(feld) ?? "").trim();
}

/** Die Artikelzeilen kommen als artikel-0-hersteller, artikel-1-hersteller, … */
function artikelLesen(formular: FormData): ArtikelEingabe[] | string {
  const artikel: ArtikelEingabe[] = [];

  for (let i = 0; i < 40; i++) {
    const bezeichnung = String(formular.get(`artikel-${i}-bezeichnung`) ?? "").trim();
    const nummer = String(formular.get(`artikel-${i}-herstellernummer`) ?? "").trim();
    if (!bezeichnung && !nummer) continue;

    if (!bezeichnung) return `Artikel ${i + 1}: die Bezeichnung fehlt.`;
    if (!nummer) return `Artikel ${i + 1}: die Artikelnummer des Herstellers fehlt.`;

    const art = String(formular.get(`artikel-${i}-groessenart`) ?? "");
    if (!(art in GROESSEN_FELD)) return `Artikel ${i + 1}: die Größenart fehlt.`;

    const fuer = String(formular.get(`artikel-${i}-fuer`) ?? "alle");
    const stueck = Number(formular.get(`artikel-${i}-stueck`) ?? 1);
    if (!Number.isInteger(stueck) || stueck < 1 || stueck > 20) {
      return `Artikel ${i + 1}: Stück je Person muss zwischen 1 und 20 liegen.`;
    }

    const beflockung = String(formular.get(`artikel-${i}-beflockung`) ?? "Standard");
    if (!BEFLOCKUNGEN.includes(beflockung)) return `Artikel ${i + 1}: unbekannte Beflockung.`;
    const abweichend = String(formular.get(`artikel-${i}-beflockung-text`) ?? "").trim();
    if (beflockung === "Abweichend" && !abweichend) {
      return `Artikel ${i + 1}: bitte beschreiben, wie abweichend beflockt werden soll.`;
    }

    artikel.push({
      hersteller: String(formular.get(`artikel-${i}-hersteller`) ?? "").trim(),
      bezeichnung,
      herstellernummer: nummer,
      farbe: String(formular.get(`artikel-${i}-farbe`) ?? "").trim(),
      groessenart: art as Groessenart,
      stueck,
      fuer: (["alle", "feldspieler", "torwart"].includes(fuer) ? fuer : "alle") as ArtikelFuer,
      beflockung,
      beflockungAbweichend: abweichend,
    });
  }

  return artikel.length > 0 ? artikel : "Bitte mindestens einen Artikel angeben.";
}

export async function bedarfMelden(_bisher: Ergebnis, formular: FormData): Promise<Ergebnis> {
  // Honigtopf: das Feld ist im Formular versteckt und für Menschen unerreichbar.
  if (String(formular.get("webseite") ?? "") !== "") {
    return { stand: "fehler", text: "Das hat nicht geklappt." };
  }

  const vorname = pflicht(formular, "vorname");
  const nachname = pflicht(formular, "nachname");
  const email = pflicht(formular, "email");
  const telefon = pflicht(formular, "telefon");
  if (!vorname || !nachname || !email || !telefon) {
    return { stand: "fehler", text: "Bitte Vorname, Nachname, E-Mail und Mobilnummer ausfüllen." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { stand: "fehler", text: "Die E-Mail-Adresse sieht nicht richtig aus." };
  }

  const teams = gueltigeTeams(formular.getAll("teams").map(String));
  if (teams.length === 0) return { stand: "fehler", text: "Bitte mindestens eine Mannschaft wählen." };

  const ausstattungsart = pflicht(formular, "ausstattungsart");
  if (!AUSSTATTUNGSARTEN.includes(ausstattungsart)) {
    return { stand: "fehler", text: "Bitte wählen, was gebraucht wird." };
  }

  const artikel = artikelLesen(formular);
  if (typeof artikel === "string") return { stand: "fehler", text: artikel };

  const groessenFrist = pflicht(formular, "groessen_frist");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(groessenFrist)) {
    return { stand: "fehler", text: "Bitte eine Frist für die Größen angeben." };
  }

  const lieferadresse = pflicht(formular, "lieferadresse");
  if (!lieferadresse) return { stand: "fehler", text: "Bitte die Lieferadresse angeben." };

  if (formular.get("zahlungsregel") !== "ja") {
    return { stand: "fehler", text: "Bitte die Zahlungsregel bestätigen." };
  }

  const ergebnis = await meldeBedarf({
    vorname,
    nachname,
    email,
    telefon,
    teams,
    mannschaftscode: pflicht(formular, "mannschaftscode"),
    ausstattungsart,
    artikel,
    groessenFrist,
    lieferadresse,
    sponsor: pflicht(formular, "sponsor"),
    hinweise: pflicht(formular, "hinweise"),
  });

  if (!ergebnis) {
    return {
      stand: "fehler",
      text: "Der Vorgang konnte gerade nicht angelegt werden. Bitte versuch es in einer Minute noch einmal.",
    };
  }

  return { stand: "fertig", ergebnis };
}
