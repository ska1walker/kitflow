import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { darfSparte } from "@/lib/sparte";

/**
 * Der `proxy` — in Next 16 heißt so, was früher `middleware` hieß. Die alte
 * Konvention läuft in Produktion nicht mehr
 * (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/middleware.md`).
 *
 * Er tut zwei Dinge, und beide sind Bequemlichkeit, keine Sicherheit:
 *
 * 1. **Er hält die Sitzung frisch.** Ein Zugangstoken von Supabase läuft nach
 *    einer Stunde ab. Erneuern kann es nur, wer Cookies setzen darf — und das
 *    darf eine Server-Komponente nicht. Ohne diesen Schritt fliegt die
 *    Spartenleitung mitten in der Arbeit raus.
 * 2. **Er schickt Unangemeldete gleich zur Anmeldung**, statt sie erst eine
 *    Seite laden zu lassen, die nichts hergibt.
 *
 * **Diese Prüfung ist ausdrücklich optimistisch.** Die Next-Doku nennt sie so
 * und sagt im selben Atemzug, sie dürfe nicht die einzige Verteidigung sein.
 * Die echte Prüfung ist `spartenLeitung()` in `lib/anmeldung.ts` und steht in
 * jeder Seite und jeder Server Action unter `/sparte`. Wer diesen `proxy`
 * löschte, machte kitflow langsamer und unbequemer — aber nicht offen.
 */
export async function proxy(request: NextRequest) {
  let antwort = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Ohne eingerichtete Anmeldung kommt niemand hinein. Die Seite selbst sagt,
  // was fehlt; hier still weiterzuleiten würde eine Endlosschleife bauen.
  if (!url || !key) return antwort;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(gesetzt) {
        for (const { name, value } of gesetzt) request.cookies.set(name, value);
        antwort = NextResponse.next({ request });
        for (const { name, value, options } of gesetzt) {
          antwort.cookies.set(name, value, options);
        }
      },
    },
  });

  // `getUser` und nicht `getSession`: nur `getUser` lässt das Cookie vom
  // Auth-Server prüfen. Derselbe Aufruf frischt nebenbei die Sitzung auf.
  const { data } = await supabase.auth.getUser();

  if (request.nextUrl.pathname.startsWith("/sparte") && !darfSparte(data.user?.email)) {
    const ziel = request.nextUrl.clone();
    ziel.pathname = "/anmelden";
    ziel.search = "";
    return NextResponse.redirect(ziel);
  }

  return antwort;
}

export const config = {
  // Ohne `matcher` liefe der proxy auf jede Anfrage, auch auf Bilder und
  // Skripte. Gebraucht wird er nur dort, wo eine Sitzung im Spiel ist: die
  // Seiten mit signiertem Link (/v, /g, /b, /e, /neu) haben keine.
  matcher: ["/sparte/:path*", "/anmelden"],
};
