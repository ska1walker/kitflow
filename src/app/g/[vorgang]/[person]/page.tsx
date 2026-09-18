import { GroessenFormular } from "@/components/groessen-formular";
import { KeinZugang } from "@/components/kein-zugang";
import { Stoerung } from "@/components/stoerung";
import { Card } from "@/components/ui";
import { pruefe } from "@/lib/links";
import { ladeGroessenAbfrage } from "@/lib/vorgaenge";

/**
 * F2 · Größen (docs/formulare.md), erreichbar über den persönlichen Link aus
 * Mail M1. Die Personen-ID steht unter der Signatur: wer sie in der Adresszeile
 * austauscht, kommt nicht an fremde Größen.
 */
export default async function GroessenSeite(props: PageProps<"/g/[vorgang]/[person]">) {
  const { vorgang: nummer, person } = await props.params;
  const { t } = await props.searchParams;

  if (typeof t !== "string" || !pruefe(t, "groessen", nummer, person)) return <KeinZugang />;

  const abruf = await ladeGroessenAbfrage(nummer, person);
  if (abruf.stand === "gestoert") return <Stoerung />;
  if (abruf.stand !== "da") return <KeinZugang />;
  const abfrage = abruf.daten;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      {!abfrage.offen ? (
        <Card className="p-6">
          <h1 className="font-display text-xl font-bold tracking-tight text-ink-900">
            Die Größen sind abgeschlossen
          </h1>
          <p className="mt-1.5 text-sm text-ink-600">
            Für {abfrage.vorgang} ist die Liste schon bestätigt und die Anfrage unterwegs. Änderungen
            gehen jetzt nur noch über deine Trainerin oder deinen Trainer.
          </p>
        </Card>
      ) : abfrage.fragen.length === 0 ? (
        <Card className="p-6">
          <h1 className="font-display text-xl font-bold tracking-tight text-ink-900">
            Hier ist noch nichts einzutragen
          </h1>
          <p className="mt-1.5 text-sm text-ink-600">
            Für {abfrage.vorgang} stehen die Artikel noch nicht fest. Sobald sie feststehen, sagt dir
            dieser Link, welche Größen gebraucht werden. Schau in ein paar Tagen noch einmal.
          </p>
        </Card>
      ) : (
        <GroessenFormular abfrage={abfrage} token={t} />
      )}
    </main>
  );
}
