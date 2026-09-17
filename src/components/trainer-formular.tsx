"use client";

import { useActionState } from "react";
import { abschicken } from "./formular";
import { Badge, Button, Card, SelectFeld } from "./ui";
import { IconCheck } from "./icons";
import { trainerAngabenSpeichern, type Ergebnis } from "@/app/b/[vorgang]/[person]/aktion";
import { INITIALEN_MAX } from "@/lib/typen";
import type { TrainerAbfrage } from "@/lib/vorgaenge";

const LEER: Ergebnis = { stand: "leer" };

/**
 * F2 als Trainer (docs/formulare.md).
 *
 * Größen sind hier optional: meist trägt der Trainer nur eine Nummer nach oder
 * nimmt jemanden heraus. Rückennummer, „bekommt diesmal nichts“ und „spielt
 * Torwart“ gibt es nur hier, nie im Formular für Spieler und Eltern.
 */
export function TrainerFormular({
  abfrage,
  token,
  zurueck,
}: {
  abfrage: TrainerAbfrage;
  token: string;
  zurueck: string;
}) {
  const [ergebnis, absenden, laeuft] = useActionState(
    trainerAngabenSpeichern.bind(null, abfrage.vorgang, abfrage.person, token),
    LEER,
  );

  if (ergebnis.stand === "gespeichert") {
    return (
      <Card className="p-6">
        <div className="flex items-start gap-3.5">
          <span className="mt-0.5 flex-none text-pitch-700">
            <IconCheck width={22} height={22} />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-ink-900">
              Gespeichert
            </h1>
            <p className="mt-1.5 text-sm text-ink-600">
              Die Angaben zu {abfrage.name} stehen am Vorgang {abfrage.vorgang}.
            </p>
            <a
              href={zurueck}
              className="mt-3 inline-block text-sm font-semibold text-pitch-700 underline"
            >
              Zurück zur Liste
            </a>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <span className="eyebrow text-pitch-600">Vorgang {abfrage.vorgang}</span>
      <h1 className="font-display mt-1.5 text-2xl font-extrabold tracking-tight text-ink-900">
        {abfrage.name}
      </h1>
      <p className="mt-1 text-sm text-ink-600">
        {abfrage.mannschaft} · {abfrage.gegenstand}
      </p>

      <form onSubmit={abschicken(absenden)} className="mt-5 flex flex-col gap-4">
        {abfrage.fragen.map((frage) => (
          <label key={frage.feld} className="flex flex-col gap-1.5">
            <span className="flex items-center gap-2 text-sm font-semibold text-ink-900">
              {frage.label}
              {frage.veraltet && <Badge tone="amber">bitte neu prüfen</Badge>}
            </span>
            <SelectFeld name={frage.feld} defaultValue={frage.wert}>
              <option value="">unverändert lassen</option>
              {frage.werte.map((wert) => (
                <option key={wert} value={wert}>
                  {wert}
                </option>
              ))}
            </SelectFeld>
          </label>
        ))}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-ink-900">
            Rückennummer <span className="font-normal text-ink-500">— 1 bis 99</span>
          </span>
          <input
            type="number"
            name="nummer"
            min={1}
            max={99}
            defaultValue={abfrage.nummer}
            className="tnum w-28 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 focus:border-pitch-400 focus:ring-2 focus:ring-pitch-100 focus:outline-none"
          />
          {abfrage.belegteNummern.length > 0 && (
            <span className="text-xs text-ink-500">
              Schon vergeben:{" "}
              {abfrage.belegteNummern
                .map((b) => b.nummer)
                .sort((a, b) => Number(a) - Number(b))
                .join(", ")}
            </span>
          )}
        </label>

        {abfrage.initialenNoetig && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink-900">
              Initialen{" "}
              <span className="font-normal text-ink-500">
                — höchstens {INITIALEN_MAX} Zeichen, leer lassen löscht sie
              </span>
            </span>
            <input
              name="initialen"
              defaultValue={abfrage.initialen}
              maxLength={INITIALEN_MAX}
              autoComplete="off"
              className="w-40 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 focus:border-pitch-400 focus:ring-2 focus:ring-pitch-100 focus:outline-none"
            />
          </label>
        )}

        <label className="flex items-start gap-2.5 text-sm text-ink-800">
          <input
            type="checkbox"
            name="torwart"
            value="ja"
            defaultChecked={abfrage.torwart}
            className="mt-0.5 h-4 w-4 flex-none accent-pitch-600"
          />
          Spielt in dieser Runde Torwart und bekommt die Torwartartikel.
        </label>

        <label className="flex items-start gap-2.5 text-sm text-ink-800">
          <input
            type="checkbox"
            name="ausgeschlossen"
            value="ja"
            defaultChecked={abfrage.ausgeschlossen}
            className="mt-0.5 h-4 w-4 flex-none accent-pitch-600"
          />
          Bekommt diesmal nichts.
        </label>

        {ergebnis.stand === "fehler" && (
          <p className="rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-800">{ergebnis.text}</p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={laeuft}>
            {laeuft ? "Wird gespeichert…" : "Speichern"}
          </Button>
          <a href={zurueck} className="text-sm text-ink-600 underline">
            Abbrechen
          </a>
        </div>
      </form>
    </Card>
  );
}
