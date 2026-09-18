import { Card } from "./ui";
import { IconBell } from "./icons";

/**
 * Antwort, wenn der Link stimmt, aber HubSpot gerade nicht antwortet.
 *
 * Vorher stand hier „Dieser Link funktioniert nicht" — eine Störung sah für
 * den Trainer aus wie ein toter Link, und er hätte den Fehler bei sich
 * gesucht. Diese Seite verrät nichts: sie erscheint erst, nachdem die
 * Signatur geprüft wurde, und sagt nichts darüber, ob es den Vorgang gibt.
 */
export function Stoerung() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl items-center px-4">
      <Card className="w-full p-6">
        <div className="flex items-start gap-3.5">
          <span className="mt-0.5 flex-none text-amber-700">
            <IconBell width={22} height={22} />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-ink-900">
              Gerade nicht erreichbar
            </h1>
            <p className="mt-1.5 text-sm text-ink-600">
              Dein Link ist in Ordnung — kitflow kommt im Moment nur nicht an die Daten. Das liegt
              nicht an dir und geht meist von selbst vorbei.
            </p>
            <p className="mt-3 text-sm text-ink-600">
              Lad die Seite in ein paar Minuten noch einmal. Bleibt es dabei, sag deinem Trainer
              oder deiner Trainerin Bescheid.
            </p>
          </div>
        </div>
      </Card>
    </main>
  );
}
