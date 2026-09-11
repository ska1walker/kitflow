"use client";

import { useActionState } from "react";
import { Badge, Button, Card, SelectFeld } from "./ui";
import { IconCheck } from "./icons";
import { groessenSpeichern, type Ergebnis } from "@/app/g/[vorgang]/[person]/aktion";
import type { GroessenAbfrage } from "@/lib/vorgaenge";

const LEER: Ergebnis = { stand: "leer" };

/**
 * F2 · Größen (docs/formulare.md).
 *
 * Die Texte sprechen Spieler und Eltern per du an. Der Hinweis auf die
 * Beflockung steht bewusst über den Feldern: beflockte Kleidung nimmt kein
 * Händler zurück, das soll man vor der Auswahl lesen, nicht danach.
 */
export function GroessenFormular({
  abfrage,
  token,
}: {
  abfrage: GroessenAbfrage;
  token: string;
}) {
  const [ergebnis, absenden, laeuft] = useActionState(
    groessenSpeichern.bind(null, abfrage.vorgang, abfrage.person, token),
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
              Danke, deine Größen sind da
            </h1>
            <p className="mt-1.5 text-sm text-ink-600">
              Du kannst diesen Link {abfrage.frist ? `bis zum ${abfrage.frist} ` : ""}noch einmal
              öffnen und etwas ändern, es zählt die letzte Eingabe.
            </p>
            <p className="mt-3 text-sm text-ink-600">
              Wenn alle eingetragen haben, prüft deine Trainerin oder dein Trainer die Liste. Danach
              geht die Anfrage an die Händler.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <span className="eyebrow text-pitch-600">Vorgang {abfrage.vorgang}</span>
      <h1 className="font-display mt-1.5 text-2xl font-extrabold tracking-tight text-ink-900">
        {abfrage.anrede ? `Hallo ${abfrage.anrede},` : "Hallo,"}
      </h1>
      <p className="mt-1 text-sm text-ink-600">
        für {abfrage.mannschaft ? <b>{abfrage.mannschaft}</b> : "deine Mannschaft"} wird neue
        Ausstattung angefragt: {abfrage.gegenstand}.
      </p>

      <p className="mt-4 text-sm text-ink-700">
        Bitte trag die Größen ein, die jetzt passen. Wenn schon eine Größe vorausgewählt ist, stammt
        sie aus der letzten Abfrage. Prüf sie kurz, Kinder wachsen schnell.
      </p>

      <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-ink-700">
        Beflockte Kleidung kann der Händler nicht umtauschen. Im Zweifel lieber eine Nummer größer
        oder vorher bei einem Teamkollegen anprobieren.
      </p>

      <form action={absenden} className="mt-5 flex flex-col gap-4">
        {abfrage.fragen.map((frage) => (
          <label key={frage.feld} className="flex flex-col gap-1.5">
            <span className="flex items-center gap-2 text-sm font-semibold text-ink-900">
              {frage.label}
              {frage.veraltet && <Badge tone="amber">bitte neu prüfen</Badge>}
            </span>
            <SelectFeld name={frage.feld} defaultValue={frage.wert} required>
              <option value="">bitte wählen</option>
              {frage.werte.map((wert) => (
                <option key={wert} value={wert}>
                  {wert}
                </option>
              ))}
            </SelectFeld>
          </label>
        ))}

        {ergebnis.stand === "fehler" && (
          <p className="rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-800">{ergebnis.text}</p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={laeuft}>
            {laeuft ? "Wird gespeichert…" : "Größen speichern"}
          </Button>
          {abfrage.frist && (
            <span className="text-xs text-ink-500">Frist: {abfrage.frist}</span>
          )}
        </div>
      </form>
    </Card>
  );
}
