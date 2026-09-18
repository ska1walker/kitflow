"use client";

import { useActionState } from "react";
import { Button, Card } from "./ui";
import { abschicken } from "./formular";
import { IconCheck, IconStop } from "./icons";
import { linkAnfordern, type AnmeldeStand } from "@/app/anmelden/aktion";

/**
 * Die Anmeldung der Spartenleitung: eine Adresse, ein Knopf.
 *
 * Die Bestätigung sagt bewusst „wenn diese Adresse freigeschaltet ist“. Eine
 * Adresse, die nicht auf der Liste steht, bekommt genau denselben Satz zu
 * sehen — sonst ließe sich hier durchprobieren, wer die Spartenleitung ist
 * (siehe `app/anmelden/aktion.ts`).
 */
export function AnmeldeFormular() {
  const [stand, absenden, laeuft] = useActionState<AnmeldeStand, FormData>(linkAnfordern, {
    stand: "leer",
  });

  if (stand.stand === "verschickt") {
    return (
      <Card className="p-6">
        <div className="flex items-start gap-3.5">
          <span className="mt-0.5 flex-none text-signal-600">
            <IconCheck width={22} height={22} />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold text-ink-900">Sieh in dein Postfach</h2>
            <p className="mt-1.5 text-sm text-ink-600">
              Wenn <b>{stand.an}</b> freigeschaltet ist, liegt dort gleich ein Link. Er meldet dich
              an, ohne Passwort, und gilt nur einmal.
            </p>
            <p className="mt-3 text-sm text-ink-600">
              Kommt nichts an: sieh im Spam-Ordner nach. Bleibt es dabei, ist die Adresse nicht
              freigeschaltet oder der Versand hat gehakt — dann hilft nur Kai.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <form onSubmit={abschicken(absenden)} noValidate={false}>
        <label className="block text-sm font-semibold text-ink-800" htmlFor="email">
          Deine E-Mail-Adresse
        </label>
        <p className="mt-1 text-sm text-ink-600">
          Die Adresse, unter der dich der Verein als Spartenleitung kennt.
        </p>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          placeholder="name@eintrachtmunster.de"
          className="mt-3 w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-pitch-400"
        />

        {stand.stand === "fehler" && (
          <p className="mt-3 flex items-start gap-2 text-sm text-ink-700">
            <span className="mt-0.5 flex-none text-ink-500">
              <IconStop width={16} height={16} />
            </span>
            {stand.text}
          </p>
        )}

        <div className="mt-4">
          <Button type="submit" disabled={laeuft}>
            {laeuft ? "Einen Moment…" : "Anmeldelink schicken"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
