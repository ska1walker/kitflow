"use client";

import { useState } from "react";
import { Badge, SelectFeld } from "./ui";
import type { GroessenFrage } from "@/lib/vorgaenge";

/**
 * Ein Größenfeld, das zeigt, was schon am Kontakt steht.
 *
 * Ist die hinterlegte Größe zu alt, wird sie **nicht vorbelegt** – sonst wäre
 * sie mit einem Klick ungeprüft bestätigt, und bei Kindern bestellt man so eine
 * Größe von vor zwei Jahren. Gezeigt wird sie trotzdem, mit einem Knopf
 * daneben: Übernehmen ist dann eine bewusste Entscheidung und kein Versehen.
 * Wer etwas anderes braucht, wählt es einfach aus.
 *
 * Vorher stand der alte Wert nirgends. Das Abzeichen sagte „bitte neu prüfen“,
 * ohne dass es etwas zu prüfen gab.
 *
 * Eigener Zustand, weil „übernehmen“ das Feld füllen können muss.
 */
export function GroessenFeld({
  frage,
  bestaetigtAm,
  leerText = "bitte wählen",
  pflicht = false,
}: {
  frage: GroessenFrage;
  bestaetigtAm?: string;
  /** Beschriftung der leeren Auswahl – beim Trainer heißt leer „nicht anfassen“. */
  leerText?: string;
  pflicht?: boolean;
}) {
  const [wert, setWert] = useState(frage.wert);
  const uebernehmbar = frage.bisher !== "" && wert !== frage.bisher;

  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 text-sm font-semibold text-ink-900">
        {frage.label}
        {frage.veraltet && <Badge tone="amber">bitte neu prüfen</Badge>}
      </span>
      <SelectFeld
        name={frage.feld}
        value={wert}
        onChange={(e) => setWert(e.target.value)}
        required={pflicht}
      >
        <option value="">{leerText}</option>
        {frage.werte.map((w) => (
          <option key={w} value={w}>
            {w}
          </option>
        ))}
      </SelectFeld>
      {frage.bisher !== "" && (
        <span className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
          <span>
            Bisher eingetragen: <b className="text-ink-700">{frage.bisher}</b>
            {bestaetigtAm ? `, bestätigt am ${bestaetigtAm}` : ""}
          </span>
          {uebernehmbar && (
            <button
              type="button"
              onClick={() => setWert(frage.bisher)}
              className="cursor-pointer font-semibold text-pitch-700 underline"
            >
              übernehmen
            </button>
          )}
        </span>
      )}
    </label>
  );
}
