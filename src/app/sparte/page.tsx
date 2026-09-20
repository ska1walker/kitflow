import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { Kopfzeile } from "@/components/kopfzeile";
import { SpartenAnsicht } from "@/components/sparten-ansicht";
import { StufenKarte } from "@/components/stufen-karte";
import { FristKarte } from "@/components/frist-karte";
import { AngebotKarte } from "@/components/angebot-karte";
import { Abmelden } from "@/components/abmelden";
import { Stoerung } from "@/components/stoerung";
import { FreigabeKarte } from "@/components/freigabe-karte";
import { spartenLeitung } from "@/lib/anmeldung";
import { ladeFreigaben, ladeZeilen } from "@/lib/uebersicht";

export const metadata = { title: "Spartenleitung · kitflow" };

/**
 * Nie vorrendern.
 *
 * Ohne diese Zeile hing es am Zufall: `spartenLeitung()` liest die Cookies erst,
 * **nachdem** es die Zugangsdaten geprüft hat. Fehlen sie beim Bauen, wird
 * `cookies()` nie aufgerufen, Next hält die Seite für statisch und backt eine
 * Antwort ein. Eine Seite, die für jeden Besucher dieselbe Antwort liefert,
 * ist das Gegenteil dessen, was eine Anmeldung leisten soll.
 */
export const dynamic = "force-dynamic";

/**
 * Die Übersicht der Spartenleitung: alle Vorgänge, wo es hängt, wer am Zug ist.
 *
 * Dies ist die einzige Seite mit echtem Login. Alle anderen hängen an einem
 * signierten Link, weil sie genau einen Vorgang zeigen; diese zeigt alle.
 *
 * **Die Prüfung steht hier, nicht nur im `proxy`.** Der prüft optimistisch und
 * spart einen Klick; verlassen darf sich darauf nichts (siehe `proxy.ts` und
 * die Next-Doku zur Authentifizierung). Wer diese Seite ohne Anmeldung
 * aufruft, landet auf `/anmelden` — und zwar unabhängig davon, ob der `proxy`
 * überhaupt gelaufen ist.
 */
export default async function Sparte() {
  const wer = await spartenLeitung();
  if (!wer) redirect("/anmelden");

  const [zeilen, freigaben] = await Promise.all([ladeZeilen(), ladeFreigaben()]);

  return (
    <>
      <Kopfzeile breit rechts={<Abmelden email={wer} />} />

      <main className="pt-5 pb-14">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4">
          {/* Ganz oben: es ist das Einzige auf dieser Seite, das jemanden
              aufhält. Eine Störung beim Laden wird benannt und nicht als
              „nichts zu tun“ verschwiegen — genau darin läge der Schaden. */}
          {freigaben === null ? (
            <Card className="border-amber-200 bg-amber-50 p-5">
              <h2 className="font-display text-base font-bold text-ink-900">
                Offene Freigaben nicht abrufbar
              </h2>
              <p className="mt-1 text-sm text-ink-700">
                kitflow kommt gerade nicht an die Freigaben. Das heißt nicht, dass keine offen
                sind. Bitte lade die Seite in einer Minute neu.
              </p>
            </Card>
          ) : (
            <FreigabeKarte offen={freigaben} />
          )}

          {zeilen === null ? (
            // `null` heißt „konnte nicht fragen“. Eine leere Liste hieße
            // „keine Vorgänge“ — das wäre hier die gefährlichere Auskunft.
            <Stoerung />
          ) : zeilen.length === 0 ? (
            <Card className="p-6">
              <h1 className="font-display text-xl font-bold text-ink-900">
                Noch kein einziger Vorgang
              </h1>
              <p className="mt-1.5 text-sm text-ink-600">
                Sobald jemand Bedarf meldet, steht er hier. Die Datenbank antwortet — sie ist nur
                leer.
              </p>
            </Card>
          ) : (
            <>
              <SpartenAnsicht zeilen={zeilen} />
              <FristKarte zeilen={zeilen} />
              <AngebotKarte zeilen={zeilen} />
              <StufenKarte zeilen={zeilen} />
            </>
          )}
        </div>
      </main>
    </>
  );
}
