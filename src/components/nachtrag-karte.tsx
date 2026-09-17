"use client";

import { useActionState, useState } from "react";
import { abschicken } from "./formular";
import { Badge, Button, Card, SelectFeld } from "./ui";
import { IconCheck, IconPlus } from "./icons";
import { personNachtragen, type NachtragErgebnis } from "@/app/v/[vorgang]/aktion";

const LEER: NachtragErgebnis = { stand: "leer" };

/**
 * „Person nachtragen“ auf der Trainer-Statusseite.
 *
 * Verknüpft wird in F1 genau einmal, beim Absenden. Wer danach zur Mannschaft
 * kommt, fehlte am Vorgang – und der Trainer musste ihn in HubSpot von Hand
 * anhängen. Diese Karte holt das nach, solange die Größen laufen.
 *
 * Zur Auswahl steht nur, wer ohnehin zur Mannschaft des Vorgangs gehört und
 * noch nicht dranhängt. Nach dem Nachtragen steht der Größen-Link hier: M2
 * gibt es nicht, der Trainer verteilt ihn selbst.
 */
export function NachtragKarte({
  vorgang,
  token,
  personen,
}: {
  vorgang: string;
  token: string;
  personen: { id: string; name: string }[];
}) {
  const [ergebnis, absenden, laeuft] = useActionState(
    personNachtragen.bind(null, vorgang, token),
    LEER,
  );
  const [offen, setOffen] = useState(false);

  // Nach dem Nachtragen ist die Auswahl von gestern: die Person steht noch
  // drin, hängt aber schon am Vorgang. Erst ein Neuladen holt den neuen Stand.
  //
  // `window` ist hier sicher: dieser Zweig entsteht erst als Antwort auf einen
  // Klick, also lange nach der Hydrierung. Auf dem Server steht „leer“.
  if (ergebnis.stand === "fertig") {
    return (
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex-none text-pitch-700">
            <IconCheck width={20} height={20} />
          </span>
          <div className="min-w-0">
            <b className="block text-sm text-ink-900">{ergebnis.name} ist dabei</b>
            <p className="mt-0.5 text-sm text-ink-600">
              Das ist der persönliche Größen-Link. Schick ihn weiter – er gilt nur für diese
              Person und diesen Vorgang.
            </p>
            {ergebnis.pfad && (
              <p className="mt-2 rounded-xl bg-ink-50 px-3.5 py-3 font-mono text-[13px] break-all text-ink-700">
                {new URL(ergebnis.pfad, window.location.origin).toString()}
              </p>
            )}
            <p className="mt-2 text-sm text-ink-500">
              Lad die Seite neu, um den neuen Stand der Liste zu sehen.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <b className="block text-sm text-ink-900">Fehlt jemand?</b>
          <span className="text-sm text-ink-600">
            {personen.length === 0
              ? "Alle, die zu dieser Mannschaft gehören, hängen schon am Vorgang."
              : "Wer erst nach der Meldung zur Mannschaft gekommen ist, kann hier nachrücken."}
          </span>
        </div>
        <Badge tone="outline">{personen.length} offen</Badge>
      </div>

      {personen.length > 0 && !offen && (
        <div className="mt-4">
          <Button type="button" variante="sekundaer" onClick={() => setOffen(true)}>
            <IconPlus width={16} height={16} />
            Person nachtragen
          </Button>
        </div>
      )}

      {personen.length > 0 && offen && (
        <form onSubmit={abschicken(absenden)} className="mt-4 rounded-xl bg-ink-50 p-4">
          <label className="block text-sm font-semibold text-ink-900" htmlFor="nachtrag-person">
            Wen sollen wir nach den Größen fragen?
          </label>
          <SelectFeld id="nachtrag-person" name="person" required className="mt-1.5 max-w-sm">
            <option value="">bitte wählen</option>
            {personen.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectFeld>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={laeuft}>
              {laeuft ? "Wird eingetragen…" : "Nachtragen"}
            </Button>
            <button
              type="button"
              onClick={() => setOffen(false)}
              className="cursor-pointer text-sm text-ink-500 underline"
            >
              Doch nicht
            </button>
          </div>

          {ergebnis.stand === "fehler" && (
            <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-800">
              {ergebnis.text}
            </p>
          )}
        </form>
      )}

      <p className="mt-4 text-sm text-ink-500">
        Steht jemand nicht in der Liste, ist er in HubSpot noch keiner Mannschaft zugeordnet –
        oder die Zuordnung ist erst ein paar Sekunden alt. HubSpot braucht dafür bis zu einer
        Minute. kitflow legt keine Personen an.
      </p>
    </Card>
  );
}
