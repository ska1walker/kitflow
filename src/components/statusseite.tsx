"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Ansicht, Vorgang } from "@/lib/typen";
import type { MailEmpfaenger } from "@/lib/vorgaenge";
import { VorgangAnsicht } from "./vorgang-ansicht";
import { Kopfzeile } from "./kopfzeile";

/**
 * Die Statusseite eines Vorgangs, in genau einer Rolle.
 *
 * Sie rendert, was ihr gegeben wird – kein Store, kein Umschalter, keine
 * uebersteuerte Stufe. Die Rolle haengt am signierten Link.
 *
 * Bis zum 18.09. konnte sie auch die Spartenuebersicht zeigen; diesen Zweig
 * erreichte nach dem Abriss des Schaufensters niemand mehr. Die Uebersicht hat
 * mit dem Login ihre eigene Seite bekommen (`/sparte`), und die zeigt alle
 * Vorgaenge, nicht einen — sie gehoert nicht in die Seite eines einzelnen.
 */
export function Statusseite({
  vorgang,
  ansicht,
  voranfrage,
  nachtrag,
  verteiler,
}: {
  vorgang: Vorgang;
  /** Wer schaut zu. Aus dem Zweck des Links. */
  ansicht: Ansicht;
  /** Nur am Trainer-Link gesetzt (docs/formulare.md, F1b). */
  voranfrage?: { ergaenzen: string; token: string };
  /** Nur am Trainer-Link und nur auf Stufe 1 (docs/formulare.md). */
  nachtrag?: { token: string; personen: { id: string; name: string }[] };
  verteiler?: { token: string; frist: string; empfaenger: MailEmpfaenger[] };
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

  return (
    <>
      <Kopfzeile breit={false} />

      <main className="pt-5 pb-14">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4">
          <VorgangAnsicht
            vorgang={vorgang}
            ansicht={ansicht}
            onDemo={zeigeHinweis}
            voranfrage={voranfrage}
            nachtrag={nachtrag}
            verteiler={verteiler}
          />
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
