import type { ReactNode } from "react";
import { IconTrikot } from "./icons";
import { VEREIN } from "@/lib/beispieldaten";

/**
 * Kopfzeile: kitflow links, Verein rechts.
 *
 * Stand bis zum 18.09. in `statusseite.tsx`. Sie liegt hier, weil `/sparte`
 * dieselbe Zeile braucht, aber keine Statusseite ist — und weil `/sparte` rechts
 * noch die angemeldete Adresse und das Abmelden unterbringt (`rechts`).
 */
export function Kopfzeile({ breit, rechts }: { breit: boolean; rechts?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 h-16 border-b border-ink-200 bg-paper/90 backdrop-blur-md">
      <div
        className={`mx-auto flex h-full items-center justify-between gap-4 px-4 ${
          breit ? "max-w-6xl" : "max-w-3xl"
        }`}
      >
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-ink-950 text-signal-400">
            <IconTrikot width={18} height={18} />
          </span>
          <b className="text-lg font-extrabold tracking-[-0.03em]">kitflow</b>
        </span>
        {rechts ?? (
          <span className="flex items-center gap-2 text-[13px] text-ink-600">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-pitch-100 font-mono text-[10px] font-semibold text-pitch-700"
            >
              {VEREIN.kuerzel}
            </span>
            <span className="hidden sm:inline">{VEREIN.name}</span>
          </span>
        )}
      </div>
    </header>
  );
}
