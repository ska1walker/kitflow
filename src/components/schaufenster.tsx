"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { Statusseite } from "./statusseite";
import { DemoBadge, SelectFeld } from "./ui";
import { BEISPIEL_VORGANG, beispielZeilen } from "@/lib/beispieldaten";
import { abonnieren, aktuellerEntwurf, setzeEntwurf, standardEntwurf } from "@/lib/entwurf";
import { STUFEN } from "@/lib/stufen";
import type { Ansicht, StufeNr, Vorgang } from "@/lib/typen";

const ANSICHTEN: { wert: Ansicht; label: string }[] = [
  { wert: "trainer", label: "Trainer" },
  { wert: "spieler", label: "Spieler" },
  { wert: "sparte", label: "Spartenleitung" },
];

/**
 * Rolle wechseln und den Stand durchspielen – nur im Schaufenster.
 *
 * Diese Leiste gab es früher in `statusseite.tsx` und lief damit auch auf
 * echten Vorgängen mit, wo die Rolle längst am signierten Link hängt. Jetzt
 * erreicht sie nur noch `/`.
 */
function Leiste({
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
      aria-label="Ansicht und Stand"
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
        HubSpot ist hier bewusst nicht angebunden. Namen und Termine sind erfunden, die Artikel
        und die beiden Händler stammen aus einer echten Anfrage.
      </p>
    </section>
  );
}

/**
 * Das Schaufenster unter `/`: die Statusseite mit Beispieldaten, zum
 * Durchklicken der Rollen und Stufen.
 *
 * Hier – und nur hier – lebt der Entwurfs-Store. Echte Vorgänge bekommen ihre
 * Rolle aus dem signierten Link und rendern `Statusseite` direkt.
 */
export function Schaufenster() {
  const gespeichert = useSyncExternalStore(abonnieren, aktuellerEntwurf, standardEntwurf);
  const { ansicht, stand } = gespeichert;

  const setAnsicht = useCallback(
    (neu: Ansicht) => setzeEntwurf({ ansicht: neu, stand: aktuellerEntwurf().stand }),
    [],
  );
  const setStand = useCallback(
    (neu: StufeNr) => setzeEntwurf({ ansicht: aktuellerEntwurf().ansicht, stand: neu }),
    [],
  );

  // Detail und Übersicht sollen denselben Stand zeigen, sonst widerspricht sich
  // das Schaufenster beim Durchklicken.
  const zeilen = useMemo(() => beispielZeilen(stand), [stand]);
  const vorgang: Vorgang = useMemo(() => ({ ...BEISPIEL_VORGANG, stufe: stand }), [stand]);

  // Aus der Uebersicht in die Detailansicht: im Schaufenster heisst das Rolle
  // wechseln, weil es nur den einen Beispielvorgang gibt.
  const oeffneVorgang = useCallback(() => {
    setAnsicht("trainer");
    window.scrollTo({ top: 0 });
  }, [setAnsicht]);

  return (
    <Statusseite
      vorgang={vorgang}
      zeilen={zeilen}
      ansicht={ansicht}
      onOeffnen={oeffneVorgang}
      leiste={<Leiste ansicht={ansicht} stand={stand} onAnsicht={setAnsicht} onStand={setStand} />}
    />
  );
}
