"use client";

import { useActionState } from "react";
import { Button, Card } from "./ui";
import { IconCheck, IconStop } from "./icons";
import { VorgangFertig } from "./vorgang-fertig";
import { vorgangAnlegen, type AnlegeStand } from "@/app/neu/bestaetigen/[entwurf]/aktion";

/**
 * Der letzte Schritt: aus dem Entwurf wird ein Vorgang.
 *
 * Bewusst ein Knopf und kein Aufruf beim Öffnen der Seite. Mailprogramme und
 * Virenscanner öffnen Links in Mails vorab, um sie zu prüfen — legte schon das
 * Öffnen den Vorgang an, entstünde er, ohne dass ein Mensch ihn gesehen hat,
 * und der Trainer bekäme die Bestätigungsseite nie zu Gesicht.
 *
 * Nebenbei ist es die letzte Stelle, an der jemand merkt, dass er sich in der
 * Mannschaft vertan hat.
 */
export function AnlegenKarte({
  entwurf,
  token,
  mannschaft,
  ausstattungsart,
  artikel,
  frist,
}: {
  entwurf: string;
  token: string;
  mannschaft: string;
  ausstattungsart: string;
  artikel: { name: string; detail: string }[];
  frist: string;
}) {
  const [stand, absenden, laeuft] = useActionState<AnlegeStand>(
    vorgangAnlegen.bind(null, entwurf, token),
    { stand: "leer" },
  );

  if (stand.stand === "fertig") return <VorgangFertig ergebnis={stand.ergebnis} />;

  return (
    <Card className="p-6">
      <div className="flex items-start gap-3.5">
        <span className="mt-0.5 flex-none text-pitch-700">
          <IconCheck width={22} height={22} />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold tracking-tight text-ink-900">
            Bitte einmal prüfen
          </h1>
          <p className="mt-1.5 text-sm text-ink-600">
            Danach wird der Vorgang angelegt und du bekommst deine Links per Mail. Bis hierher ist
            nichts passiert.
          </p>

          <dl className="mt-4 flex flex-col gap-2 text-sm">
            <div className="flex gap-2">
              <dt className="w-32 flex-none text-ink-500">Mannschaft</dt>
              <dd className="font-semibold text-ink-900">{mannschaft}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 flex-none text-ink-500">Was</dt>
              <dd className="text-ink-800">{ausstattungsart}</dd>
            </div>
            {frist && (
              <div className="flex gap-2">
                <dt className="w-32 flex-none text-ink-500">Größen bis</dt>
                <dd className="text-ink-800">{frist}</dd>
              </div>
            )}
          </dl>

          {artikel.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 text-sm text-ink-700">
              {artikel.map((a) => (
                <li key={a.name}>
                  {a.name} <span className="text-ink-500">· {a.detail}</span>
                </li>
              ))}
            </ul>
          )}

          <form action={absenden} className="mt-5">
            <Button type="submit" disabled={laeuft}>
              {laeuft ? "Einen Moment…" : "Vorgang jetzt anlegen"}
            </Button>
          </form>

          {stand.stand === "fehler" && (
            <p className="mt-3 flex items-start gap-2 text-sm text-ink-700">
              <span className="mt-0.5 flex-none text-ink-500">
                <IconStop width={16} height={16} />
              </span>
              {stand.text}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
