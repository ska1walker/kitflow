import { NextResponse } from "next/server";
import { hole } from "@/lib/ablage";
import { pruefe } from "@/lib/links";
import { vorgangPerNummer } from "@/lib/vorgaenge-db";

export const runtime = "nodejs";

/**
 * Bilder aus der Ablage an den Browser.
 *
 * **Der Pfad kommt nie von außen.** Die Anfrage nennt Vorgang, Art und
 * allenfalls eine Artikel-ID; welcher Pfad dazugehört, steht in der Datenbank.
 * Ein Pfad als Parameter wäre ein Leseschlüssel für den ganzen Eimer — mit
 * `../` und etwas Geduld auch für alles daneben.
 *
 * **Dieselbe Tür wie die Seite.** Wer das Bild sehen will, braucht den Token,
 * mit dem er auch auf die Seite käme: den Trainer-Token für die Statusseite
 * oder den persönlichen Token für die Größenabfrage. Ohne gültigen Token gibt
 * es **404 und nicht 403** — ein „verboten" verriete, dass es das Bild gibt.
 *
 * Es liegen nur Sachbilder im Eimer (Sponsorlogo, Produktfotos). Der Token
 * schützt hier also keine Personendaten, sondern hält den Eimer geschlossen:
 * niemand soll Adressen sammeln können, die für immer gelten.
 */

/** Einheitliche Antwort für „gibt es nicht" und „darfst du nicht". */
function nichts() {
  return new NextResponse(null, { status: 404 });
}

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const nummer = p.get("vorgang");
  const art = p.get("art");
  const token = p.get("token") ?? undefined;
  const person = p.get("person") ?? undefined;

  if (!nummer || (art !== "sponsor" && art !== "artikel")) return nichts();

  // Zwei Wege hinein: der Trainer über die Statusseite, der Spieler über seine
  // Groessenabfrage. Der zweite gilt nur zusammen mit der eigenen Personen-ID.
  const darf =
    pruefe(token, "status", nummer) ||
    (person !== undefined && pruefe(token, "groessen", nummer, person));
  if (!darf) return nichts();

  const geladen = await vorgangPerNummer(nummer);
  if (geladen.stand !== "da") return nichts();
  const satz = geladen.vorgang;

  let pfad: string | undefined;
  if (art === "sponsor") {
    pfad = satz.sponsorLogo;
  } else {
    const id = p.get("id");
    // Nur ein Artikel DIESES Vorgangs. Eine fremde ID findet hier nichts.
    pfad = id ? satz.artikel.find((a) => a.id === id)?.bild : undefined;
  }
  if (!pfad) return nichts();

  const bild = await hole(pfad);
  if (!bild) return nichts();

  return new NextResponse(bild.bytes as BodyInit, {
    headers: {
      "Content-Type": bild.typ,
      // Privat: die Antwort haengt am Token, also darf sie in keinem
      // gemeinsamen Zwischenspeicher landen. Im Browser des Spielers darf sie
      // liegen - er laedt dieselbe Seite beim Nachsehen noch einmal.
      "Cache-Control": "private, max-age=3600",
      // Ein hochgeladenes Bild bleibt ein Bild, auch wenn jemand etwas anderes
      // hineingeschmuggelt haette.
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
