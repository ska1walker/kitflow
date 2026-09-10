import { Statusseite } from "@/components/statusseite";
import { ladeVorgang, ladeZeilen } from "@/lib/vorgaenge";
import { standardEntwurf } from "@/lib/entwurf";

/**
 * Statusseite eines Ausstattungs-Vorgangs mit den Ansichten Trainer, Spieler
 * und Spartenleitung.
 *
 * Die Daten kommen aus HubSpot, solange Token und Pipeline stehen; sonst aus
 * den Beispieldaten. Die Rolle hängt vorerst am Umschalter, später am
 * signierten Link (docs/konzept.md).
 */
export default async function StatusseiteRoute() {
  const [vorgang, zeilen] = await Promise.all([
    ladeVorgang(),
    ladeZeilen(standardEntwurf().stand),
  ]);

  return <Statusseite vorgang={vorgang} zeilen={zeilen} />;
}
