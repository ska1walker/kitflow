import { AnmeldeFormular } from "@/components/anmelde-formular";
import { Card } from "@/components/ui";
import { IconTrikot } from "@/components/icons";
import { anmeldungAktiv } from "@/lib/anmeldung";

export const metadata = { title: "Anmelden · kitflow" };

/**
 * Auch hier nicht vorrendern: ob die Anmeldung eingerichtet ist, entscheidet
 * eine Umgebungsvariable. Eingebacken stünde auf der Seite der Stand vom
 * Bauzeitpunkt, nicht der von jetzt.
 */
export const dynamic = "force-dynamic";

/**
 * Die Anmeldung der Spartenleitung.
 *
 * Für Trainer, Spieler und Eltern gibt es hier nichts zu holen: sie weisen sich
 * über den Link aus ihrer Mail aus und brauchen kein Konto. Das steht auch so
 * auf der Seite, sonst versucht es jemand mit seiner Adresse und wartet auf
 * eine Mail, die nie kommt.
 */
export default async function Anmelden() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-12">
      <span className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-ink-950 text-signal-400">
          <IconTrikot width={20} height={20} />
        </span>
        <b className="font-display text-2xl font-extrabold tracking-[-0.03em] text-ink-900">
          kitflow
        </b>
      </span>

      <h1 className="font-display mt-5 text-3xl font-extrabold tracking-tight text-ink-900">
        Anmeldung der Spartenleitung
      </h1>
      <p className="mt-2 text-sm text-ink-600">
        Passwortlos: du bekommst einen Link ins Postfach und bist damit angemeldet.
      </p>

      <div className="mt-6">
        {anmeldungAktiv() ? (
          <AnmeldeFormular />
        ) : (
          <Card className="p-6">
            <h2 className="font-display text-lg font-bold text-ink-900">
              Die Anmeldung ist hier nicht eingerichtet
            </h2>
            <p className="mt-1.5 text-sm text-ink-600">
              Auf diesem Server fehlen die Zugangsdaten. Solange kommt niemand hinein — auch nicht
              versehentlich.
            </p>
          </Card>
        )}
      </div>

      <p className="mt-6 text-xs text-ink-500">
        Du bist Trainerin oder Trainer und willst einen Vorgang sehen? Dafür brauchst du kein Konto —
        nimm den Link aus deiner kitflow-Mail. Größen trägt man ebenfalls über den persönlichen Link
        ein.
      </p>
    </main>
  );
}
