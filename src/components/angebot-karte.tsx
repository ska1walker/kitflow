"use client";

import { useActionState, useState } from "react";
import { Button, Card, SelectFeld } from "./ui";
import { IconCheck, IconStop } from "./icons";
import { angebotSetzen, lieferantWaehlen, type AngebotStand } from "@/app/sparte/aktion";
import { BILD_GRENZE_BYTES, type VorgangsZeile } from "@/lib/typen";

/**
 * Die Angebote der Händler eintragen und eines wählen.
 *
 * **Der Weg zurück, der bis zum 20.09.2026 fehlte.** M4 bittet die Händler um
 * Preis, Gültigkeit und Lieferzeit — und danach gab es keine Stelle, an der
 * diese Angaben landen konnten. Die zehn Spalten dafür gibt es seit Migration
 * 001; geschrieben hat sie niemand. Die Folge reichte weiter, als es aussieht:
 * ohne Betrag gibt es keine Deckung, und ohne Deckung ist „Bestellt" auf der
 * Stufenkarte nie mehr als eine Rückfrage.
 *
 * **Von Hand, nicht als Upload für die Händler.** Bormann und Hillebrecht
 * schicken seit Jahren PDFs per Mail; ob sie stattdessen einen Link benutzen,
 * entscheidet kein Code, sondern ein Gespräch. Zwei Angebote ein paar Mal im
 * Jahr abzutippen sind Minuten. Wird die Frage anders beantwortet, bedient
 * derselbe Weg auch eine Strecke von außen — geschrieben wird dasselbe.
 */

const HAENDLER = ["Intersport Uelzen", "11teamsports"];

const EINGABE =
  "w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 focus:border-pitch-400 focus:ring-2 focus:ring-pitch-100 focus:outline-none";

function Feld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-ink-700">{label}</span>
      {children}
    </label>
  );
}

export function AngebotKarte({ zeilen }: { zeilen: VorgangsZeile[] }) {
  const [stand, absenden, laeuft] = useActionState<AngebotStand, FormData>(angebotSetzen, {
    stand: "leer",
  });
  const [wahl, waehlen, waehltGerade] = useActionState<AngebotStand, FormData>(lieferantWaehlen, {
    stand: "leer",
  });
  const [zuGross, setZuGross] = useState(false);

  // Vor der Anfrage gibt es nichts anzubieten, nach dem Bestellen nichts mehr zu
  // ändern. Ab 6 gehört die Zahl zur Bestellung und nicht mehr zum Angebot.
  const offen = zeilen.filter((z) => z.stufe >= 2 && z.stufe <= 5);
  if (offen.length === 0) return null;

  return (
    <Card className="p-5">
      <h2 className="font-display text-base font-bold text-ink-900">Angebot eintragen</h2>
      <p className="mt-1 text-sm text-ink-600">
        Was der Händler geantwortet hat. Das PDF ist freiwillig – aber damit liegt das Angebot am
        Vorgang statt in einem Postfach. Stehen beide Beträge, wandert der Vorgang auf „Angebote
        da“.
      </p>

      <form action={absenden} className="mt-4 flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Feld label="Vorgang">
            <SelectFeld name="vorgang" defaultValue={offen[0]?.nummer}>
              {offen.map((z) => (
                <option key={z.nummer} value={z.nummer}>
                  {z.nummer} · {z.mannschaft}
                </option>
              ))}
            </SelectFeld>
          </Feld>
          <Feld label="Händler">
            <SelectFeld name="haendler" defaultValue={HAENDLER[0]}>
              {HAENDLER.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </SelectFeld>
          </Feld>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Feld label="Betrag in Euro">
            <input name="betrag" inputMode="decimal" placeholder="840,00" className={EINGABE} />
          </Feld>
          <Feld label="Angebot vom">
            <input type="date" name="am" className={EINGABE} />
          </Feld>
          <Feld label="Gültig bis">
            <input type="date" name="gueltig_bis" className={EINGABE} />
          </Feld>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Feld label="Lieferzeit">
            <input name="lieferzeit" placeholder="3 Wochen ab Bestellung" className={EINGABE} />
          </Feld>
          <Feld label="Abweichungen vom Angefragten">
            <input name="abweichung" placeholder="Farbe nur in Marine" className={EINGABE} />
          </Feld>
        </div>

        <Feld label="Das Angebot als PDF (freiwillig)">
          <input
            type="file"
            name="datei"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            onChange={(e) => setZuGross((e.target.files?.[0]?.size ?? 0) > BILD_GRENZE_BYTES)}
            className="text-xs text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink-800"
          />
        </Feld>

        <div>
          <Button type="submit" disabled={laeuft || zuGross}>
            {laeuft ? "…" : "Angebot speichern"}
          </Button>
        </div>

        {/* Dieselbe Falle wie bei den Bildern: Next kappt den Körper einer
            Server Action, und diese Absage erreicht den eigenen Code nie. */}
        {zuGross && (
          <p className="text-sm text-red-700">Die Datei ist zu groß. Bitte höchstens 2 MB.</p>
        )}
        {!zuGross && stand.stand === "fehler" && (
          <p className="flex items-start gap-2 text-sm text-ink-700">
            <span className="mt-0.5 flex-none text-ink-500">
              <IconStop width={16} height={16} />
            </span>
            {stand.text}
          </p>
        )}
        {stand.stand === "fertig" && (
          <p className="flex items-start gap-2 text-sm text-ink-700">
            <span className="mt-0.5 flex-none text-signal-600">
              <IconCheck width={16} height={16} />
            </span>
            {stand.nummer}: Angebot von {stand.haendler} gespeichert.
            {stand.beide
              ? " Beide Angebote sind da – der Vorgang ist weiter."
              : " Das zweite fehlt noch."}
          </p>
        )}
      </form>

      <hr className="my-5 border-ink-100" />

      <h3 className="text-sm font-bold text-ink-900">Händler wählen</h3>
      <p className="mt-1 text-sm text-ink-600">
        Erst damit steht der Betrag fest, an dem die Deckung gemessen wird. Ohne Wahl gilt jeder
        Vorgang als ungedeckt.
      </p>

      <form action={waehlen} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:flex-1">
          <Feld label="Vorgang">
            <SelectFeld name="vorgang" defaultValue={offen[0]?.nummer}>
              {offen.map((z) => (
                <option key={z.nummer} value={z.nummer}>
                  {z.nummer} · {z.mannschaft}
                </option>
              ))}
            </SelectFeld>
          </Feld>
        </div>
        <div className="sm:flex-1">
          <Feld label="Bestellt wird bei">
            <SelectFeld name="haendler" defaultValue={HAENDLER[0]}>
              {HAENDLER.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </SelectFeld>
          </Feld>
        </div>
        <Button type="submit" disabled={waehltGerade}>
          {waehltGerade ? "…" : "Wählen"}
        </Button>
      </form>

      {wahl.stand === "fehler" && <p className="mt-2 text-sm text-ink-700">{wahl.text}</p>}
      {wahl.stand === "gewaehlt" && (
        <p className="mt-2 text-sm text-ink-700">
          {wahl.nummer}: {wahl.haendler} gewählt.
        </p>
      )}
    </Card>
  );
}
