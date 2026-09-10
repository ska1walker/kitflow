import { LETZTE_STUFE, STUFEN, VORGANG_STAND } from "@/lib/beispieldaten";
import type { StufeNr } from "@/lib/typen";

/** Nur die Stufen der Leiste. Stufe 9 (Abgebrochen) liegt daneben. */
const LEISTE = STUFEN.filter((s) => s.nr <= LETZTE_STUFE);

export type SegmentStatus = "erledigt" | "aktuell" | "offen";

/**
 * Status eines Schritts relativ zum aktuellen Stand. Der letzte Schritt ist nie
 * „aktuell“: ist er erreicht, ist der Vorgang abgeschlossen.
 */
export function segmentStatus(nr: StufeNr, stand: StufeNr): SegmentStatus {
  if (nr < stand) return "erledigt";
  if (nr > stand) return "offen";
  return stand < LETZTE_STUFE ? "aktuell" : "erledigt";
}

const BALKEN: Record<SegmentStatus, string> = {
  erledigt: "bg-pitch-600",
  aktuell: "kf-lauf bg-pitch-200",
  offen: "bg-ink-200",
};

const BESCHRIFTUNG: Record<SegmentStatus, string> = {
  erledigt: "text-ink-600",
  aktuell: "font-semibold text-ink-900",
  offen: "text-ink-400",
};

/** Kompakte Leiste fuer die Uebersicht der Spartenleitung, ohne Text. */
export function MiniLeiste({ stand }: { stand: StufeNr }) {
  const abgebrochen = stand > LETZTE_STUFE;
  return (
    <span className="mt-1.5 grid grid-cols-8 gap-[3px]" aria-hidden="true">
      {LEISTE.map((s) => {
        if (abgebrochen) return <span key={s.nr} className="h-[5px] rounded-full bg-ink-200" />;
        const status = segmentStatus(s.nr, stand);
        return (
          <span
            key={s.nr}
            className={`h-[5px] rounded-full ${
              status === "erledigt"
                ? "bg-pitch-600"
                : status === "aktuell"
                  ? "bg-pitch-300"
                  : "bg-ink-200"
            }`}
          />
        );
      })}
    </span>
  );
}

/** Die volle Schrittleiste im Statuskopf: acht Segmente mit Beschriftung. */
export function Schrittleiste({ stand }: { stand: StufeNr }) {
  const abgebrochen = stand > LETZTE_STUFE;
  const info = abgebrochen
    ? "Abgebrochen"
    : stand < LETZTE_STUFE
      ? `Schritt ${stand} von ${LETZTE_STUFE}`
      : `Alle ${LETZTE_STUFE} Schritte erledigt`;

  return (
    <div className="mt-6" aria-label={`Fortschritt: ${info}`}>
      <div className="grid grid-cols-8 gap-1">
        {LEISTE.map((s) => (
          <div
            key={s.nr}
            title={s.titel}
            className={`relative h-2 overflow-hidden rounded-full ${
              abgebrochen ? "bg-ink-200" : BALKEN[segmentStatus(s.nr, stand)]
            }`}
          />
        ))}
      </div>

      <div className="mt-2 hidden grid-cols-8 gap-1 sm:grid" aria-hidden="true">
        {LEISTE.map((s) => (
          <span
            key={s.nr}
            className={`text-[11px] leading-tight text-balance ${
              abgebrochen ? "text-ink-400" : BESCHRIFTUNG[segmentStatus(s.nr, stand)]
            }`}
          >
            {s.kurz}
          </span>
        ))}
      </div>

      <div className="mt-2.5 flex justify-between gap-3 text-xs text-ink-500">
        <span className="tnum">{info}</span>
        <span>{VORGANG_STAND}</span>
      </div>
    </div>
  );
}
