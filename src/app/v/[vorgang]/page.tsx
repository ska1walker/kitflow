import { KeinZugang } from "@/components/kein-zugang";
import { Stoerung } from "@/components/stoerung";
import { Statusseite } from "@/components/statusseite";
import { ergaenzenLink, pruefe } from "@/lib/links";
import { ladeVorgang, nachtragbarePersonen } from "@/lib/vorgaenge";

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

  const ergebnis = await ladeVorgang(nummer);

  // „Gibt es nicht" bekommt dieselbe Antwort wie ein falsches Token: wer raet,
  // soll daraus nichts lernen. Eine Stoerung dagegen liegt nicht am Link und
  // wird auch so benannt — sie ist erst nach geprueftem Token erreichbar und
  // verraet deshalb nichts.
  if (ergebnis.stand === "gestoert") return <Stoerung />;
  if (ergebnis.stand !== "da") return <KeinZugang />;
  const vorgang = ergebnis.vorgang;

  // Auf Stufe 0 braucht der Trainer einen Weg weiter und einen zurueck. Der
  // Ergaenzungslink wird hier serverseitig signiert, damit er nicht aus einer
  // Mail gekramt werden muss (docs/konzept.md).
  const voranfrage =
    vorgang.stufe === 0 ? { ergaenzen: ergaenzenLink(nummer) ?? "", token: t } : undefined;

  // Nachruecken geht nur, solange Groessen gesammelt werden. `nachtragbarePersonen`
  // prueft die Stufe selbst und gibt sonst null zurueck – die Karte entfaellt dann.
  const nachtrag = vorgang.stufe === 1 ? await nachtragbarePersonen(nummer) : null;

  return (
    <Statusseite
      vorgang={vorgang}
      zeilen={[]}
      ansicht="trainer"
      voranfrage={voranfrage}
      nachtrag={nachtrag ? { token: t, personen: nachtrag.personen } : undefined}
    />
  );
}
