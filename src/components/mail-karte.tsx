"use client";

import { useActionState, useState } from "react";
import { abschicken } from "./formular";
import { Badge, Button, Card } from "./ui";
import { IconCheck, IconSend } from "./icons";
import { groessenMailsSenden, type VersandStand } from "@/app/v/[vorgang]/aktion";
import type { MailEmpfaenger } from "@/lib/vorgaenge";

const LEER: VersandStand = { stand: "leer" };

/** „18.09." aus dem Zeitstempel der Datenbank, in deutscher Ortszeit. */
function tag(zeitpunkt: string): string {
  const zeit = new Date(zeitpunkt);
  if (Number.isNaN(zeit.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
  }).format(zeit);
}

/**
 * Die Größen-Mail an die Mannschaft verschicken — und zwar an die, die der
 * Trainer anhakt.
 *
 * Vorausgewählt ist, wer eine Adresse hat und noch keine Mail bekam. Beim
 * zweiten Durchgang schickt ein Klick damit nicht der halben Mannschaft
 * dieselbe Mail ein zweites Mal.
 *
 * Wer keine Adresse hat, steht mit dabei, aber ohne Häkchen: der Trainer muss
 * wissen, wessen Größe er selbst eintragen muss. Die Adressen selbst stehen
 * hier nirgends (CLAUDE.md).
 */
export function MailKarte({
  vorgang,
  token,
  empfaenger,
  frist,
}: {
  vorgang: string;
  token: string;
  empfaenger: MailEmpfaenger[];
  frist: string;
}) {
  const [ergebnis, absenden, laeuft] = useActionState(
    groessenMailsSenden.bind(null, vorgang, token),
    LEER,
  );

  const vorauswahl = new Set(
    empfaenger.filter((e) => e.hatAdresse && !e.zuletzt).map((e) => e.person),
  );
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(vorauswahl);
  const ohneAdresse = empfaenger.filter((e) => !e.hatAdresse);

  function schalte(person: string) {
    setGewaehlt((alt) => {
      const neu = new Set(alt);
      if (neu.has(person)) neu.delete(person);
      else neu.add(person);
      return neu;
    });
  }

  if (ergebnis.stand === "fertig") {
    return (
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex-none text-pitch-700">
            <IconCheck width={20} height={20} />
          </span>
          <div className="min-w-0">
            <b className="block text-sm text-ink-900">
              {ergebnis.verschickt} {ergebnis.verschickt === 1 ? "Mail" : "Mails"} verschickt
            </b>
            {ergebnis.umgeleitetAn && (
              <p className="mt-0.5 text-sm text-amber-800">
                Die Testbremse ist gesetzt: alles ging an {ergebnis.umgeleitetAn}, nicht an die
                Mannschaft.
              </p>
            )}
            {ergebnis.fehlgeschlagen > 0 && (
              <p className="mt-0.5 text-sm text-ink-600">
                {ergebnis.fehlgeschlagen} {ergebnis.fehlgeschlagen === 1 ? "Mail" : "Mails"} ging
                {ergebnis.fehlgeschlagen === 1 ? "" : "en"} nicht raus. Die Größen lassen sich
                für diese Personen weiter über die Liste eintragen.
              </p>
            )}
            <p className="mt-2 text-sm text-ink-500">
              Lad die Seite neu, um den neuen Stand zu sehen.
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
          <b className="block text-sm text-ink-900">Größen-Mail verschicken</b>
          <span className="text-sm text-ink-600">
            Jede angehakte Person bekommt ihren eigenen Link
            {frist ? ` – mit der Frist ${frist}` : "."}
          </span>
        </div>
        <Badge tone="outline">{gewaehlt.size} ausgewählt</Badge>
      </div>

      <form onSubmit={abschicken(absenden)} className="mt-4">
        <ul className="divide-y divide-ink-100 rounded-xl bg-ink-50 px-3.5">
          {empfaenger.map((e) => (
            <li key={e.person} className="py-2.5">
              <label
                className={`flex items-center gap-2.5 text-sm ${
                  e.hatAdresse ? "text-ink-800" : "text-ink-400"
                }`}
              >
                <input
                  type="checkbox"
                  name="person"
                  value={e.person}
                  checked={gewaehlt.has(e.person)}
                  disabled={!e.hatAdresse}
                  onChange={() => schalte(e.person)}
                  className="h-4 w-4 flex-none accent-pitch-600"
                />
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                {!e.hatAdresse && <span className="flex-none text-xs">keine Adresse</span>}
                {e.hatGroesse && (
                  <span className="flex-none text-xs text-pitch-700">hat eingetragen</span>
                )}
                {e.zuletzt && (
                  <span className="flex-none text-xs text-ink-500">
                    Mail am {tag(e.zuletzt)}
                  </span>
                )}
              </label>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={laeuft || gewaehlt.size === 0}>
            <IconSend width={16} height={16} />
            {laeuft
              ? "Wird verschickt…"
              : `An ${gewaehlt.size} ${gewaehlt.size === 1 ? "Person" : "Personen"} verschicken`}
          </Button>
          <button
            type="button"
            onClick={() => setGewaehlt(new Set())}
            className="cursor-pointer text-sm text-ink-500 underline"
          >
            Auswahl leeren
          </button>
        </div>

        {ergebnis.stand === "fehler" && (
          <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-800">
            {ergebnis.text}
          </p>
        )}
      </form>

      {ohneAdresse.length > 0 && (
        <p className="mt-4 text-sm text-ink-500">
          Ohne Adresse in HubSpot:{" "}
          {ohneAdresse.map((e) => e.name).join(", ")}. Diese Größen trägst du über die Liste
          selbst ein.
        </p>
      )}
    </Card>
  );
}
