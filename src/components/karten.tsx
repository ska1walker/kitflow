"use client";

import type { ReactNode } from "react";
import { Badge, Button, Card } from "./ui";
import { IconBell, IconCheck } from "./icons";
import {
  ABBRUCH_BEI,
  ABBRUCH_EREIGNIS,
  ARTIKEL,
  EREIGNISSE,
  LETZTE_STUFE,
  FEHLENDE_GROESSEN,
  GROESSEN_EINGETRAGEN,
  GROESSEN_GESAMT,
  HAENDLER,
  MEINE_AUSSTATTUNG,
  MEINE_AUSSTATTUNG_HINWEIS,
} from "@/lib/beispieldaten";
import type { Ansicht, Artikel, ArtikelFuer, StufeNr } from "@/lib/typen";

/** Kartenkopf: Titel links, Status oder Randnotiz rechts. */
function KartenKopf({ titel, rechts }: { titel: string; rechts?: ReactNode }) {
  return (
    <div className="mb-3.5 flex items-center justify-between gap-3">
      <h3 className="font-display text-lg font-bold text-ink-900">{titel}</h3>
      {rechts}
    </div>
  );
}

/**
 * Größen: bis die Liste vollständig ist, das Kernstück der Trainer-Ansicht.
 * Danach nur noch Beleg, dass der Trainer sie bestätigt hat.
 */
