"use client";

import { useActionState, useState } from "react";
import { Badge, Button, Card, SelectFeld } from "./ui";
import { IconCheck } from "./icons";
import { bedarfMelden, type Ergebnis } from "@/app/neu/aktion";
import { GROESSEN_LABEL } from "@/lib/groessen";
import { AUSSTATTUNGSARTEN, BEFLOCKUNGEN, TEAMS } from "@/lib/mannschaften";
import type { Groessenart } from "@/lib/typen";

const LEER: Ergebnis = { stand: "leer" };

const GROESSENARTEN: Groessenart[] = [
  "trikot",
  "oberteil",
  "shorts",
  "trainingshose",
  "schuhe",
  "ohne",
];

const FUER = [
  { wert: "alle", label: "Alle" },
  { wert: "feldspieler", label: "Nur Feldspieler" },
  { wert: "torwart", label: "Nur Torwart" },
];

function Feld({
  label,
  hinweis,
  children,
}: {
  label: string;
  hinweis?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-ink-900">{label}</span>
      {children}
      {hinweis && <span className="text-xs text-ink-500">{hinweis}</span>}
    </label>
  );
}

const EINGABE =
  "w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 focus:border-pitch-400 focus:ring-2 focus:ring-pitch-100 focus:outline-none";

/** Eine Artikelzeile. Die Felder heissen artikel-{i}-…, das liest die Action. */
function ArtikelBlock({ i, entfernen }: { i: number; entfernen?: () => void }) {
  const [beflockung, setBeflockung] = useState("Standard");

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-ink-200 p-4">
      <div className="flex items-center justify-between">
        <b className="text-sm">Artikel {i + 1}</b>
        {entfernen && (
          <button
            type="button"
            onClick={entfernen}
            className="cursor-pointer text-xs text-ink-500 underline"
          >
            entfernen
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Feld label="Hersteller">
          <input name={`artikel-${i}-hersteller`} className={EINGABE} placeholder="Hummel" />
        </Feld>
        <Feld label="Artikelbezeichnung">
          <input
            name={`artikel-${i}-bezeichnung`}
            className={EINGABE}
            placeholder="hmlCORE XK Poly T-Shirt"
          />
        </Feld>
      </div>

      <Feld
        label="Artikelnummer des Herstellers"
        hinweis="Die Händler brauchen für ein vergleichbares Angebot die genaue Artikelnummer des Herstellers. Du findest sie im Katalog oder Onlineshop des Herstellers beim jeweiligen Artikel."
      >
        <input name={`artikel-${i}-herstellernummer`} className={EINGABE} placeholder="211943" />
      </Feld>

      <div className="grid gap-3 sm:grid-cols-3">
        <Feld label="Farbe">
          <input name={`artikel-${i}-farbe`} className={EINGABE} placeholder="Weiß" />
        </Feld>
        <Feld label="Größenart">
          <SelectFeld name={`artikel-${i}-groessenart`} defaultValue="trikot">
            {GROESSENARTEN.map((art) => (
              <option key={art} value={art}>
                {art === "ohne" ? "ohne Größe (z. B. Tasche, Ball)" : GROESSEN_LABEL[art]}
              </option>
            ))}
          </SelectFeld>
        </Feld>
        <Feld label="Stück je Person">
          <input
            type="number"
            name={`artikel-${i}-stueck`}
            min={1}
            max={20}
            defaultValue={1}
            className={`${EINGABE} tnum`}
          />
        </Feld>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Feld label="Für wen">
          <SelectFeld name={`artikel-${i}-fuer`} defaultValue="alle">
            {FUER.map((f) => (
              <option key={f.wert} value={f.wert}>
                {f.label}
              </option>
            ))}
          </SelectFeld>
        </Feld>
        <Feld label="Beflockung">
          <SelectFeld
            name={`artikel-${i}-beflockung`}
            value={beflockung}
            onChange={(e) => setBeflockung(e.target.value)}
          >
            {BEFLOCKUNGEN.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </SelectFeld>
        </Feld>
      </div>

      {beflockung === "Abweichend" ? (
        <Feld label="Wie soll abweichend beflockt werden?">
          <textarea name={`artikel-${i}-beflockung-text`} rows={2} className={EINGABE} />
        </Feld>
      ) : (
        <p className="text-xs text-ink-500">
          Standard heißt: Vereinslogo vorn links, EINTRACHT MUNSTER hinten oben, Rückennummer
          darunter. Sponsorlogo nach Absprache. Hosen, Shorts und Stutzen bleiben ohne Druck.
        </p>
      )}
    </div>
  );
}

/** Die Danke-Seite: bis der Mailversand steht, stehen die Links hier. */
function Fertig({ ergebnis }: { ergebnis: Extract<Ergebnis, { stand: "fertig" }>["ergebnis"] }) {
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
            Bitte gib die Nummer bei allen Rückfragen an. Unten stehen die persönlichen Links für
            deine {ergebnis.personen.length} Spielerinnen und Spieler. Wenn alle eingetragen haben,
            prüfst du die Liste, danach geht die Anfrage an beide Händler.
          </p>
          <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-ink-700">
            Den Mailversand gibt es noch nicht. Kopier dir diese Seite, die Links stehen sonst
            nirgends.
          </p>

          <div className="mt-4 flex flex-col gap-2">
            <a href={ergebnis.trainerStatus} className="text-sm font-semibold text-pitch-700 underline">
              Dein Status-Link
            </a>
            <a href={ergebnis.bestaetigen} className="text-sm font-semibold text-pitch-700 underline">
              Liste prüfen und bestätigen
            </a>
          </div>

          <h2 className="font-display mt-5 mb-2 text-base font-bold text-ink-900">
            Größen-Links für die Mannschaft
          </h2>
          <ul className="flex flex-col gap-1.5">
            {ergebnis.personen.map((p) => (
              <li key={p.groessen} className="min-w-0 text-sm">
                <b>{p.name}</b>
                <br />
                <a href={p.groessen} className="break-all text-xs text-pitch-700 underline">
                  {p.groessen}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

/**
 * F1 · Bedarf melden (docs/formulare.md).
 *
 * Die einzige Seite ohne Token: der Link geht offen an alle Trainer. Die
 * Zahlungsregel ist Pflicht, weil hier die Erwartung entsteht, die später Geld
 * kostet.
 */
export function BedarfFormular() {
  const [ergebnis, absenden, laeuft] = useActionState(bedarfMelden, LEER);
  const [artikel, setArtikel] = useState([0]);

  if (ergebnis.stand === "fertig") return <Fertig ergebnis={ergebnis.ergebnis} />;

  return (
    <form action={absenden} className="flex flex-col gap-4">
      <Card className="p-6">
        <span className="eyebrow text-pitch-600">Ausstattung</span>
        <h1 className="font-display mt-1.5 text-2xl font-extrabold tracking-tight text-ink-900">
          Bedarf melden
        </h1>
        <p className="mt-1.5 text-sm text-ink-600">
          Hier meldest du als Trainerin oder Trainer neuen Ausstattungsbedarf für deine Mannschaft
          an. Danach bekommen deine Spielerinnen und Spieler einen persönlichen Link für ihre
          Größen. Du prüfst die fertige Liste, erst dann geht eine Anfrage an beide Händler
          (Intersport Uelzen und 11teamsports). Die Angebote bekommst du in Kopie.
        </p>
        <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-ink-700">
          Diese Meldung ist noch keine Bestellung. Bestellt wird erst, wenn die Finanzierung steht
          und das Geld da ist.
        </p>
      </Card>

      <Card className="flex flex-col gap-3 p-6">
        <h2 className="font-display text-lg font-bold text-ink-900">Deine Daten</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Feld label="Vorname">
            <input name="vorname" required className={EINGABE} />
          </Feld>
          <Feld label="Nachname">
            <input name="nachname" required className={EINGABE} />
          </Feld>
          <Feld label="E-Mail">
            <input type="email" name="email" required className={EINGABE} />
          </Feld>
          <Feld label="Mobilnummer">
            <input name="telefon" required className={EINGABE} />
          </Feld>
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-6">
        <h2 className="font-display text-lg font-bold text-ink-900">Mannschaft</h2>
        <p className="text-sm text-ink-600">
          Bei Jugendmannschaften die Jahrgänge wählen, zum Beispiel 2014 und 2015.
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
          {TEAMS.map((team) => (
            <label key={team} className="flex items-center gap-2 text-sm text-ink-800">
              <input
                type="checkbox"
                name="teams"
                value={team}
                className="h-4 w-4 flex-none accent-pitch-600"
              />
              {team}
            </label>
          ))}
        </div>
        <Feld label="Welche Mannschaft im Jahrgang?" hinweis="Optional, zum Beispiel JG2014-2015.">
          <input name="mannschaftscode" className={EINGABE} />
        </Feld>
      </Card>

      <Card className="flex flex-col gap-3 p-6">
        <h2 className="font-display text-lg font-bold text-ink-900">Was braucht ihr?</h2>
        {AUSSTATTUNGSARTEN.map((art) => (
          <label key={art} className="flex items-start gap-2.5 text-sm text-ink-800">
            <input
              type="radio"
              name="ausstattungsart"
              value={art}
              required
              className="mt-0.5 h-4 w-4 flex-none accent-pitch-600"
            />
            <span>
              <b>{art}</b>
              <br />
              <span className="text-xs text-ink-500">
                {art === "Trikotsatz"
                  ? "Der Verein ist verantwortlich."
                  : "Zum Beispiel Trainingsanzüge. Die Mannschaft finanziert selbst."}
              </span>
            </span>
          </label>
        ))}
      </Card>

      <Card className="flex flex-col gap-3 p-6">
        <h2 className="font-display text-lg font-bold text-ink-900">Artikel</h2>
        {artikel.map((i, platz) => (
          <ArtikelBlock
            key={i}
            i={i}
            entfernen={
              platz > 0 ? () => setArtikel((alt) => alt.filter((x) => x !== i)) : undefined
            }
          />
        ))}
        <Button
          type="button"
          variante="sekundaer"
          className="self-start"
          onClick={() => setArtikel((alt) => [...alt, Math.max(...alt) + 1])}
        >
          Artikel hinzufügen
        </Button>
      </Card>

      <Card className="flex flex-col gap-3 p-6">
        <h2 className="font-display text-lg font-bold text-ink-900">Fristen und Lieferung</h2>
        <Feld
          label="Frist für die Größen"
          hinweis="Wir empfehlen 10 bis 14 Tage. Wer bis dahin nichts einträgt, bekommt zwei Erinnerungen, danach entscheidest du."
        >
          <input type="date" name="groessen_frist" required className={EINGABE} />
        </Feld>
        <Feld label="Lieferadresse">
          <textarea name="lieferadresse" rows={3} required className={EINGABE} />
        </Feld>
        <Feld label="Sponsor auf der Kleidung" hinweis="Optional, falls schon bekannt.">
          <input name="sponsor" className={EINGABE} />
        </Feld>
        <Feld label="Hinweise" hinweis="Optional, geht mit in die Anfrage an die Händler.">
          <textarea name="hinweise" rows={3} className={EINGABE} />
        </Feld>
      </Card>

      <Card className="flex flex-col gap-3 p-6">
        <label className="flex items-start gap-2.5 text-sm text-ink-800">
          <input
            type="checkbox"
            name="zahlungsregel"
            value="ja"
            required
            className="mt-0.5 h-4 w-4 flex-none accent-pitch-600"
          />
          Ich habe verstanden: Bestellt wird erst, wenn die Finanzierung steht. Zahlt der Verein,
          muss das Geld auf dem Vereinskonto sein. Legt die Mannschaft aus, überweist sie vorab
          direkt an den Händler. Ohne Freigabe der Spartenleitung oder Zusage eines Sponsors bleibt
          die Mannschaft auf den Kosten sitzen.
        </label>

        {/* Honigtopf: für Menschen unerreichbar, Bots füllen ihn aus. */}
        <input
          type="text"
          name="webseite"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute left-[-9999px] h-0 w-0"
        />

        {ergebnis.stand === "fehler" && (
          <p className="rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-800">{ergebnis.text}</p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={laeuft}>
            {laeuft ? "Wird angelegt…" : "Bedarf melden"}
          </Button>
          {laeuft && <Badge tone="outline">einen Moment</Badge>}
        </div>
      </Card>
    </form>
  );
}
