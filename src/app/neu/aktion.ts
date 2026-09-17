"use server";

/**
 * Server Action von F1 · Bedarf melden.
 *
 * Diese Seite hat als einzige keinen Token: der Link geht offen an alle
 * Trainer (docs/formulare.md). Deshalb prüft die Action jedes Feld selbst und
 * hat ein verstecktes Feld als Honigtopf. Wer es ausfüllt, ist kein Mensch.
 */

import {
  meldeBedarf,
  gueltigeTeams,
  kontaktPerEmail,
  type ArtikelEingabe,
  type BedarfErgebnis,
  type Empfaenger,
  type Modus,
} from "@/lib/bedarf";
import { AUSSTATTUNGSARTEN, BEFLOCKUNGEN, NUR_GROESSEN } from "@/lib/mannschaften";
import { GROESSEN_FELD, groessenWerte } from "@/lib/groessen";
import { absolut, sendeM1 } from "@/lib/mail";
import type { ArtikelFuer, Groessenart } from "@/lib/typen";

export type Ergebnis =
  | { stand: "leer" }
  | { stand: "fertig"; ergebnis: BedarfErgebnis }
  | { stand: "fehler"; text: string };

function pflicht(formular: FormData, feld: string): string {
  return String(formular.get(feld) ?? "").trim();
}

/**
 * Die Artikelzeilen kommen als artikel-0-hersteller, artikel-1-hersteller, …
 *
 * Im Modus `voranfrage` fehlen Artikelnummer, Farbe, Für wen und Beflockung
 * absichtlich; dafür kommt der Größenbereich dazu. Alles andere wird in beiden
 * Modi gleich streng geprüft.
 */
function artikelLesen(formular: FormData, modus: Modus): ArtikelEingabe[] | string {
  const artikel: ArtikelEingabe[] = [];
  const voranfrage = modus === "voranfrage";

  for (let i = 0; i < 40; i++) {
    const bezeichnung = String(formular.get(`artikel-${i}-bezeichnung`) ?? "").trim();
    const nummer = String(formular.get(`artikel-${i}-herstellernummer`) ?? "").trim();
    if (!bezeichnung && !nummer) continue;

    if (!bezeichnung) return `Artikel ${i + 1}: die Bezeichnung fehlt.`;
    if (!nummer && !voranfrage) return `Artikel ${i + 1}: die Artikelnummer des Herstellers fehlt.`;

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

    const bereich = bereichLesen(formular, i, art as Groessenart, voranfrage);
    if (typeof bereich === "string") return bereich;

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
      ...bereich,
    });
  }

  return artikel.length > 0 ? artikel : "Bitte mindestens einen Artikel angeben.";
}

/**
 * Der Größenbereich einer Artikelzeile. Beide Grenzen müssen aus der Liste zur
 * Größenart stammen, und „von“ darf nicht über „bis“ liegen – sonst steht im
 * Angebot eine Menge, die niemand nachrechnen kann.
 */
function bereichLesen(
  formular: FormData,
  i: number,
  art: Groessenart,
  voranfrage: boolean,
): { groesseVon: string; groesseBis: string } | string {
  const werte = groessenWerte(art);
  if (!voranfrage || werte.length === 0) return { groesseVon: "", groesseBis: "" };

  const von = String(formular.get(`artikel-${i}-groesse-von`) ?? "").trim();
  const bis = String(formular.get(`artikel-${i}-groesse-bis`) ?? "").trim();
  if (!von || !bis) return `Artikel ${i + 1}: bitte den Größenbereich von und bis angeben.`;
  if (!werte.includes(von) || !werte.includes(bis)) {
    return `Artikel ${i + 1}: der Größenbereich passt nicht zur Größenart.`;
  }
  if (werte.indexOf(von) > werte.indexOf(bis)) {
    return `Artikel ${i + 1}: der Größenbereich läuft rückwärts.`;
  }
  return { groesseVon: von, groesseBis: bis };
}

