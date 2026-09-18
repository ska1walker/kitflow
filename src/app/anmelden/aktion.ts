"use server";

/**
 * Die Anmeldung: eine Adresse eintragen, einen Link ins Postfach bekommen.
 *
 * Zwei Dinge, die hier nicht offensichtlich sind:
 *
 * 1. **Die Antwort ist immer dieselbe.** Ob eine Adresse freigeschaltet ist,
 *    sagt diese Seite nicht — sonst ließe sich durch Ausprobieren herausfinden,
 *    wer die Spartenleitung ist. Verschickt wird trotzdem nur an Adressen aus
 *    `SPARTE_EMAILS`; ein Fremder bekommt also auch keine Post.
 * 2. **Der Link kommt von Supabase, nicht von Resend.** Er ist Teil des
 *    Auth-Verfahrens und trägt dessen Einmal-Token. Damit er nicht aus einer
 *    Supabase-Domain kommt und nicht bei zwei Mails pro Stunde hängenbleibt,
 *    gehört in Supabase Custom SMTP auf Resend gestellt (docs/anmeldung.md).
 */

import { headers } from "next/headers";
import { authClient } from "@/lib/anmeldung";
import { darfSparte } from "@/lib/sparte";
import { basis } from "@/lib/mail";

export type AnmeldeStand =
  | { stand: "leer" }
  | { stand: "verschickt"; an: string }
  | { stand: "fehler"; text: string };

/** Dieselbe Prüfung wie im Formular – eine Server Action ist eine eigene Adresse. */
const ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Wohin Supabase nach dem Klick zurückschickt.
 *
 * `KITFLOW_BASIS` ist für Mails da und darf fehlen; dann nimmt sie die Adresse,
 * unter der die Seite gerade läuft. Ohne beides entstünde ein Link ins Leere.
 */
async function herkunft(): Promise<string | null> {
  const gesetzt = basis();
  if (gesetzt) return gesetzt;

  const kopf = await headers();
  const host = kopf.get("host");
  if (!host) return null;
  const schema = kopf.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${schema}://${host}`;
}

export async function linkAnfordern(
  _bisher: AnmeldeStand,
  formular: FormData,
): Promise<AnmeldeStand> {
  const email = String(formular.get("email") ?? "").trim();
  if (!ADRESSE.test(email)) {
    return { stand: "fehler", text: "Bitte eine gültige E-Mail-Adresse eintragen." };
  }

  const client = await authClient();
  if (!client) {
    return {
      stand: "fehler",
      text: "Die Anmeldung ist auf diesem Server nicht eingerichtet.",
    };
  }

  const zurueck = await herkunft();
  if (!zurueck) {
    return { stand: "fehler", text: "Das hat gerade nicht geklappt. Bitte versuch es später." };
  }

  // Nur an Freigeschaltete geht wirklich etwas raus. Die Antwort unten ist
  // trotzdem dieselbe – siehe Kopf der Datei.
  if (darfSparte(email)) {
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${zurueck}/auth/callback` },
    });
    // Auch ein Fehler bekommt unten dieselbe Antwort. Sonst wäre die
    // Fehlermeldung selbst die Auskunft: scheitern kann nur, wo wirklich
    // verschickt wird, also nur bei einer freigeschalteten Adresse. Der Grund
    // gehört ins Log — und die Seite sagt, was zu tun ist, wenn nichts ankommt.
    if (error) console.error(`Anmeldung: ${error.message}`);
  }

  return { stand: "verschickt", an: email };
}
