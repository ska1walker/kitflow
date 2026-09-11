"use client";

import { useActionState, useState } from "react";
import { abschicken } from "./formular";
import { Badge, Button, Card, SelectFeld } from "./ui";
import { IconCheck } from "./icons";
import { angabenErgaenzen, type Ergebnis } from "@/app/e/[vorgang]/aktion";
import { BEFLOCKUNGEN } from "@/lib/mannschaften";
import type { Voranfrage, VoranfrageArtikel } from "@/lib/ergaenzen";

const LEER: Ergebnis = { stand: "leer" };

const EINGABE =
  "w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 focus:border-pitch-400 focus:ring-2 focus:ring-pitch-100 focus:outline-none";

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

/**
 * Eine Artikelzeile. Oben steht unveränderlich, was aus der Voranfrage kommt;
 * gefragt wird nur das, was der Händler für ein verbindliches Angebot braucht.
 */
function ArtikelBlock({ artikel }: { artikel: VoranfrageArtikel }) {
  const [beflockung, setBeflockung] = useState("Standard");
  const id = artikel.positionId;
  const bereich =
    artikel.groesseVon && artikel.groesseBis
      ? `${artikel.groesseVon} bis ${artikel.groesseBis}`
      : "ohne Größe";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-ink-200 p-4">
      <div>
        <b className="text-sm text-ink-900">
          {[artikel.hersteller, artikel.bezeichnung].filter(Boolean).join(" ")}
        </b>
        <p className="mt-0.5 text-xs text-ink-500">
          {artikel.groessenartLabel} · {bereich} · {artikel.stueck} Stück je Person
        </p>
      </div>

      <Feld
        label="Artikelnummer des Herstellers"
        hinweis="Die Händler brauchen für ein vergleichbares Angebot die genaue Artikelnummer des Herstellers. Du findest sie im Katalog oder Onlineshop des Herstellers beim jeweiligen Artikel."
      >
        <input
          name={`pos-${id}-herstellernummer`}
          defaultValue={artikel.herstellernummer}
          required
          className={EINGABE}
          placeholder="211943"
        />
      </Feld>

      <div className="grid gap-3 sm:grid-cols-2">
        <Feld label="Farbe">
          <input
            name={`pos-${id}-farbe`}
            defaultValue={artikel.farbe}
            className={EINGABE}
            placeholder="Weiß"
          />
        </Feld>
        <Feld label="Für wen">
          <SelectFeld name={`pos-${id}-fuer`} defaultValue="alle">
            {FUER.map((f) => (
              <option key={f.wert} value={f.wert}>
                {f.label}
              </option>
            ))}
          </SelectFeld>
        </Feld>
      </div>

      <Feld label="Beflockung">
        <SelectFeld
          name={`pos-${id}-beflockung`}
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

      {beflockung === "Abweichend" ? (
        <Feld label="Wie soll abweichend beflockt werden?">
          <textarea name={`pos-${id}-beflockung-text`} rows={2} required className={EINGABE} />
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
          Der Vorgang {ergebnis.vorgang} wurde abgebrochen, weil kein Kontakt zu dieser Mannschaft
          gehört. Ohne Personen gibt es keine Größen und nichts anzufragen. Melde dich bitte bei der
          Geschäftsstelle, damit die Mannschaft in HubSpot gepflegt wird.
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
            {ergebnis.vorgang} ist vollständig
          </h1>
          <p className="mt-1.5 text-sm text-ink-600">
            Unten stehen die persönlichen Links für deine {ergebnis.personen.length} Spielerinnen
            und Spieler. Wenn alle eingetragen haben, prüfst du die Liste, danach geht die Anfrage
            an beide Händler.
          </p>
          <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-ink-700">
            Den Mailversand gibt es noch nicht. Kopier dir diese Seite, die Links stehen sonst
            nirgends.
          </p>

          <div className="mt-4 flex flex-col gap-2">
            <a
              href={ergebnis.trainerStatus}
              className="text-sm font-semibold text-pitch-700 underline"
            >
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
 * F1b · Angaben vervollständigen (docs/formulare.md).
 *
 * Der zweite Halt des einfachen Wegs: aus der Voranfrage wird ein vollständiger
 * Vorgang. Erst hier steht die Zahlungsregel – vorher gab es nur einen
 * unverbindlichen Richtpreis.
 */
export function ErgaenzenFormular({
  voranfrage,
  token,
}: {
  voranfrage: Voranfrage;
  token: string;
}) {
  const [ergebnis, absenden, laeuft] = useActionState(
    angabenErgaenzen.bind(null, voranfrage.vorgang, token),
    LEER,
  );

  if (ergebnis.stand === "fertig") return <Fertig ergebnis={ergebnis.ergebnis} />;

  return (
    <form onSubmit={abschicken(absenden)} className="flex flex-col gap-4">
      <Card className="p-6">
        <span className="eyebrow text-pitch-600">Voranfrage {voranfrage.vorgang}</span>
        <h1 className="font-display mt-1.5 text-2xl font-extrabold tracking-tight text-ink-900">
          Angaben vervollständigen
        </h1>
        <p className="mt-1.5 text-sm text-ink-600">
          {voranfrage.mannschaft} · {voranfrage.ausstattungsart} · geschätzt{" "}
          {voranfrage.personenGeschaetzt} Personen. Jetzt kommt dazu, was die Händler für ein
          verbindliches Angebot brauchen. Danach bekommt deine Mannschaft die Größenlinks.
        </p>
      </Card>

      <Card className="flex flex-col gap-3 p-6">
        <h2 className="font-display text-lg font-bold text-ink-900">Artikel</h2>
        <p className="text-sm text-ink-600">
          Bezeichnung, Größenbereich und Stückzahl stehen fest. Ändern lassen sie sich hier nicht –
          dafür meldest du einen neuen Bedarf.
        </p>
        {voranfrage.artikel.map((artikel) => (
          <ArtikelBlock key={artikel.positionId} artikel={artikel} />
        ))}
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
          <input name="sponsor" defaultValue={voranfrage.sponsor} className={EINGABE} />
        </Feld>
        <Feld label="Hinweise" hinweis="Optional, geht mit in die Anfrage an die Händler.">
          <textarea name="hinweise" rows={3} defaultValue={voranfrage.hinweise} className={EINGABE} />
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

        {ergebnis.stand === "fehler" && (
          <p className="rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-800">{ergebnis.text}</p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={laeuft}>
            {laeuft ? "Wird gespeichert…" : "Größen jetzt abfragen"}
          </Button>
          {laeuft && <Badge tone="outline">einen Moment</Badge>}
        </div>
      </Card>
    </form>
  );
}
