import { KeinZugang } from "@/components/kein-zugang";
import { Stoerung } from "@/components/stoerung";
import { Statusseite } from "@/components/statusseite";
import { pruefe } from "@/lib/links";
import { fuerSpieler, ladeVorgang } from "@/lib/vorgaenge";

/**
 * Statusseite für eine einzelne Person: eigene Größen, eigener Stand, keine
 * Beträge und keine anderen Namen (docs/formulare.md).
 *
 * Die Personen-ID steht unter der Signatur. Wer sie in der Adresszeile
 * austauscht, bekommt dieselbe Antwort wie mit einem erfundenen Token.
 */
export default async function SpielerStatus(props: PageProps<"/v/[vorgang]/[person]">) {
  const { vorgang: nummer, person } = await props.params;
  const { t } = await props.searchParams;

  if (typeof t !== "string" || !pruefe(t, "status", nummer, person)) return <KeinZugang />;

  const ergebnis = await ladeVorgang(nummer, person);
  if (ergebnis.stand === "gestoert") return <Stoerung />;
  if (ergebnis.stand !== "da") return <KeinZugang />;

  // Erst kuerzen, dann rendern: was gar nicht erst mitgeschickt wird, kann im
  // Quelltext auch nicht stehen.
  return <Statusseite vorgang={fuerSpieler(ergebnis.vorgang)} ansicht="spieler" />;
}
