import { Card } from "./ui";
import { IconStop } from "./icons";

/**
 * Antwort auf einen Link, der nicht stimmt.
 *
 * Sie sagt bewusst nicht, woran es lag: ob der Vorgang existiert, ob die
 * Signatur falsch war oder ob die Person nicht dazugehoert. Wer raten will,
 * soll aus der Antwort nichts lernen. Fuer den, der einfach einen alten Link
 * erwischt hat, steht darunter, was er tun kann (docs/formulare.md).
 */
export function KeinZugang() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl items-center px-4">
      <Card className="w-full p-6">
        <div className="flex items-start gap-3.5">
          <span className="mt-0.5 flex-none text-ink-500">
            <IconStop width={22} height={22} />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-ink-900">
              Dieser Link funktioniert nicht
            </h1>
            <p className="mt-1.5 text-sm text-ink-600">
              Er ist unvollständig, veraltet oder gehört zu einem anderen Vorgang. Am häufigsten
              liegt es daran, dass beim Weiterleiten ein Stück der Adresse verloren gegangen ist.
            </p>
            <p className="mt-3 text-sm text-ink-600">
              Nimm den Link bitte direkt aus deiner E-Mail und öffne ihn dort. Wenn das nicht hilft,
              melde dich bei deinem Trainer oder deiner Trainerin.
            </p>
          </div>
        </div>
      </Card>
    </main>
  );
}
