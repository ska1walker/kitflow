"use client";

import { useActionState } from "react";
import { abschicken } from "./formular";
import { GroessenFeld } from "./groessen-feld";
import { Button, Card } from "./ui";
import { IconCheck } from "./icons";
import { groessenSpeichern, type Ergebnis } from "@/app/g/[vorgang]/[person]/aktion";
import { INITIALEN_MAX } from "@/lib/typen";
import type { GroessenAbfrage } from "@/lib/vorgaenge";

const LEER: Ergebnis = { stand: "leer" };

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
              {abfrage.nurGroessen
                ? "Wenn alle eingetragen haben, prüft deine Trainerin oder dein Trainer die Liste. Damit ist es erledigt – bestellt wird nichts."
                : "Wenn alle eingetragen haben, prüft deine Trainerin oder dein Trainer die Liste. Danach geht die Anfrage an die Händler."}
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
        {abfrage.nurGroessen ? (
          <>
            für {abfrage.mannschaft ? <b>{abfrage.mannschaft}</b> : "deine Mannschaft"} sammeln wir
            gerade die aktuellen Größen ein. Bestellt wird damit nichts.
          </>
        ) : (
          <>
            für {abfrage.mannschaft ? <b>{abfrage.mannschaft}</b> : "deine Mannschaft"} wird neue
            Ausstattung angefragt: {abfrage.gegenstand}.
          </>
        )}
      </p>

      <p className="mt-4 text-sm text-ink-700">
        Bitte trag die Größen ein, die jetzt passen. Steht unter einem Feld schon eine Größe, haben
        wir sie von der letzten Abfrage — mit „übernehmen“ ist sie eingetragen, sonst wähl einfach
        eine andere.
        {abfrage.jugend ? " Prüf das kurz, Kinder wachsen schnell." : ""}
      </p>

      {/* Der Warnhinweis gilt der Bestellung. Wo nichts bestellt wird, wäre er
          eine Drohung ohne Anlass. */}
      {!abfrage.nurGroessen && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-ink-700">
          Beflockte Kleidung kann der Händler nicht umtauschen. Im Zweifel lieber eine Nummer
          größer oder vorher bei einem Teamkollegen anprobieren.
        </p>
      )}

      <form onSubmit={abschicken(absenden)} className="mt-5 flex flex-col gap-4">
        {abfrage.fragen.map((frage) => (
          <GroessenFeld
            key={frage.feld}
            frage={frage}
            bestaetigtAm={abfrage.bestaetigtAm}
            pflicht
          />
        ))}

        {abfrage.initialenNoetig && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink-900">Initialen</span>
            <span className="text-xs text-ink-500">
              Die kommen auf die Kleidung: höchstens {INITIALEN_MAX} Buchstaben oder Ziffern,
              keine Punkte – also „KB“, nicht „K.B.“.
            </span>
            <input
              name="initialen"
              defaultValue={abfrage.initialen}
              maxLength={INITIALEN_MAX}
              required
              autoComplete="off"
              className="w-40 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 focus:border-pitch-400 focus:ring-2 focus:ring-pitch-100 focus:outline-none"
            />
          </label>
        )}

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
