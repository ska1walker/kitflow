/**
 * Kleiner Store fuer die Entwurfssteuerung (Rolle und Stand).
 *
 * Der Wert lebt im Speicher und wird zusaetzlich in `localStorage` gesichert,
 * damit ein Reload beim Durchklicken nichts zuruecksetzt. Schlaegt der Zugriff
 * fehl, etwa im privaten Fenster, gilt er nur fuer die Sitzung.
 *
 * Gelesen wird ueber `useSyncExternalStore`; deshalb liefert `aktuellerEntwurf`
 * dieselbe Referenz, solange sich nichts aendert.
 *
 * Faellt weg, sobald die Rolle am signierten Link haengt (docs/konzept.md).
 */

import type { Ansicht, StufeNr } from "./typen";

export type Entwurf = { ansicht: Ansicht; stand: StufeNr };

const SCHLUESSEL = "kitflow-entwurf";
const EVENT = "kitflow-entwurf-geaendert";

const STANDARD: Entwurf = { ansicht: "trainer", stand: 2 };

function istStufeNr(wert: unknown): wert is StufeNr {
  return typeof wert === "number" && Number.isInteger(wert) && wert >= 0 && wert <= 9;
}

function istAnsicht(wert: unknown): wert is Ansicht {
  return wert === "trainer" || wert === "spieler" || wert === "sparte";
}

function ausSpeicher(): Entwurf {
  try {
    const roh = window.localStorage.getItem(SCHLUESSEL);
    if (!roh) return STANDARD;
    const gelesen: unknown = JSON.parse(roh);
    if (typeof gelesen !== "object" || gelesen === null) return STANDARD;
    const { ansicht, stand } = gelesen as Record<string, unknown>;
    if (!istAnsicht(ansicht) || !istStufeNr(stand)) return STANDARD;
    return { ansicht, stand };
  } catch {
    return STANDARD;
  }
}

// null = noch nicht aus dem Speicher geladen.
let zustand: Entwurf | null = null;

export function abonnieren(melde: () => void): () => void {
  window.addEventListener(EVENT, melde);
  window.addEventListener("storage", melde);
  return () => {
    window.removeEventListener(EVENT, melde);
    window.removeEventListener("storage", melde);
  };
}

export function aktuellerEntwurf(): Entwurf {
  if (zustand === null) zustand = ausSpeicher();
  return zustand;
}

export function standardEntwurf(): Entwurf {
  return STANDARD;
}

export function setzeEntwurf(next: Entwurf): void {
  zustand = next;
  try {
    window.localStorage.setItem(SCHLUESSEL, JSON.stringify(next));
  } catch {
    // Ohne Speicher gilt der Wert nur fuer diese Sitzung – kein Fehlerfall.
  }
  window.dispatchEvent(new Event(EVENT));
}
