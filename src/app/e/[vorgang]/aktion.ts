"use server";

/**
 * Server Action von F1b · Angaben vervollständigen.
 *
 * Sie prüft das Token selbst, wie jede Action. Geprüft wird hier genau das,
 * was der einfache Modus von F1 ausgelassen hat – mit derselben Strenge wie im
 * vollständigen Modus (src/app/neu/aktion.ts).
 */

import { pruefe } from "@/lib/links";
import {
  ergaenzeVorgang,
  ladeVoranfrage,
  type ErgaenzungArtikel,
} from "@/lib/ergaenzen";
import { BEFLOCKUNGEN } from "@/lib/mannschaften";
import { absolut, sendeM1 } from "@/lib/mail";
import type { ArtikelFuer } from "@/lib/typen";
import type { BedarfErgebnis } from "@/lib/bedarf";

export type Ergebnis =
  | { stand: "leer" }
  | { stand: "fertig"; ergebnis: BedarfErgebnis }
  | { stand: "fehler"; text: string };

const FUER_WERTE = ["alle", "feldspieler", "torwart"];

/** Die Zeilen kommen als pos-{artikelId}-nummer, pos-{artikelId}-farbe, … */
function artikelLesen(
  formular: FormData,
  positionsIds: string[],
): ErgaenzungArtikel[] | string {
  const artikel: ErgaenzungArtikel[] = [];

  for (const [i, id] of positionsIds.entries()) {
    const nummer = String(formular.get(`pos-${id}-herstellernummer`) ?? "").trim();
    if (!nummer) return `Artikel ${i + 1}: die Artikelnummer des Herstellers fehlt.`;

    const beflockung = String(formular.get(`pos-${id}-beflockung`) ?? "Standard");
    if (!BEFLOCKUNGEN.includes(beflockung)) return `Artikel ${i + 1}: unbekannte Beflockung.`;

    const abweichend = String(formular.get(`pos-${id}-beflockung-text`) ?? "").trim();
    if (beflockung === "Abweichend" && !abweichend) {
      return `Artikel ${i + 1}: bitte beschreiben, wie abweichend beflockt werden soll.`;
    }

    const fuer = String(formular.get(`pos-${id}-fuer`) ?? "alle");

    artikel.push({
      artikelId: id,
      herstellernummer: nummer,
      farbe: String(formular.get(`pos-${id}-farbe`) ?? "").trim(),
      fuer: (FUER_WERTE.includes(fuer) ? fuer : "alle") as ArtikelFuer,
      beflockung,
      beflockungAbweichend: abweichend,
    });
  }

  return artikel;
}

export async function angabenErgaenzen(
  vorgang: string,
  token: string,
  _bisher: Ergebnis,
  formular: FormData,
): Promise<Ergebnis> {
  if (!pruefe(token, "ergaenzen", vorgang)) {
    return { stand: "fehler", text: "Dieser Link funktioniert nicht mehr." };
  }

  // Frisch laden statt dem Formular glauben: welche Positionen es gibt,
  // entscheidet HubSpot, nicht die abgeschickten Feldnamen.
  const abruf = await ladeVoranfrage(vorgang);
  if (abruf.stand === "gestoert") {
    return { stand: "fehler", text: "kitflow kommt gerade nicht an die Daten. Bitte versuch es in einer Minute noch einmal." };
  }
  if (abruf.stand !== "da") {
    return {
      stand: "fehler",
      text: "Dieser Vorgang ist keine offene Voranfrage mehr.",
    };
  }
  const voranfrage = abruf.daten;
  if (voranfrage.artikel.length === 0) {
    return { stand: "fehler", text: "Zu diesem Vorgang steht kein Artikel in HubSpot." };
  }

  const artikel = artikelLesen(
    formular,
    voranfrage.artikel.map((a) => a.artikelId),
  );
  if (typeof artikel === "string") return { stand: "fehler", text: artikel };

  const groessenFrist = String(formular.get("groessen_frist") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(groessenFrist)) {
    return { stand: "fehler", text: "Bitte eine Frist für die Größen angeben." };
  }

  const lieferadresse = String(formular.get("lieferadresse") ?? "").trim();
  if (!lieferadresse) return { stand: "fehler", text: "Bitte die Lieferadresse angeben." };

  if (formular.get("zahlungsregel") !== "ja") {
    return { stand: "fehler", text: "Bitte die Zahlungsregel bestätigen." };
  }

  const ergebnis = await ergaenzeVorgang(vorgang, {
    groessenFrist,
    lieferadresse,
    initialenNoetig: formular.get("initialen_noetig") === "ja",
    sponsor: String(formular.get("sponsor") ?? "").trim(),
    hinweise: String(formular.get("hinweise") ?? "").trim(),
    artikel,
  });

  if (!ergebnis) {
    return {
      stand: "fehler",
      text: "Das hat gerade nicht geklappt. Bitte versuch es in einer Minute noch einmal.",
    };
  }

  // Jetzt gibt es Groessenlinks: M1 im vollstaendigen Zuschnitt an den Trainer.
  // Der Vorname steht in keiner Eigenschaft, die Mail kommt ohne ihn aus.
  const mailAn = ergebnis.ohnePersonen
    ? null
    : await sendeM1(voranfrage.trainerEmail, {
        vorgang: ergebnis.vorgang,
        vorname: "",
        mannschaft: voranfrage.mannschaft,
        artikel: ergebnis.artikelText,
        groessenFrist,
        statusLink: absolut(ergebnis.trainerStatus) ?? "",
        bestaetigenLink: absolut(ergebnis.bestaetigen) ?? undefined,
      });

  return { stand: "fertig", ergebnis: { ...ergebnis, mailAn: mailAn ?? undefined } };
}