export function GroessenKarte({
  stand,
  onDemo,
}: {
  stand: StufeNr;
  onDemo: (text: string) => void;
}) {
  const laeuft = stand === 1;
  const eingetragen = laeuft ? GROESSEN_EINGETRAGEN : GROESSEN_GESAMT;
  const anteil = (eingetragen / GROESSEN_GESAMT) * 100;

  return (
    <Card className="p-5">
      <KartenKopf
        titel="Größen"
        rechts={
          laeuft ? (
            <Badge tone="amber">läuft</Badge>
          ) : (
            <Badge tone="pitch">
              <IconCheck width={14} height={14} />
              komplett
            </Badge>
          )
        }
      />

      <div className="flex items-baseline gap-1.5">
        <strong className="tnum text-[32px] leading-none font-extrabold tracking-[-0.03em]">
          {eingetragen}
        </strong>
        <span className="text-ink-600">von {GROESSEN_GESAMT} eingetragen</span>
      </div>

      <div className="mt-2.5 mb-3 h-1.5 overflow-hidden rounded-full bg-ink-100">
        <div className="h-full rounded-full bg-pitch-600" style={{ width: `${anteil}%` }} />
      </div>

      {laeuft ? (
        <>
          <ul className="flex flex-col gap-1.5">
            {FEHLENDE_GROESSEN.map((person) => (
              <li
                key={person}
                className="flex items-center justify-between gap-2.5 rounded-lg bg-ink-50 px-2.5 py-2 text-sm"
              >
                <span>{person}</span>
                <Badge tone="amber">fehlt</Badge>
              </li>
            ))}
          </ul>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <Button
              onClick={() => onDemo("Erinnerung verschickt – im Entwurf passiert noch nichts.")}
            >
              <IconBell width={16} height={16} />
              Erinnerung an {FEHLENDE_GROESSEN.length} senden
            </Button>
            <Button
              variante="sekundaer"
              onClick={() => onDemo("Hier öffnet sich später die Größenabfrage für diese Person.")}
            >
              Größe selbst eintragen
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-ink-600">
            Liste am 09.09. von dir bestätigt. 17 Feldspieler, 1 Torwart.
          </p>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <Button
              variante="sekundaer"
              onClick={() => onDemo("Hier öffnet sich später die Größenliste.")}
            >
              Liste ansehen
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function Zeile({ titel, unter, rechts }: { titel: string; unter: string; rechts: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-ink-100 py-[11px] first:border-t-0 first:pt-0">
      <div className="flex min-w-0 flex-col">
        <b className="text-sm font-semibold">{titel}</b>
        <small className="text-xs text-ink-500">{unter}</small>
      </div>
      {rechts}
    </div>
  );
}

/** Händler: jede Anfrage geht an beide, damit es ein Vergleichsangebot gibt. */
export function HaendlerKarte({ stand }: { stand: StufeNr }) {
  if (stand < 2) return null;

  function status(gewaehlt: boolean, angebotAm: string) {
    if (stand >= 4) {
      return gewaehlt ? (
        <Badge tone="pitch">
          <IconCheck width={14} height={14} />
          gewählt
        </Badge>
      ) : (
        <Badge tone="neutral">nicht gewählt</Badge>
      );
    }
    if (stand >= 3) return <Badge tone="outline">Angebot da · {angebotAm}</Badge>;
    return <Badge tone="amber">angefragt · 09.09.</Badge>;
  }

  return (
    <Card className="p-5">
      <KartenKopf
        titel="Händler"
        rechts={<span className="text-xs text-ink-400">jede Anfrage geht an beide</span>}
      />
      <div className="flex flex-col">
        {HAENDLER.map((h) => (
          <Zeile
            key={h.name}
            titel={h.name}
            unter={h.ansprechpartner}
            rechts={status(h.gewaehlt, h.angebotAm)}
          />
        ))}
      </div>
    </Card>
  );
}

/**
 * Finanzierung: erst ab der Auswahl relevant. Bestellt wird erst, wenn das Geld
 * da ist. Eine Zusage allein macht nie bestellbar (docs/konzept.md).
 */
export function GeldKarte({ stand }: { stand: StufeNr }) {
  if (stand < 4) return null;
  const geldDa = stand >= 5;

  return (
    <Card className="p-5">
      <KartenKopf
        titel="Finanzierung"
        rechts={
          <Badge tone={geldDa ? "pitch" : "amber"}>
            {geldDa ? "Deckung erfüllt" : "wartet auf Geld"}
          </Badge>
        }
      />
      <div className="flex flex-col">
        <Zeile
          titel="Sponsor VGH"
          unter="übernimmt den Trikotsatz komplett"
          rechts={<Badge tone="outline">zugesagt</Badge>}
        />
        <Zeile
          titel="Eingang Vereinskonto"
          unter="Bestellt wird erst danach"
          rechts={
            geldDa ? (
              <Badge tone="pitch">
                <IconCheck width={14} height={14} />
                18.09.
              </Badge>
            ) : (
              <Badge tone="neutral">offen</Badge>
            )
          }
        />
      </div>
    </Card>
  );
}

const GRUPPEN: { fuer: ArtikelFuer; titel: string; anzahl: string }[] = [
  { fuer: "feldspieler", titel: "Feldspieler", anzahl: "17 Personen" },
  { fuer: "torwart", titel: "Torwart", anzahl: "1 Person" },
];

function ArtikelGruppe({
  titel,
  anzahl,
  artikel,
}: {
  titel: string;
  anzahl: string;
  artikel: Artikel[];
}) {
  return (
    <div className="mt-3.5 first:mt-0">
      <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-ink-500">
        <span>{titel}</span>
        <span className="tnum">{anzahl}</span>
      </div>
      {artikel.map((a) => (
        <div
          key={a.herstellernummer}
          className="flex justify-between gap-2.5 border-t border-ink-100 py-1.5 text-[13px]"
        >
          <span className="min-w-0">{a.name}</span>
          <code className="font-mono text-[11px] whitespace-nowrap text-ink-500">
            {a.herstellernummer}
          </code>
        </div>
      ))}
    </div>
  );
}

export function ArtikelKarte({ stand }: { stand: StufeNr }) {
  return (
    <Card className="p-5">
      <KartenKopf
        titel="Artikel"
        rechts={<span className="text-xs text-ink-400">Beflockung Standard auf den Trikots</span>}
      />
      {GRUPPEN.map((g) => (
        <ArtikelGruppe
          key={g.fuer}
          titel={g.titel}
          anzahl={g.anzahl}
          artikel={ARTIKEL.filter((a) => a.fuer === g.fuer)}
        />
      ))}
      {stand >= 4 && (
        <p className="mt-3.5 text-xs text-ink-400">
          Größen: 18 von 18, Liste am 09.09. bestätigt. 54 Positionen.
        </p>
      )}
    </Card>
  );
}

/** Spieler-Ansicht: nur die eigenen Größen, nie Beträge (docs/konzept.md). */
export function MeineKarte({
  stand,
  onDemo,
}: {
  stand: StufeNr;
  onDemo: (text: string) => void;
}) {
  return (
    <Card className="p-5">
      <KartenKopf
        titel="Deine Ausstattung"
        rechts={
          stand >= 7 ? (
            <Badge tone="pitch">
              <IconCheck width={14} height={14} />
              beim Trainer
            </Badge>
          ) : (
            <Badge tone="outline">Feldspieler</Badge>
          )
        }
      />
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MEINE_AUSSTATTUNG.map((e) => (
          <div key={e.feld} className="rounded-xl border border-ink-200 px-3 py-2.5">
            <dt className="text-xs font-medium text-ink-500">{e.feld}</dt>
            <dd className="tnum mt-0.5 text-xl font-bold tracking-[-0.02em]">{e.wert}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm text-ink-600">{MEINE_AUSSTATTUNG_HINWEIS}</p>
      {stand === 1 && (
        <div className="mt-3.5 flex flex-wrap gap-2">
          <Button onClick={() => onDemo("Hier öffnet sich später deine Größenabfrage.")}>
            Größen ändern
          </Button>
        </div>
      )}
    </Card>
  );
}

/**
 * Verlauf: nur, was bis zum aktuellen Stand passiert ist, neueste zuerst.
 * Interne Einträge sehen Trainer und Spartenleitung, Spieler nicht.
 */
export function VerlaufKarte({ stand, ansicht }: { stand: StufeNr; ansicht: Ansicht }) {
  // Ein abgebrochener Vorgang hat nie geliefert oder bezahlt: sein Verlauf endet
  // bei der Stufe des Abbruchs und schliesst mit dem Abbruch selbst.
  const abgebrochen = stand > LETZTE_STUFE;
  const bis = abgebrochen ? ABBRUCH_BEI : stand;
  const eintraege = EREIGNISSE.filter(
    (e) => e.ab <= bis && !(ansicht === "spieler" && e.intern),
  ).reverse();
  if (abgebrochen) eintraege.unshift(ABBRUCH_EREIGNIS);

  return (
    <Card className="p-5">
      <KartenKopf
        titel="Verlauf"
        rechts={<span className="text-xs text-ink-400">neueste zuerst</span>}
      />
      <ol className="relative">
        {eintraege.map((e, i) => (
          <li
            key={`${e.datum}-${e.uhrzeit}-${e.text}`}
            className="grid grid-cols-[76px_18px_1fr] gap-2.5 pb-4 last:pb-0 sm:grid-cols-[92px_18px_1fr]"
          >
            <time className="tnum pt-px font-mono text-xs leading-[1.35] text-ink-500">
              <b className="block font-medium text-ink-800">{e.datum}</b>
              {e.uhrzeit}
            </time>

            <span className="relative flex justify-center">
              <span
                className={`z-10 mt-1 h-2.5 w-2.5 rounded-full border-2 ${
                  i === 0 ? "border-pitch-600 bg-pitch-600" : "border-pitch-400 bg-white"
                }`}
              />
              {i < eintraege.length - 1 && (
                <span className="absolute top-4 -bottom-1 w-0.5 bg-ink-200" />
              )}
            </span>

            <p className="text-sm text-ink-800">
              {e.text}
              {e.sub && <small className="mt-px block text-xs text-ink-500">{e.sub}</small>}
            </p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
