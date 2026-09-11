"use client";

import { useActionState, useState } from "react";
import { abschicken } from "./formular";
import { Badge, Button, Card, KnopfLink } from "./ui";
import { IconArrowRight, IconStop } from "./icons";
import { voranfrageAbbrechen, type Ergebnis } from "@/app/v/[vorgang]/aktion";

const LEER: Ergebnis = { stand: "leer" };

/**
 * Der Ausweg aus Stufe 0 (docs/konzept.md).
 *
 * Auf der Voranfrage sagt der Statuskopf, was als Nächstes zu tun ist – ohne
 * diese Karte gäbe es aber keinen Weg dorthin. Zwei Wege gehören hier hin:
 * weiter, wenn die Finanzierung klar wird, und abbrechen, wenn der Sponsor
 * absagt. Sonst liegt der Vorgang ohne Ausgang.
 *
 * Nur der Trainer-Link zeigt sie: Spieler haben hier nichts zu entscheiden.
 */
export function VoranfrageKarte({
  vorgang,
  ergaenzen,
  token,
}: {
  vorgang: string;
  ergaenzen: string;
  token: string;
}) {
  const [ergebnis, absenden, laeuft] = useActionState(
    voranfrageAbbrechen.bind(null, vorgang, token),
    LEER,
  );
  const [fragt, setFragt] = useState(false);

  if (ergebnis.stand === "abgebrochen") {
    return (
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex-none text-ink-500">
            <IconStop width={20} height={20} />
          </span>
          <div>
            <b className="block text-sm text-ink-900">Voranfrage abgebrochen</b>
            <span className="text-sm text-ink-600">
              {vorgang} steht jetzt auf „Abgebrochen“. Es wurde nichts bestellt und niemand
              angeschrieben. Lad die Seite neu, um den neuen Stand zu sehen.
            </span>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <b className="block text-sm text-ink-900">Wie geht es weiter?</b>
          <span className="text-sm text-ink-600">
            Steht die Finanzierung, vervollständigst du die Angaben und die Größenabfrage startet.
            Sagt der Sponsor ab, brichst du hier ab.
          </span>
        </div>
        <Badge tone="outline">Stufe 0</Badge>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <KnopfLink href={ergaenzen}>
          Angaben vervollständigen
          <IconArrowRight width={16} height={16} />
        </KnopfLink>

        {!fragt && (
          <button
            type="button"
            onClick={() => setFragt(true)}
            className="cursor-pointer text-sm text-ink-500 underline"
          >
            Voranfrage abbrechen
          </button>
        )}
      </div>

      {fragt && (
        <form onSubmit={abschicken(absenden)} className="mt-4 rounded-xl bg-ink-50 p-4">
          <input type="hidden" name="abbrechen" value="ja" />
          <b className="block text-sm text-ink-900">Wirklich abbrechen?</b>
          <p className="mt-0.5 text-sm text-ink-600">
            Der Vorgang geht auf „Abgebrochen“ und lässt sich hier nicht wieder öffnen. Die
            Spartenleitung kann ihn in HubSpot zurückholen.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="submit" variante="sekundaer" disabled={laeuft}>
              {laeuft ? "Wird abgebrochen…" : "Ja, abbrechen"}
            </Button>
            <button
              type="button"
              onClick={() => setFragt(false)}
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
    </Card>
  );
}
