import { KeinZugang } from "@/components/kein-zugang";
import { Stoerung } from "@/components/stoerung";
import { Card } from "@/components/ui";
import { AnlegenKarte } from "@/components/anlegen-karte";
import { holeEntwurf } from "@/lib/entwurf";
import { pruefe } from "@/lib/links";
import { NUR_GROESSEN } from "@/lib/mannschaften";

export const metadata = { title: "Bedarf bestätigen · kitflow" };
export const dynamic = "force-dynamic";

/**
 * Der Bestätigungsklick aus der Mail an `/neu`.
 *
 * `/neu` steht offen im Netz und kann nicht prüfen, ob der am Formular die
 * eingetragene Adresse besitzt. Diese Seite ist der Beweis: den Link bekommt
 * nur, wer die Mail bekommen hat.
 *
 * Sie zeigt zuerst, was angelegt würde. Das ist Absicht — sie **legt beim
 * Öffnen nichts an**, weil Mailprogramme Links vorab öffnen.
 *
 * Gezeigt wird nur, was der Absender selbst eingetippt hat: Mannschaft, Art,
 * Artikel, Frist. Keine Namen aus der Mannschaft, keine Größen, keine
 * persönlichen Links — die Seite hängt an keinem Personen-Token.
 */
export default async function Bestaetigen(props: PageProps<"/neu/bestaetigen/[entwurf]">) {
  const { entwurf: id } = await props.params;
  const { t } = await props.searchParams;

  if (typeof t !== "string" || !pruefe(t, "anlegen", id)) return <KeinZugang />;

  const abruf = await holeEntwurf(id);
  if (abruf.stand === "gestoert") return <Stoerung />;

  if (abruf.stand === "abgelaufen" || abruf.stand === "unbekannt") {
    const abgelaufen = abruf.stand === "abgelaufen";
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl items-center px-4">
        <Card className="w-full p-6">
          <h1 className="font-display text-xl font-bold tracking-tight text-ink-900">
            {abgelaufen ? "Dieser Link ist abgelaufen" : "Dieser Link wurde schon benutzt"}
          </h1>
          <p className="mt-1.5 text-sm text-ink-600">
            {abgelaufen
              ? "Ein Bestätigungslink gilt nur kurz. Melde den Bedarf bitte noch einmal – es dauert keine Minute."
              : "Wahrscheinlich hast du den Vorgang schon angelegt. Sieh in deinem Postfach nach der Mail „Größenabfrage läuft“ – dann ist alles in Ordnung."}
          </p>
          <p className="mt-4 text-sm">
            <a href="/neu" className="font-semibold text-pitch-700 underline">
              Zurück zur Bedarfsmeldung
            </a>
          </p>
        </Card>
      </main>
    );
  }

  const d = abruf.entwurf.daten;

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl items-center px-4 py-12">
      <div className="w-full">
        <AnlegenKarte
          entwurf={abruf.entwurf.id}
          token={t}
          mannschaft={d.person ? d.person.name : d.teams.join(", ")}
          ausstattungsart={d.ausstattungsart}
          frist={d.ausstattungsart === NUR_GROESSEN || d.modus !== "voranfrage" ? d.groessenFrist : ""}
          artikel={d.artikel.map((a) => ({
            name: [a.hersteller, a.bezeichnung].filter(Boolean).join(" "),
            detail: `${a.stueck} Stück je Person`,
          }))}
        />
      </div>
    </main>
  );
}
