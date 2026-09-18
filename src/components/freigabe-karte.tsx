"use client";

import { useActionState, useState } from "react";
import { Badge, Button, Card } from "./ui";
import { abschicken } from "./formular";
import { IconCheck, IconStop } from "./icons";
import { freigeben, ablehnen, type FreigabeAntwort } from "@/app/sparte/aktion";
import { haendlerZahl } from "@/lib/texte";
import type { OffeneFreigabe } from "@/lib/typen";

/** Eine wartende Anfrage: was rausginge, und die beiden Knöpfe dazu. */
function Zeile({ f }: { f: OffeneFreigabe }) {
  const [stand, freigabeAbsenden, laeuftFrei] = useActionState<FreigabeAntwort, FormData>(
    freigeben,
    { stand: "leer" },
  );
  const [stopStand, stopAbsenden, laeuftStop] = useActionState<FreigabeAntwort, FormData>(
    ablehnen,
    { stand: "leer" },
  );
  const [stoppen, setStoppen] = useState(false);

  const antwort = stand.stand !== "leer" ? stand : stopStand;
  const erledigt = antwort.stand === "raus" || antwort.stand === "gestoppt";

  return (
    <li className="border-t border-ink-100 py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-ink-900">
          {f.nummer} · {f.mannschaft}
        </span>
        <Badge tone="amber">Freigabe offen</Badge>
      </div>
      <p className="mt-1 text-sm text-ink-600">
        {f.gegenstand} · {f.stueck} Stück für {f.personen}{" "}
        {f.personen === 1 ? "Person" : "Personen"} · an{" "}
        {haendlerZahl(f.haendler)}
      </p>
      {f.href && (
        <p className="mt-1">
          <a href={f.href} className="text-sm font-semibold text-pitch-700 underline">
            Vorgang ansehen
          </a>
        </p>
      )}

      {erledigt ? (
        <p className="mt-3 flex items-start gap-2 text-sm text-ink-700">
          <span className="mt-0.5 flex-none text-signal-600">
            <IconCheck width={16} height={16} />
          </span>
          <span>
            {antwort.stand === "raus"
              ? `Die Anfrage ist an ${haendlerZahl(antwort.anHaendler)} gegangen. Der Trainer hat Bescheid bekommen.`
              : "Gestoppt. Der Trainer hat den Grund per Mail bekommen."}
          </span>
        </p>
      ) : (
        <>
          {!stoppen ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <form onSubmit={abschicken(freigabeAbsenden)}>
                <input type="hidden" name="vorgang" value={f.nummer} />
                <Button type="submit" disabled={laeuftFrei}>
                  {laeuftFrei ? "Geht raus…" : "Freigeben und verschicken"}
                </Button>
              </form>
              <Button type="button" variante="sekundaer" onClick={() => setStoppen(true)}>
                Stoppen
              </Button>
            </div>
          ) : (
            <form onSubmit={abschicken(stopAbsenden)} className="mt-3 flex flex-col gap-2">
              <input type="hidden" name="vorgang" value={f.nummer} />
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-ink-700">
                  Was soll der Trainer ändern?
                </span>
                <textarea
                  name="grund"
                  rows={2}
                  required
                  minLength={5}
                  className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 focus:border-pitch-400 focus:ring-2 focus:ring-pitch-100 focus:outline-none"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" variante="sekundaer" disabled={laeuftStop}>
                  {laeuftStop ? "Einen Moment…" : "Stoppen und Bescheid geben"}
                </Button>
                <Button type="button" variante="sekundaer" onClick={() => setStoppen(false)}>
                  Zurück
                </Button>
              </div>
            </form>
          )}

          {antwort.stand === "fehler" && (
            <p className="mt-2 flex items-start gap-2 text-sm text-ink-700">
              <span className="mt-0.5 flex-none text-ink-500">
                <IconStop width={16} height={16} />
              </span>
              {antwort.text}
            </p>
          )}
        </>
      )}
    </li>
  );
}

/**
 * F9 · Die Händleranfrage freigeben.
 *
 * **Die einzige Stelle, an der ein Mensch eine Mail nach draußen auslöst.**
 * Deshalb steht hier, was rausgeht, bevor jemand klickt — und nicht erst
 * danach: Mannschaft, Stückzahl, an wie viele Händler.
 *
 * **Keine Namen.** Was in der Anfrage steht, steht auch hier nicht: die
 * Spartenleitung entscheidet über Stückzahlen, nicht über Personen. Wer die
 * Liste sehen will, öffnet die Statusseite des Vorgangs.
 *
 * Ablehnen ist gleichberechtigt und nicht versteckt. Ein Stopp ohne Grund wäre
 * für den Trainer dasselbe wie Stille, deshalb ist das Feld Pflicht.
 */
export function FreigabeKarte({ offen }: { offen: OffeneFreigabe[] }) {
  if (offen.length === 0) return null;

  return (
    <Card className="p-5">
      <h2 className="font-display text-base font-bold text-ink-900">
        Händleranfragen freigeben
        <Badge tone="amber" className="ml-2">
          {offen.length}
        </Badge>
      </h2>
      <p className="mt-1 text-sm text-ink-600">
        Der Trainer hat die Liste bestätigt. Ohne Freigabe geht nichts an die Händler. In der
        Anfrage stehen keine Namen — nur Artikel, Größen, Stückzahlen und Nummern.
      </p>

      <ul className="mt-4 flex flex-col">
        {offen.map((f) => (
          <Zeile key={f.nummer} f={f} />
        ))}
      </ul>
    </Card>
  );
}
