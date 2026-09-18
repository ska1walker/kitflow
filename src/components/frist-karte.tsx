"use client";

import { useActionState } from "react";
import { Button, Card, SelectFeld } from "./ui";
import { abschicken } from "./formular";
import { IconCheck, IconStop } from "./icons";
import { fristSetzen, type FristStand } from "@/app/sparte/aktion";
import type { VorgangsZeile } from "@/lib/typen";

/**
 * Die Größenfrist eines laufenden Vorgangs verlängern.
 *
 * Bis hierher stand sie nach dem Anlegen fest: F1 setzt sie, F1b bei einer
 * Voranfrage — danach gab es keine Stelle mehr dafür. Aufgefallen ist das an
 * einem echten Vorgang, dessen Frist so knapp lag, dass der Erinnerungslauf nie
 * zum Zug gekommen wäre.
 *
 * Angeboten wird nur, wo Größen laufen. Auf jeder anderen Stufe wäre die Frist
 * Geschichte, und sie zu ändern sähe aus, als ließe sich noch etwas eintragen.
 */
export function FristKarte({ zeilen }: { zeilen: VorgangsZeile[] }) {
  const [stand, absenden, laeuft] = useActionState<FristStand, FormData>(fristSetzen, {
    stand: "leer",
  });

  const offen = zeilen.filter((z) => z.stufe === 1);
  if (offen.length === 0) return null;

  return (
    <Card className="p-5">
      <h2 className="font-display text-base font-bold text-ink-900">Größenfrist ändern</h2>
      <p className="mt-1 text-sm text-ink-600">
        Nur für Vorgänge, bei denen gerade Größen gesammelt werden. Eine längere Frist heißt auch:
        der Erinnerungslauf hat wieder Zeit, sich zu melden — er braucht drei Tage Abstand zur
        letzten Mail.
      </p>

      <form onSubmit={abschicken(absenden)} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <div className="sm:flex-1">
          <label className="block text-xs font-semibold text-ink-700" htmlFor="frist-vorgang">
            Vorgang
          </label>
          <SelectFeld id="frist-vorgang" name="vorgang" className="mt-1" defaultValue="" required>
            <option value="" disabled>
              Bitte wählen
            </option>
            {offen.map((z) => (
              <option key={z.nummer} value={z.nummer}>
                {z.nummer} · {z.mannschaft}
                {z.frist ? ` · ${z.frist}` : ""}
              </option>
            ))}
          </SelectFeld>
        </div>

        <div className="sm:flex-1">
          <label className="block text-xs font-semibold text-ink-700" htmlFor="frist-datum">
            Neue Frist
          </label>
          <input
            id="frist-datum"
            name="frist"
            type="date"
            required
            className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 focus:border-pitch-400 focus:ring-2 focus:ring-pitch-100 focus:outline-none"
          />
        </div>

        <div className="flex items-end">
          <Button type="submit" variante="sekundaer" disabled={laeuft}>
            {laeuft ? "Einen Moment…" : "Setzen"}
          </Button>
        </div>
      </form>

      {stand.stand === "fertig" && (
        <p className="mt-3 flex items-start gap-2 text-sm text-ink-700">
          <span className="mt-0.5 flex-none text-signal-600">
            <IconCheck width={16} height={16} />
          </span>
          <span>
            {stand.nummer} läuft jetzt bis zum {stand.frist}.
            {stand.vergangen
              ? " Dieses Datum liegt allerdings in der Vergangenheit — es geht keine Erinnerung mehr raus."
              : " Lade die Seite neu, um die Liste frisch zu sehen."}
          </span>
        </p>
      )}
      {stand.stand === "fehler" && (
        <p className="mt-3 flex items-start gap-2 text-sm text-ink-700">
          <span className="mt-0.5 flex-none text-ink-500">
            <IconStop width={16} height={16} />
          </span>
          {stand.text}
        </p>
      )}
    </Card>
  );
}
