"use client";

import { useActionState } from "react";
import { bildSetzen, type BildErgebnis } from "@/app/v/[vorgang]/aktion";
import { Button, Card } from "./ui";
import type { Artikel } from "@/lib/typen";

/**
 * Bilder zum Vorgang: das Sponsorlogo für den Händler und Produktfotos für die
 * Spieler.
 *
 * **Nur hier, nie auf `/neu`.** Die Bedarfsmeldung steht offen im Netz und legt
 * seit Migration 002 bloß Entwürfe an; ein Hochladefeld dort hieße, Dateien von
 * Unbekannten für Vorgänge zu speichern, die es noch gar nicht gibt. Diese
 * Karte hängt am signierten Trainer-Link.
 *
 * Das Formular zeigt kein Fortschrittsbalken und kein Vorher-Nachher: es geht
 * um zwei, drei Bilder je Vorgang, die der Trainer einmal einstellt. Was zählt,
 * ist dass er sieht, ob eins hinterlegt ist.
 */

const LEER: BildErgebnis = { stand: "leer" };

function Feld({
  vorgang,
  token,
  art,
  artikelId,
  titel,
  hinweis,
  vorhanden,
  bildAdresse,
}: {
  vorgang: string;
  token: string;
  art: "sponsor" | "artikel";
  artikelId?: string;
  titel: string;
  hinweis: string;
  vorhanden: boolean;
  bildAdresse: string;
}) {
  const [ergebnis, absenden, laeuft] = useActionState(
    bildSetzen.bind(null, vorgang, token),
    LEER,
  );

  // Die Seite laedt sich nach einer Server Action nicht neu (so ist es im
  // ganzen Projekt). Ohne das hier staende nach dem Hochladen „Gespeichert" und
  // daneben weiter „kein Bild" — der Trainer laedt dann ein zweites Mal hoch.
  //
  // Abgeleitet beim Rendern statt in einem Effect: Zustand aus Zustand zu
  // errechnen ist kein Nebeneffekt, und React 19 weist das zu Recht zurueck.
  const daIst =
    ergebnis.stand === "gespeichert" ? true : ergebnis.stand === "entfernt" ? false : vorhanden;

  return (
    <form action={absenden} className="flex flex-col gap-2 border-t border-ink-100 pt-4">
      <input type="hidden" name="art" value={art} />
      {artikelId && <input type="hidden" name="artikel" value={artikelId} />}

      <div className="flex items-start gap-3">
        {daIst ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={
              ergebnis.stand === "gespeichert"
                ? `${bildAdresse}&stand=${ergebnis.stempel}`
                : bildAdresse
            }
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 flex-none rounded-lg border border-ink-200 bg-white object-contain"
          />
        ) : (
          <span className="flex h-14 w-14 flex-none items-center justify-center rounded-lg border border-dashed border-ink-300 text-[10px] text-ink-400">
            kein Bild
          </span>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-900">{titel}</p>
          <p className="mt-0.5 text-xs text-ink-500">{hinweis}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          name="bild"
          accept="image/png,image/jpeg,image/webp"
          className="min-w-0 flex-1 text-xs text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink-800"
        />
        <Button type="submit" disabled={laeuft}>
          {laeuft ? "…" : daIst ? "Ersetzen" : "Hochladen"}
        </Button>
        {daIst && (
          <button
            type="submit"
            name="entfernen"
            value="ja"
            disabled={laeuft}
            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-500 hover:bg-ink-100 hover:text-ink-800"
          >
            Entfernen
          </button>
        )}
      </div>

      {ergebnis.stand === "fehler" && (
        <p className="text-xs text-red-700">{ergebnis.text}</p>
      )}
      {ergebnis.stand === "gespeichert" && (
        <p className="text-xs text-ink-500">Gespeichert.</p>
      )}
      {ergebnis.stand === "entfernt" && <p className="text-xs text-ink-500">Entfernt.</p>}
    </form>
  );
}

export function BilderKarte({
  vorgang,
  token,
  artikel,
  sponsorLogo,
  sponsor,
}: {
  vorgang: string;
  token: string;
  artikel: Artikel[];
  sponsorLogo: boolean;
  sponsor?: string;
}) {
  // Ohne Artikel-ID lässt sich kein Foto zuordnen. Das trifft heute keinen
  // echten Vorgang, aber ein `undefined` in der Adresse liefe stumm ins Leere.
  const mitId = artikel.filter((a) => a.id);

  function adresse(art: "sponsor" | "artikel", id?: string): string {
    const teile = [`vorgang=${encodeURIComponent(vorgang)}`, `art=${art}`, `token=${encodeURIComponent(token)}`];
    if (id) teile.push(`id=${encodeURIComponent(id)}`);
    return `/api/bild?${teile.join("&")}`;
  }

  return (
    <Card className="p-5">
      <h2 className="font-display text-base font-bold tracking-tight text-ink-900">Bilder</h2>
      <p className="sr-only">Sponsorlogo und Produktfotos zu diesem Vorgang</p>
      <p className="mt-1 text-sm text-ink-600">
        Höchstens 2 MB je Bild, PNG, JPEG oder WebP. Verkleinert wird nichts – was du hochlädst,
        wird so verschickt und so angezeigt.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        <Feld
          vorgang={vorgang}
          token={token}
          art="sponsor"
          titel="Sponsorlogo"
          hinweis={
            sponsor
              ? `Geht als Druckdatei mit der Anfrage an die Händler (${sponsor}).`
              : "Geht als Druckdatei mit der Anfrage an die Händler."
          }
          vorhanden={sponsorLogo}
          bildAdresse={adresse("sponsor")}
        />

        {mitId.map((a) => (
          <Feld
            key={a.id}
            vorgang={vorgang}
            token={token}
            art="artikel"
            artikelId={a.id}
            titel={a.name}
            hinweis="Sehen die Spieler, wenn sie ihre Größe eintragen."
            vorhanden={Boolean(a.hatBild)}
            bildAdresse={adresse("artikel", a.id)}
          />
        ))}
      </div>
    </Card>
  );
}
