import { Statusseite } from "@/components/statusseite";
import { BEISPIEL_VORGANG, beispielZeilen } from "@/lib/beispieldaten";
import { standardEntwurf } from "@/lib/entwurf";

/**
 * Schaufenster der Statusseite mit den Ansichten Trainer, Spieler und
 * Spartenleitung, zum Durchklicken der neun Stufen.
 *
 * Diese Route fasst HubSpot bewusst nicht an. Sie hat keinen Token, also darf
 * hier auch nichts Echtes stehen: keine Namen, keine Größen, keine Beträge.
 * Echte Vorgänge liegen unter `/v/{vorgang}` hinter einem signierten Link
 * (docs/formulare.md).
 */
export default function SchaufensterRoute() {
  return <Statusseite vorgang={BEISPIEL_VORGANG} zeilen={beispielZeilen(standardEntwurf().stand)} />;
}
