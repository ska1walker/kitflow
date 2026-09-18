import { ErgaenzenFormular } from "@/components/ergaenzen-formular";
import { KeinZugang } from "@/components/kein-zugang";
import { Stoerung } from "@/components/stoerung";
import { pruefe } from "@/lib/links";
import { ladeVoranfrage } from "@/lib/ergaenzen";

/**
 * F1b · Angaben vervollständigen (docs/formulare.md).
 *
 * Hier landet der Trainer, wenn er F1 im einfachen Modus gemeldet hat und die
 * Finanzierung geklärt ist. Die Seite trägt keine Namen von Kindern: es geht
 * nur um Artikel, Fristen und die Lieferadresse.
 */
export default async function ErgaenzenSeite(props: PageProps<"/e/[vorgang]">) {
  const { vorgang: nummer } = await props.params;
  const { t } = await props.searchParams;

  if (typeof t !== "string" || !pruefe(t, "ergaenzen", nummer)) return <KeinZugang />;

  const abruf = await ladeVoranfrage(nummer);
  if (abruf.stand === "gestoert") return <Stoerung />;
  if (abruf.stand !== "da") return <KeinZugang />;
  const voranfrage = abruf.daten;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <ErgaenzenFormular voranfrage={voranfrage} token={t} />
    </main>
  );
}