export async function bedarfMelden(_bisher: Ergebnis, formular: FormData): Promise<Ergebnis> {
  // Honigtopf: das Feld ist im Formular versteckt und für Menschen unerreichbar.
  if (String(formular.get("webseite") ?? "") !== "") {
    return { stand: "fehler", text: "Das hat nicht geklappt." };
  }

  // Fehlt der Modus oder steht Unsinn drin, gilt der strengere Weg. So kann
  // ein manipuliertes Formular die Pflichtfelder nicht abwaehlen.
  const modus: Modus = formular.get("modus") === "voranfrage" ? "voranfrage" : "vollstaendig";

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

  // Fuer wen? Die Voranfrage kennt nur Mannschaften: dort geht es um einen
  // Richtpreis fuer eine Gruppe, und F1b wuerde spaeter wieder die ganze
  // Mannschaft laden. Ein manipuliertes Formular faellt deshalb hierher zurueck.
  const fuerEine = modus !== "voranfrage" && formular.get("empfaenger") === "person";

  let person: Empfaenger | undefined;
  const teams = gueltigeTeams(formular.getAll("teams").map(String));

  if (fuerEine) {
    const adresse = pflicht(formular, "person_email");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse)) {
      return { stand: "fehler", text: "Bitte die E-Mail-Adresse der Person angeben." };
    }
    const gefunden = await kontaktPerEmail(adresse);
    if (!gefunden) {
      return {
        stand: "fehler",
        text: "Zu dieser E-Mail-Adresse gibt es in HubSpot keinen Kontakt. Bitte lass die Person erst von der Geschäftsstelle anlegen.",
      };
    }
    person = gefunden;
  } else if (teams.length === 0) {
    return { stand: "fehler", text: "Bitte mindestens eine Mannschaft wählen." };
  }

  const ausstattungsart = pflicht(formular, "ausstattungsart");
  if (!AUSSTATTUNGSARTEN.includes(ausstattungsart)) {
    return { stand: "fehler", text: "Bitte wählen, was gebraucht wird." };
  }

  // Ein reiner Groessencheck bestellt nichts: kein Artikel, kein Haendler, keine
  // Lieferadresse. Gefragt wird nur, was hier angehakt ist. In der Voranfrage
  // gibt es ihn nicht – dort geht es um einen Richtpreis, und den braucht er
  // nicht (docs/formulare.md).
  const nurGroessen = modus !== "voranfrage" && ausstattungsart === NUR_GROESSEN;

  let artikel: ArtikelEingabe[] = [];
  let groessenarten: Groessenart[] = [];

  if (nurGroessen) {
    groessenarten = formular
      .getAll("groessenarten")
      .map(String)
      .filter((w): w is Groessenart => w in GROESSEN_FELD && w !== "ohne");
    if (groessenarten.length === 0) {
      return { stand: "fehler", text: "Bitte mindestens eine Größe wählen, die gefragt werden soll." };
    }
  } else {
    const gelesen = artikelLesen(formular, modus);
    if (typeof gelesen === "string") return { stand: "fehler", text: gelesen };
    artikel = gelesen;
  }

  // Die Voranfrage braucht statt Fristen und Lieferadresse nur eine Zahl: fuer
  // wie viele Personen. Alles Weitere holt F1b nach (docs/formulare.md).
  let personenZahl = 0;
  let groessenFrist = "";
  let lieferadresse = "";
  // Nur im vollstaendigen Modus gefragt. Die Voranfrage kennt noch keine
  // Beflockung, dort holt F1b das nach (docs/formulare.md).
  let initialenNoetig = false;

  if (modus === "voranfrage") {
    personenZahl = Number(formular.get("personen") ?? 0);
    if (!Number.isInteger(personenZahl) || personenZahl < 1 || personenZahl > 60) {
      return { stand: "fehler", text: "Bitte angeben, für wie viele Personen – zwischen 1 und 60." };
    }
  } else {
    groessenFrist = pflicht(formular, "groessen_frist");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(groessenFrist)) {
      return { stand: "fehler", text: "Bitte eine Frist für die Größen angeben." };
    }

    // Lieferadresse und Zahlungsregel gehoeren zur Bestellung. Ein Groessencheck
    // bestellt nichts, also waeren beide nur Huerden ohne Grund.
    if (!nurGroessen) {
      lieferadresse = pflicht(formular, "lieferadresse");
      if (!lieferadresse) return { stand: "fehler", text: "Bitte die Lieferadresse angeben." };

      if (formular.get("zahlungsregel") !== "ja") {
        return { stand: "fehler", text: "Bitte die Zahlungsregel bestätigen." };
      }

      initialenNoetig = formular.get("initialen_noetig") === "ja";
    }
  }

  const ergebnis = await meldeBedarf({
    modus,
    vorname,
    nachname,
    email,
    telefon,
    teams,
    person,
    mannschaftscode: pflicht(formular, "mannschaftscode"),
    ausstattungsart,
    artikel,
    groessenarten,
    personenZahl,
    groessenFrist,
    lieferadresse,
    initialenNoetig,
    sponsor: pflicht(formular, "sponsor"),
    hinweise: pflicht(formular, "hinweise"),
  });

  if (!ergebnis) {
    return {
      stand: "fehler",
      text: "Der Vorgang konnte gerade nicht angelegt werden. Bitte versuch es in einer Minute noch einmal.",
    };
  }

  // M1 an den Trainer (docs/mails.md). Schlaegt der Versand fehl, bleibt der
  // Vorgang gueltig: die Danke-Seite zeigt die Links dann weiter selbst an.
  const mailAn = await sendeM1(email, {
    vorgang: ergebnis.vorgang,
    vorname,
    mannschaft: person ? person.name : teams.join(", "),
    nurGroessen,
    artikel: ergebnis.artikelText,
    groessenFrist,
    statusLink: absolut(ergebnis.trainerStatus) ?? "",
    bestaetigenLink: absolut(ergebnis.bestaetigen) ?? undefined,
    ergaenzenLink: absolut(ergebnis.ergaenzen) ?? undefined,
    personen: ergebnis.personen.map((p) => ({
      name: p.name,
      groessen: absolut(p.groessen) ?? "",
    })),
  });

  return { stand: "fertig", ergebnis: { ...ergebnis, mailAn: mailAn ?? undefined } };
}
