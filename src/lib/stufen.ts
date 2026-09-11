/**
 * Die Stufen der HubSpot-Pipeline „Ausstattung“ (docs/konzept.md).
 *
 * Das ist Fachkonfiguration, keine Beispieldaten: `intern` ist der Name der
 * Stufe in HubSpot, `titel` das, was auf der Statusseite steht.
 */

import {
  IconRuler,
  IconSend,
  IconDokument,
  IconMuenzen,
  IconCheck,
  IconWarenkorb,
  IconLieferung,
  IconFahne,
} from "@/components/icons";
import type { Stufe, StufeNr } from "./typen";

export const STUFEN: Stufe[] = [
  {
    nr: 0,
    intern: "Voranfrage",
    kurz: "Voranfrage",
    titel: "Richtangebot für den Sponsor",
    icon: IconDokument,
  },
  { nr: 1, intern: "Größen laufen", kurz: "Größen", titel: "Größen werden gesammelt", icon: IconRuler },
  { nr: 2, intern: "Anfrage raus", kurz: "Anfrage", titel: "Angebote angefragt", icon: IconSend },
  { nr: 3, intern: "Angebote da", kurz: "Angebote", titel: "Beide Angebote sind da", icon: IconDokument },
  { nr: 4, intern: "Finanzierung", kurz: "Finanzierung", titel: "Finanzierung läuft", icon: IconMuenzen },
  { nr: 5, intern: "Bestellbar", kurz: "Geld da", titel: "Das Geld ist da", icon: IconCheck },
  { nr: 6, intern: "Bestellt", kurz: "Bestellt", titel: "Bestellt", icon: IconWarenkorb },
  { nr: 7, intern: "Geliefert", kurz: "Geliefert", titel: "Geliefert", icon: IconLieferung },
  { nr: 8, intern: "Abgeschlossen", kurz: "Abgeschlossen", titel: "Abgeschlossen", icon: IconFahne },
  { nr: 9, intern: "Abgebrochen", kurz: "Abgebrochen", titel: "Abgebrochen", icon: IconFahne },
];

/** Die letzte Stufe der Schrittleiste. Stufe 9 (Abgebrochen) liegt daneben. */
export const LETZTE_STUFE: StufeNr = 8;

/** Die erste Stufe der Schrittleiste. Stufe 0 (Voranfrage) liegt davor. */
export const ERSTE_STUFE: StufeNr = 1;

/** Gesucht wird ueber die Nummer, nicht ueber den Index: Stufe 0 gibt es. */
export function stufe(nr: StufeNr): Stufe {
  const treffer = STUFEN.find((s) => s.nr === nr);
  if (!treffer) throw new Error(`Unbekannte Stufe: ${nr}`);
  return treffer;
}

/** Uebersetzt den Namen einer HubSpot-Stufe in unsere Stufennummer. */
export function stufeAusName(name: string): StufeNr | null {
  const treffer = STUFEN.find((s) => s.intern.toLowerCase() === name.trim().toLowerCase());
  return treffer ? treffer.nr : null;
}
