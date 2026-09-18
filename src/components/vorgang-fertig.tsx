"use client";

import { Card } from "./ui";
import { IconCheck } from "./icons";
import type { BedarfErgebnis } from "@/lib/bedarf";

/**
 * Die Danke-Seite eines angelegten Vorgangs.
 *
 * Stand bis zum 18.09. in `bedarf-formular.tsx`. Sie liegt hier, weil sie seit
 * dem Bestaetigungsklick von zwei Stellen gezeigt wird: frueher entstand der
 * Vorgang beim Abschicken von F1, heute erst beim Klick auf den Link in der
 * Bestaetigungsmail (`/neu/bestaetigen/...`).
 */
export function VorgangFertig({ ergebnis }: { ergebnis: BedarfErgebnis }) {
  if (ergebnis.ohnePersonen) {
    return (
      <Card className="p-6">
        <h1 className="font-display text-xl font-bold tracking-tight text-ink-900">
          Zu dieser Mannschaft ist niemand hinterlegt
        </h1>
        <p className="mt-1.5 text-sm text-ink-600">
          Der Vorgang {ergebnis.vorgang} wurde angelegt und gleich wieder abgebrochen, weil kein
          Kontakt zu dieser Mannschaft gehört. Melde dich bitte bei der Geschäftsstelle, damit die
          Mannschaft in HubSpot gepflegt wird, und meld den Bedarf danach neu.
        </p>
      </Card>
    );
  }

  if (ergebnis.modus === "voranfrage") {
    return (
      <Card className="p-6">
        <div className="flex items-start gap-3.5">
          <span className="mt-0.5 flex-none text-pitch-700">
            <IconCheck width={22} height={22} />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold tracking-tight text-ink-900">
              Voranfrage {ergebnis.vorgang} steht
            </h1>
            <p className="mt-1.5 text-sm text-ink-600">
              Bitte gib die Nummer bei allen Rückfragen an. Mit dem Richtpreis kannst du einen
              Sponsor ansprechen. Es wurden noch keine Größen abgefragt und niemand angeschrieben.
            </p>
            {ergebnis.mailAn ? (
              <p className="mt-3 rounded-xl bg-pitch-50 px-3.5 py-3 text-sm text-ink-700">
                Die Mail mit allen Links ist an {ergebnis.mailAn} unterwegs. Unten stehen sie
                trotzdem, falls sie nicht ankommt.
              </p>
            ) : (
              <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-ink-700">
                Es ist keine Mail rausgegangen. Kopier dir diese Seite, die Links stehen sonst
                nirgends.
              </p>
              )}

            <div className="mt-4 flex flex-col gap-2">
              <a
                href={ergebnis.trainerStatus}
                className="text-sm font-semibold text-pitch-700 underline"
              >
                Dein Status-Link
              </a>
              <a
                href={ergebnis.ergaenzen}
                className="text-sm font-semibold text-pitch-700 underline"
              >
                Angaben vervollständigen und Größen starten
              </a>
            </div>

            <p className="mt-4 text-sm text-ink-600">
              Sobald die Finanzierung klar ist, öffnest du den zweiten Link. Dort kommen
              Artikelnummer, Beflockung, Frist und Lieferadresse dazu – danach bekommt deine
              Mannschaft die Größenlinks.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  // Ein Vorgang fuer genau eine Person bekommt denselben Weg, aber nicht
  // denselben Satz: „deine 1 Spielerinnen und Spieler“ waere schlicht falsch.
  const eine = ergebnis.anzahl === 1;

  return (
    <Card className="p-6">
      <div className="flex items-start gap-3.5">
        <span className="mt-0.5 flex-none text-pitch-700">
          <IconCheck width={22} height={22} />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold tracking-tight text-ink-900">
            Vorgang {ergebnis.vorgang} ist angelegt
          </h1>
          <p className="mt-1.5 text-sm text-ink-600">
            {ergebnis.nurGroessen
              ? `Bitte gib die Nummer bei allen Rückfragen an. Wenn alle ihre Größe eingetragen haben, prüfst du die Liste – damit ist der Vorgang fertig. Bestellt wird nichts.`
              : eine
                ? "Bitte gib die Nummer bei allen Rückfragen an. Sobald die Größe eingetragen ist, prüfst du die Liste, danach geht die Anfrage an beide Händler."
                : `Bitte gib die Nummer bei allen Rückfragen an. Es geht um ${ergebnis.anzahl} Spielerinnen und Spieler. Wenn alle eingetragen haben, prüfst du die Liste, danach geht die Anfrage an beide Händler.`}
          </p>

          {/* Diese Seite hat kein Token: sie ist über /neu für jeden erreichbar.
              Deshalb stehen hier keine Namen und keine persönlichen Links —
              die gehen ausschließlich per Mail an die Adresse, die vorher als
              Kontakt bestätigt wurde. */}
          {ergebnis.mailAn ? (
            <p className="mt-3 rounded-xl bg-pitch-50 px-3.5 py-3 text-sm text-ink-700">
              Die Mail mit allen persönlichen Links ist an {ergebnis.mailAn} unterwegs. Aus
              Datenschutzgründen stehen die Namen und die Links nur dort und nicht auf dieser
              Seite.
            </p>
          ) : (
            <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-ink-700">
              Es ist keine Mail rausgegangen. Über deinen Status-Link unten kommst du trotzdem an
              alles heran — heb ihn dir auf.
            </p>
          )}

          <div className="mt-4 flex flex-col gap-2">
            <a href={ergebnis.trainerStatus} className="text-sm font-semibold text-pitch-700 underline">
              Dein Status-Link
            </a>
            <a href={ergebnis.bestaetigen} className="text-sm font-semibold text-pitch-700 underline">
              Liste prüfen und bestätigen
            </a>
          </div>

          <p className="mt-4 text-sm text-ink-500">
            Über den Status-Link verschickst du die Größen-Mail an die Leute, die du auswählst —
            dort stehen auch die Namen.
          </p>
        </div>
      </div>
    </Card>
  );
}

