"use client";

import { Badge } from "./ui";
import { LETZTE_STUFE, VORGANG_NUMMER, stufe as stufeVon, vorgaenge } from "@/lib/beispieldaten";
import type { StufeNr, VorgangsZeile } from "@/lib/typen";
import { MiniLeiste } from "./schrittleiste";

function Zeile({
  vorgang,
  onOeffnen,
  onDemo,
}: {
  vorgang: VorgangsZeile;
  onOeffnen: () => void;
  onDemo: (text: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={
        vorgang.verlinkt
          ? onOeffnen
          : () => onDemo(`Im Entwurf ist nur ${VORGANG_NUMMER} klickbar.`)
      }
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
          <small className="text-xs text-ink-400">{vorgang.frist ?? `seit ${vorgang.seit}`}</small>
        )}
      </span>
    </button>
  );
}

/**
 * Übersicht der Spartenleitung: alle Vorgänge auf einen Blick, mit der einzigen
 * Frage, die hier zählt – wo hängt es und wer ist am Zug.
 */
export function SpartenAnsicht({
  stand,
  onOeffnen,
  onDemo,
}: {
  stand: StufeNr;
  onOeffnen: () => void;
  onDemo: (text: string) => void;
}) {
  const liste = vorgaenge(stand);
  const laufen = liste.filter((v) => v.stufe < LETZTE_STUFE).length;
  const fuerDich = liste.filter((v) => v.du).length;
  const haengen = liste.filter((v) => v.warnung).length;

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
        {liste.map((v) => (
          <Zeile key={v.nummer} vorgang={v} onOeffnen={onOeffnen} onDemo={onDemo} />
        ))}
      </div>

      <p className="text-xs text-ink-400">
        Der Stand von AUS-2026-014 folgt dem Regler in den Ansichten Trainer und Spieler.
      </p>
    </>
  );
}
