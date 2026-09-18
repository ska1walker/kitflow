import { KeinZugang } from "@/components/kein-zugang";
import { Stoerung } from "@/components/stoerung";
import { ListeFormular } from "@/components/liste-formular";
import { Card } from "@/components/ui";
import { pruefe } from "@/lib/links";
import { ladeListe } from "@/lib/vorgaenge";

/**
 * F3 · Liste bestätigen (docs/formulare.md), über den Trainer-Link aus Mail M3.
 *
 * Hier stehen Namen, auch bei Jugendmannschaften: der Trainer muss wissen,
 * wessen Größe fehlt. Die Seite hängt an seinem eigenen signierten Link.
 */
export default async function ListeSeite(props: PageProps<"/b/[vorgang]">) {
  const { vorgang: nummer } = await props.params;
  const { t } = await props.searchParams;

  if (typeof t !== "string" || !pruefe(t, "bestaetigen", nummer)) return <KeinZugang />;

  const abruf = await ladeListe(nummer);
  if (abruf.stand === "gestoert") return <Stoerung />;
  if (abruf.stand !== "da") return <KeinZugang />;
  const liste = abruf.daten;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      {liste.offen ? (
        <ListeFormular liste={liste} token={t} />
      ) : (
        <Card className="p-6">
          <h1 className="font-display text-xl font-bold tracking-tight text-ink-900">
            Die Größenphase ist vorbei
          </h1>
          <p className="mt-1.5 text-sm text-ink-600">
            Für {liste.vorgang} ist die Liste bereits bestätigt und der Vorgang weitergelaufen.
          </p>
        </Card>
      )}
    </main>
  );
}
