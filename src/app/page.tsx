import { Card, KnopfLink } from "@/components/ui";
import { IconTrikot } from "@/components/icons";
import { VEREIN } from "@/lib/beispieldaten";

/**
 * Die Startseite — die einzige Seite, die ohne Link und ohne Token im Netz
 * steht.
 *
 * Hier stand bis zum 18.09.2026 das Schaufenster: die Statusseite mit
 * Beispieldaten zum Durchklicken der Stufen. Die Namen darin waren erfunden,
 * aber die beiden Händler mit ihren Ansprechpartnern, die Artikelnummern aus
 * einer echten Anfrage und der Sponsor waren es nicht — und wer den Zuschlag
 * bekam, stand mit dabei. Von außen war das eine vom anderen nicht zu
 * unterscheiden.
 *
 * Deshalb steht hier jetzt nur, was kitflow ist und wo es weitergeht. Das
 * Durchklicken zieht mit dem Login nach `/sparte` um; dort darf es auch echte
 * Vorgänge zeigen, weil dort jemand angemeldet ist.
 */
export default function Startseite() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-4 py-12">
      <span className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-ink-950 text-signal-400">
          <IconTrikot width={20} height={20} />
        </span>
        <b className="font-display text-2xl font-extrabold tracking-[-0.03em] text-ink-900">
          kitflow
        </b>
      </span>

      <h1 className="font-display mt-5 text-3xl font-extrabold tracking-tight text-ink-900">
        Ausstattung für {VEREIN.name}
      </h1>
      <p className="mt-2 text-sm text-ink-600">
        Trainerinnen und Trainer melden hier, was ihre Mannschaft braucht. Danach sammelt kitflow
        die Größen ein, du prüfst die Liste, und erst dann geht eine Anfrage an die Händler.
      </p>

      <Card className="mt-6 p-6">
        <h2 className="font-display text-lg font-bold text-ink-900">Du brauchst Ausstattung?</h2>
        <p className="mt-1.5 text-sm text-ink-600">
          Melde den Bedarf für deine Mannschaft. Du brauchst dafür die E-Mail-Adresse, unter der
          dich der Verein kennt.
        </p>
        <div className="mt-4">
          <KnopfLink href="/neu">Bedarf melden</KnopfLink>
        </div>
      </Card>

      <Card className="mt-4 p-6">
        <h2 className="font-display text-lg font-bold text-ink-900">
          Du sollst deine Größe eintragen?
        </h2>
        <p className="mt-1.5 text-sm text-ink-600">
          Dafür bekommst du einen persönlichen Link per E-Mail. Er gilt nur für dich — hier auf der
          Startseite gibt es nichts einzutragen. Findest du den Link nicht mehr, frag deine
          Trainerin oder deinen Trainer.
        </p>
      </Card>

      <p className="mt-8 text-xs text-ink-500">
        Interne Anwendung der Fußballsparte. Fragen an Kai Böhm, Spartenleiter Fußball.
      </p>
    </main>
  );
}
