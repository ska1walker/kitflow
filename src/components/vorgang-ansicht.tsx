"use client";

import { Badge, Card, Fliese } from "./ui";
import { IconArrowRight, IconBell, IconCheck, IconStop } from "./icons";
import { LETZTE_STUFE, stufe as stufeVon } from "@/lib/stufen";
import { naechsterSchritt, statusText } from "@/lib/texte";
import type { Ansicht, StufeNr, Vorgang } from "@/lib/typen";
import type { MailEmpfaenger } from "@/lib/vorgaenge";
import { Schrittleiste } from "./schrittleiste";
import { VoranfrageKarte } from "./voranfrage-karte";
import { NachtragKarte } from "./nachtrag-karte";
import { BilderKarte } from "./bilder-karte";
import { MailKarte } from "./mail-karte";
import {
  ArtikelKarte,
  GeldKarte,
  GroessenKarte,
  HaendlerKarte,
  MeineKarte,
  VerlaufKarte,
} from "./karten";

/** Statuskopf: eine Überschrift, ein Satz, die Schrittleiste. Mehr nicht. */
function StatusKopf({ vorgang, ansicht }: { vorgang: Vorgang; ansicht: Ansicht }) {
  const s = stufeVon(vorgang.stufe);
  const Icon = s.icon;
  const laeuft = vorgang.stufe < LETZTE_STUFE;

  return (
    <Card className="px-5 pt-[22px] pb-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow text-pitch-600">Vorgang {vorgang.nummer}</span>
        {vorgang.stufe > LETZTE_STUFE && <Badge tone="red">abgebrochen</Badge>}
      </div>
      <h1 className="font-display mt-1.5 text-3xl font-extrabold tracking-tight text-ink-900">
        {vorgang.titel}
      </h1>
      <p className="mt-1 text-sm text-ink-600">
        {ansicht === "spieler" ? vorgang.spielerGruss : vorgang.untertitel}
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
          <p className="max-w-[38rem] text-pretty text-ink-600">{statusText(vorgang, ansicht)}</p>
        </div>
      </div>

      <Schrittleiste stand={vorgang.stufe} standText={vorgang.stand} />
    </Card>
  );
}

/** Wer als Nächstes am Zug ist – die Frage, die alle drei Rollen teilen. */
function NaechsterSchritt({ vorgang, ansicht }: { vorgang: Vorgang; ansicht: Ansicht }) {
  const naechster = naechsterSchritt(vorgang, ansicht);

  if (!naechster) {
    // Abgeschlossen ist ein Erfolg, abgebrochen nicht – das darf nicht gleich aussehen.
    const abgebrochen = vorgang.stufe > LETZTE_STUFE;
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
  vorgang,
  ansicht,
  onDemo,
  voranfrage,
  nachtrag,
  verteiler,
  bilder,
}: {
  vorgang: Vorgang;
  ansicht: Ansicht;
  onDemo: (text: string) => void;
  /** Nur am Trainer-Link gesetzt: die beiden Wege aus der Voranfrage heraus. */
  voranfrage?: { ergaenzen: string; token: string };
  /** Nur am Trainer-Link und nur auf Stufe 1: wer noch nachruecken kann. */
  nachtrag?: { token: string; personen: { id: string; name: string }[] };
  /** Nur am Trainer-Link und nur auf Stufe 1: wer die Größen-Mail bekommen kann. */
  verteiler?: { token: string; frist: string; empfaenger: MailEmpfaenger[] };
  /** Nur am Trainer-Link: Sponsorlogo und Produktfotos pflegen. */
  bilder?: { token: string };
}) {
  // Bei einem Abbruch stehen die Karten auf dem Stand, den der Vorgang erreicht
  // hatte. Kopf und naechster Schritt sprechen weiter vom Abbruch selbst.
  const stand: StufeNr =
    vorgang.stufe > LETZTE_STUFE ? (vorgang.abbruchBei ?? LETZTE_STUFE) : vorgang.stufe;

  if (ansicht === "spieler") {
    return (
      <>
        <StatusKopf vorgang={vorgang} ansicht={ansicht} />
        <NaechsterSchritt vorgang={vorgang} ansicht={ansicht} />
        <MeineKarte vorgang={vorgang} stand={stand} onDemo={onDemo} />
        <VerlaufKarte vorgang={vorgang} stand={vorgang.stufe} ansicht={ansicht} />
      </>
    );
  }

  // In der Voranfrage gibt es noch keine Groessen und keine Haendler. Eine
  // Groessenkarte mit „0 von 0“ und dem Abzeichen „laeuft“ waere schlicht
  // unwahr: es laeuft nichts, es haengt bewusst noch niemand am Vorgang.
  // Ab der Auswahl ruecken Haendler und Geld nach vorn, die Groessen sind erledigt.
  // Auf Stufe 1 gibt es noch keine Haendler, dann steht die Groessenkarte allein.
  const arbeitsKarten =
    stand === 0
      ? []
      : stand >= 4
      ? [
          <HaendlerKarte key="haendler" vorgang={vorgang} stand={stand} />,
          <GeldKarte key="geld" vorgang={vorgang} stand={stand} />,
        ]
      : stand >= 2
        ? [
            <GroessenKarte key="groessen" vorgang={vorgang} stand={stand} onDemo={onDemo} />,
            <HaendlerKarte key="haendler" vorgang={vorgang} stand={stand} />,
          ]
        : [<GroessenKarte key="groessen" vorgang={vorgang} stand={stand} onDemo={onDemo} />];

  return (
    <>
      <StatusKopf vorgang={vorgang} ansicht={ansicht} />
      <NaechsterSchritt vorgang={vorgang} ansicht={ansicht} />

      {vorgang.stufe === 0 && voranfrage && (
        <VoranfrageKarte
          vorgang={vorgang.nummer}
          ergaenzen={voranfrage.ergaenzen}
          token={voranfrage.token}
        />
      )}

      {verteiler && verteiler.empfaenger.length > 0 && (
        <MailKarte
          vorgang={vorgang.nummer}
          token={verteiler.token}
          frist={verteiler.frist}
          empfaenger={verteiler.empfaenger}
        />
      )}

      {/* Ein Groessencheck bestellt nichts und braucht kein Sponsorlogo; nach
          Stufe 1 ist die Anfrage raus und ein neues Bild kaeme zu spaet. */}
      {bilder && !vorgang.nurGroessen && vorgang.stufe <= 1 && (
        <BilderKarte
          vorgang={vorgang.nummer}
          token={bilder.token}
          artikel={vorgang.artikel}
          sponsorLogo={Boolean(vorgang.sponsorLogo)}
          sponsor={vorgang.sponsor}
        />
      )}

      {nachtrag && (
        <NachtragKarte
          vorgang={vorgang.nummer}
          token={nachtrag.token}
          personen={nachtrag.personen}
        />
      )}

      {arbeitsKarten.length === 0 ? null : arbeitsKarten.length === 1 ? (
        arbeitsKarten[0]
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2">{arbeitsKarten}</div>
      )}

      {/* Ein Größencheck hat keine Artikel und bekommt nie welche. „Die Artikel
          stehen fest, sobald die Positionen am Vorgang hängen“ wäre dort ein
          Versprechen, das niemand einlöst. */}
      {vorgang.nurGroessen ? (
        <VerlaufKarte vorgang={vorgang} stand={vorgang.stufe} ansicht={ansicht} />
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2">
          <ArtikelKarte vorgang={vorgang} stand={stand} />
          <VerlaufKarte vorgang={vorgang} stand={vorgang.stufe} ansicht={ansicht} />
        </div>
      )}
    </>
  );
}
