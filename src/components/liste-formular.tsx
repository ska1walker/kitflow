"use client";

import { useActionState } from "react";
import { abschicken } from "./formular";
import { Badge, Button, Card } from "./ui";
import { IconCheck, IconStop } from "./icons";
import { listeBestaetigen, type Ergebnis } from "@/app/b/[vorgang]/aktion";
import type { Pruefung } from "@/lib/pruefungen";
import type { Liste } from "@/lib/vorgaenge";

const LEER: Ergebnis = { stand: "leer" };

/** Eine Prüfung mit ihrem Stand und, wenn sie gefallen ist, dem Klartext. */
function PruefZeile({ pruefung }: { pruefung: Pruefung }) {
  const ton = pruefung.stand === "bestanden" ? "pitch" : pruefung.stand === "offen" ? "neutral" : "amber";
  const wort =
    pruefung.stand === "bestanden" ? "bestanden" : pruefung.stand === "offen" ? "offen" : "fehlt noch";

  return (
    <li className="border-t border-ink-100 py-2.5 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm">
          <span className="tnum font-mono text-xs text-ink-500">{pruefung.nr}</span>{" "}
          {pruefung.titel}
        </span>
        <Badge tone={ton}>{wort}</Badge>
      </div>
      {pruefung.stand !== "bestanden" && pruefung.details.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-0.5">
          {pruefung.details.map((zeile) => (
            <li key={zeile} className="text-xs text-ink-600">
              {zeile}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * F3 · Liste bestätigen (docs/formulare.md).
 *
 * Der Trainer sieht jede Person mit ihren Größen. Fehlend oder veraltet ist
 * gelb, eine doppelte oder fehlende Rückennummer rot. Bestätigen geht erst,
 * wenn die sechs Prüfungen durch sind.
 */
export function ListeFormular({ liste, token }: { liste: Liste; token: string }) {
  const [ergebnis, absenden, laeuft] = useActionState(
    listeBestaetigen.bind(null, liste.vorgang, token),
    LEER,
  );

  const doppelt = new Set(
    liste.zeilen
      .map((z) => z.nummer)
      .filter((n, i, alle) => n !== "" && alle.indexOf(n) !== i),
  );

  if (ergebnis.stand === "bestaetigt") {
    return (
      <Card className="p-6">
        <div className="flex items-start gap-3.5">
          <span className="mt-0.5 flex-none text-pitch-700">
            <IconCheck width={22} height={22} />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-ink-900">
              Liste bestätigt
            </h1>
            <p className="mt-1.5 text-sm text-ink-600">
              Die Bestätigung steht am Vorgang {liste.vorgang}. Die Anfrage an Intersport Uelzen und
              11teamsports verschickt kitflow noch nicht selbst — das kommt mit dem Mailversand.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-6">
        <span className="eyebrow text-pitch-600">Vorgang {liste.vorgang}</span>
        <h1 className="font-display mt-1.5 text-2xl font-extrabold tracking-tight text-ink-900">
          Liste prüfen
        </h1>
        <p className="mt-1 text-sm text-ink-600">
          {liste.mannschaft} · {liste.gegenstand} · {liste.zeilen.length}{" "}
          {liste.zeilen.length === 1 ? "Person" : "Personen"}
        </p>
        {liste.bestaetigtAm && (
          <p className="mt-3 text-sm text-ink-600">
            Schon einmal bestätigt am {liste.bestaetigtAm}. Eine neue Bestätigung ersetzt die alte.
          </p>
        )}
      </Card>

      <Card className="overflow-x-auto p-5">
        <h2 className="font-display mb-3.5 text-lg font-bold text-ink-900">Größen</h2>
        <table className="w-full min-w-[32rem] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-ink-500">
              <th className="pb-2">Person</th>
              {liste.arten.map((a) => (
                <th key={a.art} className="pb-2">
                  {a.label}
                </th>
              ))}
              {liste.trikotsatz && <th className="pb-2">Nummer</th>}
              {liste.initialenNoetig && <th className="pb-2">Initialen</th>}
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {liste.zeilen.map((zeile) => (
              <tr key={zeile.person} className="border-t border-ink-100">
                <td className="py-2 pr-3">
                  {zeile.name}
                  {zeile.torwart && (
                    <Badge tone="outline" className="ml-2">
                      Torwart
                    </Badge>
                  )}
                </td>
                {zeile.groessen.map((g) => (
                  <td key={g.art} className="py-2 pr-3">
                    {g.wert === "" ? (
                      <Badge tone="amber">fehlt</Badge>
                    ) : zeile.veraltet ? (
                      <Badge tone="amber">{g.wert} · veraltet</Badge>
                    ) : (
                      <span className="tnum">{g.wert}</span>
                    )}
                  </td>
                ))}
                {liste.trikotsatz && (
                  <td className="py-2">
                    {zeile.nummer === "" ? (
                      <Badge tone="red">fehlt</Badge>
                    ) : doppelt.has(zeile.nummer) ? (
                      <Badge tone="red">{zeile.nummer} · doppelt</Badge>
                    ) : (
                      <span className="tnum">{zeile.nummer}</span>
                    )}
                  </td>
                )}
                {liste.initialenNoetig && (
                  <td className="py-2 pr-3">
                    {zeile.initialen === "" ? (
                      <Badge tone="amber">fehlt</Badge>
                    ) : (
                      <span>{zeile.initialen}</span>
                    )}
                  </td>
                )}
                <td className="py-2 text-right">
                  <a href={zeile.aendern} className="text-sm font-semibold text-pitch-700 underline">
                    ändern
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {liste.zeilen.length === 0 && (
          <p className="text-sm text-ink-600">An diesem Vorgang hängt noch keine Person.</p>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="font-display mb-3.5 text-lg font-bold text-ink-900">
          Prüfungen vor der Anfrage
        </h2>
        <ul className="flex flex-col">
          {liste.pruefungen.map((p) => (
            <PruefZeile key={p.nr} pruefung={p} />
          ))}
        </ul>
        <p className="mt-3.5 text-xs text-ink-500">
          Offene Prüfungen halten die Bestätigung nicht auf. Sie stehen hier, damit niemand glaubt,
          sie seien durchgelaufen.
        </p>
      </Card>

      <Card className="p-5">
        <form onSubmit={abschicken(absenden)} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink-900">
              Lieferadresse{" "}
              <span className="font-normal text-ink-500">— leer lassen heißt: bleibt wie sie ist</span>
            </span>
            <textarea
              name="lieferadresse"
              rows={3}
              defaultValue={liste.lieferadresse}
              className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 focus:border-pitch-400 focus:ring-2 focus:ring-pitch-100 focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink-900">
              Hinweis an die Händler <span className="font-normal text-ink-500">— optional</span>
            </span>
            <textarea
              name="hinweis"
              rows={3}
              defaultValue={liste.hinweisHaendler}
              className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 focus:border-pitch-400 focus:ring-2 focus:ring-pitch-100 focus:outline-none"
            />
          </label>

          <label className="flex items-start gap-2.5 text-sm text-ink-800">
            <input
              type="checkbox"
              name="vollstaendig"
              value="ja"
              required
              className="mt-0.5 h-4 w-4 flex-none accent-pitch-600"
            />
            Die Liste ist vollständig und richtig.
          </label>

          {ergebnis.stand === "fehler" && (
            <p className="flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-800">
              <IconStop width={18} height={18} className="mt-px flex-none" />
              {ergebnis.text}
            </p>
          )}

          <Button type="submit" disabled={laeuft} className="self-start">
            {laeuft ? "Wird gespeichert…" : "Liste bestätigen"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
