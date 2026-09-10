"use client";

import { Badge, Card, Fliese } from "./ui";
import { IconArrowRight, IconBell, IconCheck, IconStop } from "./icons";
import {
  ABBRUCH_BEI,
  LETZTE_STUFE,
  SPIELER_GRUSS,
  STUFEN_TEXTE,
  VORGANG_NUMMER,
  VORGANG_TITEL,
  VORGANG_UNTERTITEL,
  stufe as stufeVon,
} from "@/lib/beispieldaten";
import type { Ansicht, StufeNr } from "@/lib/typen";
import { Schrittleiste } from "./schrittleiste";
import {
  ArtikelKarte,
  GeldKarte,
  GroessenKarte,
  HaendlerKarte,
  MeineKarte,
  VerlaufKarte,
} from "./karten";

/** Statuskopf: eine Überschrift, ein Satz, die Schrittleiste. Mehr nicht. */
function StatusKopf({ stand, ansicht }: { stand: StufeNr; ansicht: Ansicht }) {
  const s = stufeVon(stand);
  const Icon = s.icon;
  const laeuft = stand < LETZTE_STUFE;
  const text = ansicht === "spieler" ? STUFEN_TEXTE[stand].spieler : STUFEN_TEXTE[stand].trainer;

  return (
    <Card className="px-5 pt-[22px] pb-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow text-pitch-600">Vorgang {VORGANG_NUMMER}</span>
        {stand > LETZTE_STUFE && <Badge tone="red">abgebrochen</Badge>}
      </div>
      <h1 className="font-display mt-1.5 text-3xl font-extrabold tracking-tight text-ink-900">
        {VORGANG_TITEL}
      </h1>
      <p className="mt-1 text-sm text-ink-600">
        {ansicht === "spieler" ? SPIELER_GRUSS : VORGANG_UNTERTITEL}
      </p>

      <div className="mt-[22px] flex items-start gap-3.5 border-t border-ink-200 pt-5">
        <Fliese gross puls={laeuft}>
          <Icon width={24} height={24} />
        </Fliese>
        <div>
          <div className="font-mono text-[11px] tracking-[0.12em] text-ink-500 uppercase">
            Aktueller Stand
          </div>
          <h2 className="font-display mt-0.5 mb-1.5 text-2xl font-bold tracking-tight text-ink-900">
            {s.titel}
          </h2>
          <p className="max-w-[38rem] text-pretty text-ink-600">{text}</p>
        </div>
      </div>

      <Schrittleiste stand={stand} />
    </Card>
  );
}

/** Wer als Nächstes am Zug ist – die Frage, die alle drei Rollen teilen. */
function NaechsterSchritt({ stand, ansicht }: { stand: StufeNr; ansicht: Ansicht }) {
  const naechster =
    ansicht === "spieler"
      ? STUFEN_TEXTE[stand].naechsterSpieler
      : STUFEN_TEXTE[stand].naechsterTrainer;

  if (!naechster) {
    // Abgeschlossen ist ein Erfolg, abgebrochen nicht – das darf nicht gleich aussehen.
    const abgebrochen = stand > LETZTE_STUFE;
    return (
      <div
        className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 ${
          abgebrochen ? "border-ink-200 bg-ink-50" : "border-pitch-100 bg-pitch-50"
        }`}
      >
        <span className={`mt-0.5 flex-none ${abgebrochen ? "text-ink-500" : "text-pitch-700"}`}>
          {abgebrochen ? <IconStop width={20} height={20} /> : <IconCheck width={20} height={20} />}
        </span>
        <div>
          <b className="block text-sm">
            {abgebrochen ? "Vorgang abgebrochen" : "Nichts mehr offen"}
          </b>
          <span className="text-sm text-ink-700">
            {abgebrochen
              ? "Es wurde nichts bestellt. Für eine neue Runde legt der Trainer einen neuen Vorgang an."
              : "Dieser Vorgang ist abgeschlossen."}
          </span>
        </div>
      </div>
    );
  }

  const duBistDran = Boolean(naechster.du);

  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 ${
        duBistDran ? "border-amber-200 bg-amber-50" : "border-pitch-100 bg-pitch-50"
      }`}
    >
      <span className={`mt-0.5 flex-none ${duBistDran ? "text-amber-700" : "text-pitch-700"}`}>
        {duBistDran ? (
          <IconBell width={20} height={20} />
        ) : (
          <IconArrowRight width={20} height={20} />
        )}
      </span>
      <div>
        <b className="block text-sm">Als Nächstes: {naechster.wer}</b>
        <span className="text-sm text-ink-700">{naechster.was}</span>
      </div>
    </div>
  );
}

/**
 * Ein Vorgang aus Sicht von Trainer oder Spieler.
 *
 * Trainer sehen, was sie steuern: bis zur Auswahl die Größen und die Händler,
 * danach die Händler und das Geld. Spieler sehen nur ihre eigenen Größen.
 */
export function VorgangAnsicht({
  stand,
  ansicht,
  onDemo,
}: {
  stand: StufeNr;
  ansicht: Ansicht;
  onDemo: (text: string) => void;
}) {
  // Bei einem Abbruch stehen die Karten auf dem Stand, den der Vorgang erreicht
  // hatte. Kopf und naechster Schritt sprechen weiter vom Abbruch selbst.
  const datenStand: StufeNr = stand > LETZTE_STUFE ? ABBRUCH_BEI : stand;

  if (ansicht === "spieler") {
    return (
      <>
        <StatusKopf stand={stand} ansicht={ansicht} />
        <NaechsterSchritt stand={stand} ansicht={ansicht} />
        <MeineKarte stand={datenStand} onDemo={onDemo} />
        <VerlaufKarte stand={stand} ansicht={ansicht} />
      </>
    );
  }

  // Ab der Auswahl ruecken Haendler und Geld nach vorn, die Groessen sind erledigt.
  // Auf Stufe 1 gibt es noch keine Haendler, dann steht die Groessenkarte allein.
  const arbeitsKarten =
    datenStand >= 4
      ? [
          <HaendlerKarte key="haendler" stand={datenStand} />,
          <GeldKarte key="geld" stand={datenStand} />,
        ]
      : datenStand >= 2
        ? [
            <GroessenKarte key="groessen" stand={datenStand} onDemo={onDemo} />,
            <HaendlerKarte key="haendler" stand={datenStand} />,
          ]
        : [<GroessenKarte key="groessen" stand={datenStand} onDemo={onDemo} />];

  return (
    <>
      <StatusKopf stand={stand} ansicht={ansicht} />
      <NaechsterSchritt stand={stand} ansicht={ansicht} />

      {arbeitsKarten.length === 1 ? (
        arbeitsKarten[0]
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2">{arbeitsKarten}</div>
      )}

      <div className="grid items-start gap-4 md:grid-cols-2">
        <ArtikelKarte stand={datenStand} />
        <VerlaufKarte stand={stand} ansicht={ansicht} />
      </div>
    </>
  );
}
