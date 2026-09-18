"use client";

import { useActionState } from "react";
import { Button, Card, SelectFeld } from "./ui";
import { abschicken } from "./formular";
import { IconCheck, IconStop } from "./icons";
import { STUFEN } from "@/lib/stufen";
import { stufeSetzen, type StufenStand } from "@/app/sparte/aktion";
import type { VorgangsZeile } from "@/lib/typen";

/**
 * Stufe von Hand setzen — der Ausgleich für den einseitigen Spiegel.
 *
 * Der Deal in HubSpot wird seit dem Umzug nur noch beschrieben, nie gelesen.
 * Wer dort eine Stufe verschiebt, ändert bei kitflow nichts mehr. Hier ist die
 * Stelle, an der es geht.
 *
 * Bewusst unter der Liste und nicht in jeder Zeile: das ist ein Werkzeug für
 * den Ausnahmefall, kein täglicher Handgriff. Der normale Weg bleibt, dass die
 * Formulare die Stufe weiterschieben.
 */
export function StufenKarte({ zeilen }: { zeilen: VorgangsZeile[] }) {
  const [stand, absenden, laeuft] = useActionState<StufenStand, FormData>(stufeSetzen, {
    stand: "leer",
  });

  if (zeilen.length === 0) return null;

  return (
    <Card className="p-5">
      <h2 className="font-display text-base font-bold text-ink-900">Stufe von Hand setzen</h2>
      <p className="mt-1 text-sm text-ink-600">
        Normalerweise schieben die Formulare die Stufe weiter. Hier greifst du ein, wenn etwas
        außerhalb von kitflow passiert ist. Der Verlauf hält fest, wer es war.
      </p>

      <form onSubmit={abschicken(absenden)} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <div className="sm:flex-1">
          <label className="block text-xs font-semibold text-ink-700" htmlFor="stufe-vorgang">
            Vorgang
          </label>
          <SelectFeld id="stufe-vorgang" name="vorgang" className="mt-1" defaultValue="" required>
            <option value="" disabled>
              Bitte wählen
            </option>
            {zeilen.map((z) => (
              <option key={z.nummer} value={z.nummer}>
                {z.nummer} · {z.mannschaft}
              </option>
            ))}
          </SelectFeld>
        </div>

        <div className="sm:flex-1">
          <label className="block text-xs font-semibold text-ink-700" htmlFor="stufe-ziel">
            Neue Stufe
          </label>
          <SelectFeld id="stufe-ziel" name="stufe" className="mt-1" defaultValue="" required>
            <option value="" disabled>
              Bitte wählen
            </option>
            {STUFEN.map((s) => (
              <option key={s.nr} value={s.nr}>
                {s.nr} · {s.intern}
              </option>
            ))}
          </SelectFeld>
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
          {stand.nummer} steht jetzt auf „{stand.titel}“. Lade die Seite neu, um die Liste frisch zu
          sehen.
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
