"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DemoBadge, SelectFeld } from "./ui";
import { IconTrikot } from "./icons";
import { STUFEN, VEREIN } from "@/lib/beispieldaten";
import { abonnieren, aktuellerEntwurf, setzeEntwurf, standardEntwurf } from "@/lib/entwurf";
import type { Ansicht, StufeNr } from "@/lib/typen";
import { VorgangAnsicht } from "./vorgang-ansicht";
import { SpartenAnsicht } from "./sparten-ansicht";

const ANSICHTEN: { wert: Ansicht; label: string }[] = [
  { wert: "trainer", label: "Trainer" },
  { wert: "spieler", label: "Spieler" },
  { wert: "sparte", label: "Spartenleitung" },
];

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
 * Nur im Entwurf: Rolle wechseln und den Stand durchspielen. Faellt weg, sobald
 * die Rolle am signierten Link haengt und die Daten aus HubSpot kommen.
 */
function EntwurfsLeiste({
  ansicht,
  stand,
  onAnsicht,
  onStand,
}: {
  ansicht: Ansicht;
  stand: StufeNr;
  onAnsicht: (a: Ansicht) => void;
  onStand: (s: StufeNr) => void;
}) {
  return (
    <section
      aria-label="Entwurfssteuerung"
      className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-2xl border border-dashed border-ink-300 bg-white px-3.5 py-3"
    >
      <DemoBadge />

      <div
        role="group"
        aria-label="Ansicht"
        className="inline-flex rounded-full border border-ink-200 bg-ink-50 p-[3px]"
      >
        {ANSICHTEN.map((a) => {
          const aktiv = ansicht === a.wert;
          return (
            <button
              key={a.wert}
              type="button"
              aria-pressed={aktiv}
              onClick={() => onAnsicht(a.wert)}
              className={`cursor-pointer rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                aktiv ? "bg-ink-950 text-white" : "text-ink-600 hover:bg-white hover:text-ink-900"
              }`}
            >
              {a.label}
            </button>
          );
        })}
      </div>

      {ansicht !== "sparte" && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-ink-500">Stand</span>
          <SelectFeld
            value={String(stand)}
            aria-label="Stand des Vorgangs"
            className="w-64"
            onChange={(e) => onStand(Number(e.target.value) as StufeNr)}
          >
            {STUFEN.map((s) => (
              <option key={s.nr} value={s.nr}>
                {s.nr} · {s.titel}
              </option>
            ))}
          </SelectFeld>
        </div>
      )}

      <p className="basis-full text-xs text-ink-500">
        Diese Leiste gibt es nur im Entwurf. Namen und Termine sind erfunden. Die Artikel und die
        beiden Händler stammen aus einer echten Anfrage.
      </p>
    </section>
  );
}

export function Statusseite() {
  // Rolle und Stand liegen im Entwurfs-Store, damit ein Reload sie behaelt.
  const { ansicht, stand } = useSyncExternalStore(
    abonnieren,
    aktuellerEntwurf,
    standardEntwurf,
  );
  const [hinweis, setHinweis] = useState("");
  const hinweisTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setAnsicht = useCallback(
    (neu: Ansicht) => setzeEntwurf({ ansicht: neu, stand: aktuellerEntwurf().stand }),
    [],
  );
  const setStand = useCallback(
    (neu: StufeNr) => setzeEntwurf({ ansicht: aktuellerEntwurf().ansicht, stand: neu }),
    [],
  );

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

  const oeffneVorgang = useCallback(() => {
    setAnsicht("trainer");
    window.scrollTo({ top: 0 });
  }, [setAnsicht]);

  const breit = ansicht === "sparte";

  return (
    <>
      <Kopfzeile breit={breit} />

      <main className="pt-5 pb-14">
        <div className={`mx-auto flex flex-col gap-4 px-4 ${breit ? "max-w-6xl" : "max-w-3xl"}`}>
          <EntwurfsLeiste
            ansicht={ansicht}
            stand={stand}
            onAnsicht={setAnsicht}
            onStand={setStand}
          />

          {breit ? (
            <SpartenAnsicht stand={stand} onOeffnen={oeffneVorgang} onDemo={zeigeHinweis} />
          ) : (
            <VorgangAnsicht stand={stand} ansicht={ansicht} onDemo={zeigeHinweis} />
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
