import { Statusseite } from "@/components/statusseite";

/**
 * Statusseite eines Ausstattungs-Vorgangs mit den Ansichten Trainer, Spieler
 * und Spartenleitung.
 *
 * Die Daten kommen vorerst aus src/lib/beispieldaten.ts. Sobald HubSpot
 * angebunden ist, lädt diese Server-Komponente den Deal und reicht ihn an
 * `Statusseite` weiter; die Rolle hängt dann am signierten Link statt am
 * Regler der Entwurfsleiste.
 */
export default function StatusseiteRoute() {
  return <Statusseite />;
}
