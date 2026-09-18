import { NextResponse, type NextRequest } from "next/server";
import { authClient } from "@/lib/anmeldung";
import { darfSparte } from "@/lib/sparte";

/**
 * Der Rückweg aus der Anmeldemail.
 *
 * Supabase schickt je nach Mailvorlage zwei verschiedene Dinge her, und beide
 * müssen hier ankommen:
 *
 * - `?code=…` — der PKCE-Weg. So kommt es, wenn der Link über `signInWithOtp`
 *   entstanden ist und die Vorlage `{{ .ConfirmationURL }}` benutzt.
 * - `?token_hash=…&type=magiclink` — der neuere Weg, den Supabase empfiehlt,
 *   weil Mailprogramme Links vorab öffnen und `ConfirmationURL` dabei
 *   verbrauchen. Er will `verifyOtp`.
 *
 * Nur einen von beiden zu behandeln heißt: es läuft, bis jemand in Supabase die
 * Vorlage anfasst. Deshalb beide.
 *
 * `nodejs`, weil hier Cookies gesetzt werden und der Auth-Client mitspielt.
 */
export const runtime = "nodejs";

/** Immer auf die eigene Adresse zurück – ein offener Weiterleiter wäre ein Loch. */
function ziel(anfrage: NextRequest, pfad: string): URL {
  const url = anfrage.nextUrl.clone();
  url.pathname = pfad;
  url.search = "";
  url.hash = "";
  return url;
}

export async function GET(anfrage: NextRequest) {
  const client = await authClient();
  if (!client) return NextResponse.redirect(ziel(anfrage, "/anmelden"));

  const suche = anfrage.nextUrl.searchParams;
  const code = suche.get("code");
  const tokenHash = suche.get("token_hash");
  const art = suche.get("type");

  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) console.error(`Anmeldung (code): ${error.message}`);
  } else if (tokenHash) {
    const { error } = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type: art === "recovery" ? "recovery" : art === "invite" ? "invite" : "magiclink",
    });
    if (error) console.error(`Anmeldung (token_hash): ${error.message}`);
  } else {
    return NextResponse.redirect(ziel(anfrage, "/anmelden"));
  }

  // Auch nach gültigem Token entscheidet die Liste, nicht das Konto. Wer sich
  // in Supabase ein Konto verschafft hat, kommt hier nicht weiter.
  const { data } = await client.auth.getUser();
  if (!darfSparte(data.user?.email)) {
    await client.auth.signOut();
    return NextResponse.redirect(ziel(anfrage, "/anmelden"));
  }

  return NextResponse.redirect(ziel(anfrage, "/sparte"));
}
