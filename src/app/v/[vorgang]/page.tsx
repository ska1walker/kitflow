import { KeinZugang } from "@/components/kein-zugang";
import { Statusseite } from "@/components/statusseite";
import { pruefe } from "@/lib/links";
import { ladeVorgang } from "@/lib/vorgaenge";

/**
 * Statusseite für den Trainer, erreichbar nur über den signierten Link aus
 * Mail M1 (docs/mails.md). Ohne gültiges Token gibt es keine Daten, auch nicht
 * die Auskunft, ob es den Vorgang überhaupt gibt.
 *
 * Die Rolle steht nicht in der URL: der Link ohne Personen-Teil ist der
 * Trainer-Link. Die Spieler-Ansicht liegt eine Ebene tiefer.
 */
export default async function TrainerStatus(props: PageProps<"/v/[vorgang]">) {
  const { vorgang: nummer } = await props.params;
  const { t } = await props.searchParams;

  if (typeof t !== "string" || !pruefe(t, "status", nummer)) return <KeinZugang />;

  const vorgang = await ladeVorgang(nummer);

  // ladeVorgang faellt auf den Beispiel-Vorgang zurueck, wenn HubSpot nichts
  // liefert. Unter einem echten Link waere das eine Luege: dann lieber die
  // gleiche Antwort wie bei einem falschen Token.
  if (vorgang.quelle !== "hubspot" || vorgang.nummer !== nummer) return <KeinZugang />;

  return <Statusseite vorgang={vorgang} zeilen={[]} festeAnsicht="trainer" />;
}
