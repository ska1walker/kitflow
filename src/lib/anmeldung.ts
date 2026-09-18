import "server-only";

/**
 * Die Anmeldung der Spartenleitung (docs/konzept.md, Schritt 3 des Programms).
 *
 * kitflow hat für Trainer, Spieler und Eltern bewusst keinen Login: sie weisen
 * sich über einen signierten Link aus (`links.ts`). Die Spartenleitung ist der
 * eine Fall, der einen echten Login braucht — sie sieht **alle** Vorgänge, nicht
 * einen, und sie darf die Stufe von Hand setzen.
 *
 * Verfahren: Supabase Auth, Magic Link, passwortlos. Wer hinein darf, steht in
 * `SPARTE_EMAILS` — nicht in der Datenbank. Ein Konto in Supabase allein reicht
 * also nie; die Liste entscheidet, und sie liegt dort, wo auch die Schlüssel
 * liegen.
 *
 * **Die Prüfung im `proxy` ist ausdrücklich optimistisch** (so nennt es
 * `node_modules/next/dist/docs/01-app/02-guides/authentication.md`): sie liest
 * nur das Cookie und spart einen Klick. Verlassen darf sich darauf nichts. Die
 * echte Prüfung ist `spartenLeitung()` und steht in jeder Seite und jeder
 * Server Action, die etwas hergibt — dieselbe Disziplin, die kitflow bei den
 * signierten Links schon hat.
 *
 * `getUser()` statt `getSession()`: `getSession()` liest das Cookie, wie es da
 * steht. `getUser()` lässt es vom Auth-Server prüfen. Ein Cookie kann jeder
 * schreiben.
 */

import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { darfSparte } from "./sparte";

function adresse(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
}

/**
 * Der öffentliche Schlüssel. Er darf in den Browser — im Gegensatz zum
 * Dienst-Schlüssel, mit dem `db.ts` arbeitet und der RLS umgeht.
 */
function anonSchluessel(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

/**
 * Ist die Anmeldung überhaupt eingerichtet? Fehlt etwas, kommt niemand hinein —
 * nicht: kommt jeder hinein. Eine Anwendung ohne Schlüssel darf nicht offen
 * stehen (dieselbe Regel wie in `links.ts`).
 */
export function anmeldungAktiv(): boolean {
  return Boolean(adresse() && anonSchluessel());
}

/**
 * Der Supabase-Client für diese Anfrage, mit dem Cookie-Speicher von Next.
 *
 * `setAll` scheitert absichtlich still: aus einer Server-Komponente heraus darf
 * Next keine Cookies setzen. Die Auffrischung erledigt der `proxy`, der das
 * darf — und ohne das `try` bräche jede Seite, die nur lesen will.
 */
export async function authClient(): Promise<SupabaseClient | null> {
  const url = adresse();
  const key = anonSchluessel();
  if (!url || !key) return null;

  const speicher = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return speicher.getAll();
      },
      setAll(gesetzt) {
        try {
          for (const { name, value, options } of gesetzt) speicher.set(name, value, options);
        } catch {
          // Server-Komponente: der proxy hat es schon getan.
        }
      },
    },
  });
}

/**
 * Die angemeldete Adresse, oder `null`.
 *
 * `cache` merkt sich das Ergebnis für die Dauer eines Renderdurchgangs: Seite
 * und Server Action fragen sonst zweimal beim Auth-Server nach.
 */
export const angemeldet = cache(async (): Promise<string | null> => {
  const client = await authClient();
  if (!client) return null;

  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email) return null;
  return data.user.email;
});

/**
 * Die Adresse der angemeldeten Spartenleitung, oder `null`.
 *
 * Das ist die Prüfung, auf die es ankommt. Jede Seite und jede Server Action
 * unter `/sparte` ruft sie selbst auf — eine Server Action ist eine eigene
 * Adresse und lässt sich ohne die Seite erreichen.
 */
export async function spartenLeitung(): Promise<string | null> {
  const email = await angemeldet();
  return darfSparte(email) ? email : null;
}
