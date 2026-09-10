import { KeinZugang } from "@/components/kein-zugang";
import { TrainerFormular } from "@/components/trainer-formular";
import { Card } from "@/components/ui";
import { bestaetigenLink, pruefe } from "@/lib/links";
import { ladeTrainerAbfrage } from "@/lib/vorgaenge";

/**
 * F2 als Trainer (docs/formulare.md), aufgerufen aus der Liste in F3.
 *
 * Eigener Zweck `trainer`: ein Spieler-Link öffnet dieses Formular nicht, und
 * ein Trainer-Link öffnet nicht das Formular für Spieler.
 */
export default async function TrainerGroessenSeite(props: PageProps<"/b/[vorgang]/[person]">) {
  const { vorgang: nummer, person } = await props.params;
  const { t } = await props.searchParams;

  if (typeof t !== "string" || !pruefe(t, "trainer", nummer, person)) return <KeinZugang />;

  const abfrage = await ladeTrainerAbfrage(nummer, person);
  if (!abfrage) return <KeinZugang />;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      {abfrage.offen ? (
        <TrainerFormular
          abfrage={abfrage}
          token={t}
          zurueck={bestaetigenLink(nummer) ?? "/"}
        />
      ) : (
        <Card className="p-6">
          <h1 className="font-display text-xl font-bold tracking-tight text-ink-900">
            Die Größenphase ist vorbei
          </h1>
          <p className="mt-1.5 text-sm text-ink-600">
            Für {abfrage.vorgang} ist die Liste bereits bestätigt.
          </p>
        </Card>
      )}
    </main>
  );
}
