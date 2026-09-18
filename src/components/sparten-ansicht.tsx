import { Badge } from "./ui";
import { LETZTE_STUFE, stufe as stufeVon } from "@/lib/stufen";
import type { VorgangsZeile } from "@/lib/typen";
import { MiniLeiste } from "./schrittleiste";

/**
 * Eine Zeile ist ein Link auf die Statusseite des Vorgangs — in der
 * Trainer-Ansicht, denn dort liegen die Karten, die die Spartenleitung braucht.
 * Der Link wird serverseitig signiert (`uebersicht.ts`): auch die
 * Spartenleitung kommt an eine Statusseite nur mit gültigem Token, es gibt
 * keinen zweiten Weg hinein.
 */
function Zeile({ vorgang }: { vorgang: VorgangsZeile }) {
  return (
    <a
      href={vorgang.href ?? "#"}
      className="grid w-full grid-cols-1 items-center gap-2 rounded-2xl border border-ink-200 bg-white px-[18px] py-3.5 text-left shadow-soft transition-colors hover:border-pitch-300 md:grid-cols-[132px_minmax(0,1.3fr)_minmax(0,1.4fr)_minmax(0,1fr)] md:gap-4"
    >
      <span className="tnum font-mono text-xs text-ink-600">{vorgang.nummer}</span>

      <span className="min-w-0">
        <b className="block text-[15px] font-bold tracking-[-0.01em]">{vorgang.mannschaft}</b>
        <small className="text-xs text-ink-500">{vorgang.gegenstand}</small>
      </span>

      <span className="min-w-0">
        <span className="text-[13px] font-semibold">{stufeVon(vorgang.stufe).titel}</span>
        <MiniLeiste stand={vorgang.stufe} />
      </span>

      <span className="flex flex-col items-start gap-1 text-[13px]">
        {vorgang.du ? (
          <Badge tone="amber">wartet auf dich</Badge>
        ) : (
          <span>
            wartet auf <b>{vorgang.wartetAuf}</b>
          </span>
        )}
        {vorgang.warnung ? (
          <Badge tone="amber">{vorgang.warnung}</Badge>
        ) : (
          (vorgang.frist || vorgang.seit) && (
            <small className="text-xs text-ink-400">
              {vorgang.frist ?? `seit ${vorgang.seit}`}
            </small>
          )
        )}
      </span>
    </a>
  );
}

/**
 * Übersicht der Spartenleitung: alle Vorgänge auf einen Blick, mit der einzigen
 * Frage, die hier zählt – wo hängt es und wer ist am Zug.
 */
export function SpartenAnsicht({ zeilen }: { zeilen: VorgangsZeile[] }) {
  const laufen = zeilen.filter((v) => v.stufe < LETZTE_STUFE).length;
  const fuerDich = zeilen.filter((v) => v.du).length;
  const haengen = zeilen.filter((v) => v.warnung).length;

  return (
    <>
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow text-pitch-600">Spartenleitung</div>
          <h1 className="font-display mt-1 text-3xl font-extrabold tracking-tight text-ink-900">
            Alle Ausstattungs-Vorgänge
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="outline" className="tnum">
            {laufen} laufen
          </Badge>
          {fuerDich > 0 && (
            <Badge tone="amber" className="tnum">
              {fuerDich} wartet auf dich
            </Badge>
          )}
          {haengen > 0 && (
            <Badge tone="outline" className="tnum">
              {haengen} hängt
            </Badge>
          )}
        </div>
      </section>

      <div className="flex flex-col gap-2.5">
        {zeilen.map((v) => (
          <Zeile key={v.nummer} vorgang={v} />
        ))}
      </div>
    </>
  );
}
