"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { IconTrikot } from "./icons";
import { VEREIN } from "@/lib/beispieldaten";
import type { Ansicht, Vorgang, VorgangsZeile } from "@/lib/typen";
import { VorgangAnsicht } from "./vorgang-ansicht";
import { SpartenAnsicht } from "./sparten-ansicht";

/** Kopfzeile: kitflow links, Verein rechts. Wandert mit der Breite der Ansicht. */
function Kopfzeile({ breit }: { breit: boolean }) {
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
        <span className="flex items-center gap-2 text-[13px] text-ink-600">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-pitch-100 font-mono text-[10px] font-semibold text-pitch-700"
          >
            {VEREIN.kuerzel}
          </span>
          <span className="hidden sm:inline">{VEREIN.name}</span>
        </span>
      </div>
    </header>
  );
}

/**
 * Die Statusseite eines Vorgangs, in genau einer Rolle.
 *
 * Sie rendert, was ihr gegeben wird – kein Store, kein Umschalter, keine
 * uebersteuerte Stufe. Die Rolle haengt bei echten Vorgaengen am signierten
 * Link; das Schaufenster unter `/` setzt sie selbst und reicht seinen
 * Umschalter ueber `leiste` herein.
 */
export function Statusseite({
  vorgang,
  zeilen,
  ansicht,
  voranfrage,
  nachtrag,
  leiste,
  onOeffnen,
}: {
  vorgang: Vorgang;
  zeilen: VorgangsZeile[];
  /** Wer schaut zu. Bei echten Vorgaengen aus dem Zweck des Links. */
  ansicht: Ansicht;
  /** Nur am Trainer-Link gesetzt (docs/formulare.md, F1b). */
  voranfrage?: { ergaenzen: string; token: string };
  /** Nur am Trainer-Link und nur auf Stufe 1 (docs/formulare.md). */
  nachtrag?: { token: string; personen: { id: string; name: string }[] };
  /** Steuerleiste des Schaufensters. Bei echten Vorgaengen leer. */
  leiste?: ReactNode;
  /**
   * Klick auf eine Zeile der Spartenuebersicht. Die Ansicht „sparte“ entsteht
   * heute nur ueber den Umschalter des Schaufensters, also kommt auch das
   * Oeffnen von dort. Fehlt der Aufrufer, passiert nichts.
   */
  onOeffnen?: () => void;
}) {
  const [hinweis, setHinweis] = useState("");
  const hinweisTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (hinweisTimer.current) clearTimeout(hinweisTimer.current);
    },
    [],
  );

  const zeigeHinweis = useCallback((text: string) => {
    setHinweis(text);
    if (hinweisTimer.current) clearTimeout(hinweisTimer.current);
    hinweisTimer.current = setTimeout(() => setHinweis(""), 2600);
  }, []);

  const breit = ansicht === "sparte";

  return (
    <>
      <Kopfzeile breit={breit} />

      <main className="pt-5 pb-14">
        <div className={`mx-auto flex flex-col gap-4 px-4 ${breit ? "max-w-6xl" : "max-w-3xl"}`}>
          {leiste}

          {breit ? (
            <SpartenAnsicht zeilen={zeilen} onOeffnen={onOeffnen ?? (() => {})} onDemo={zeigeHinweis} />
          ) : (
            <VorgangAnsicht
              vorgang={vorgang}
              ansicht={ansicht}
              onDemo={zeigeHinweis}
              voranfrage={voranfrage}
              nachtrag={nachtrag}
            />
          )}
        </div>
      </main>

      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed bottom-5 left-1/2 z-50 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-xl bg-ink-950 px-4 py-2.5 text-[13px] text-white shadow-pop transition-opacity duration-200 ${
          hinweis ? "opacity-100" : "opacity-0"
        }`}
      >
        {hinweis}
      </div>
    </>
  );
}
