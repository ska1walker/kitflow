import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { erinnerungslauf } from "@/lib/erinnerung";

/**
 * Der tägliche Erinnerungslauf, angestoßen von Vercel Cron (`vercel.json`).
 *
 * **Diese Adresse steht offen im Netz.** Der Zeitgeber ist kein Schutz: jeder
 * kann sie aufrufen. Sie prüft deshalb selbst — genau wie jede Server Action
 * ihr Token selbst prüft und `/sparte` nicht auf den `proxy` vertraut.
 *
 * Vercel schickt `Authorization: Bearer $CRON_SECRET`. **Fehlt das Geheimnis
 * auf dem Server, ist die Antwort 503 und nicht 200**: eine Anwendung ohne
 * Schlüssel darf nicht offen stehen. Dieselbe Regel wie bei `LINK_SECRET` und
 * `SPARTE_EMAILS`.
 *
 * `nodejs`, weil der Lauf HubSpot, die Datenbank und Resend anspricht.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vergleicht in konstanter Zeit – wie `pruefe` in `links.ts`. */
function gleich(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

export async function GET(anfrage: NextRequest) {
  const geheim = process.env.CRON_SECRET;
  if (!geheim || geheim.length < 16) {
    console.error("Erinnerungslauf: CRON_SECRET fehlt oder ist zu kurz");
    return NextResponse.json({ fehler: "nicht eingerichtet" }, { status: 503 });
  }

  const kopf = anfrage.headers.get("authorization") ?? "";
  if (!gleich(kopf, `Bearer ${geheim}`)) {
    return NextResponse.json({ fehler: "kein Zugang" }, { status: 401 });
  }

  const ergebnis = await erinnerungslauf();
  if (!ergebnis.ok) {
    console.error(`Erinnerungslauf abgebrochen: ${ergebnis.grund}`);
    return NextResponse.json({ ok: false, grund: ergebnis.grund }, { status: 503 });
  }

  // Der Bericht trägt nur Zahlen. Vornamen und Adressen stehen in den Mails
  // und in keinem Log (CLAUDE.md).
  console.log(`Erinnerungslauf: ${JSON.stringify(ergebnis.bericht)}`);
  return NextResponse.json({ ok: true, ...ergebnis.bericht });
}
