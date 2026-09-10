"use client";

import type { ReactNode } from "react";
import { Badge, Button, Card } from "./ui";
import { IconBell, IconCheck } from "./icons";
import { ABBRUCH_EREIGNIS } from "@/lib/beispieldaten";
import { LETZTE_STUFE } from "@/lib/stufen";
import type { Ansicht, Artikel, ArtikelFuer, StufeNr, Vorgang } from "@/lib/typen";

/** Kartenkopf: Titel links, Status oder Randnotiz rechts. */
function KartenKopf({ titel, rechts }: { titel: string; rechts?: ReactNode }) {
  return (
    <div className="mb-3.5 flex items-center justify-between gap-3">
      <h3 className="font-display text-lg font-bold text-ink-900">{titel}</h3>
      {rechts}
    </div>
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

/**
 * Größen: bis die Liste vollständig ist, das Kernstück der Trainer-Ansicht.
 * Danach nur noch Beleg, dass der Trainer sie bestätigt hat.
 */
export function GroessenKarte({
  vorgang,
  stand,
  onDemo,
}: {
  vorgang: Vorgang;
  stand: StufeNr;
  onDemo: (text: string) => void;
}) {
  const laeuft = stand === 1;
  const eingetragen = laeuft ? vorgang.groessenEingetragen : vorgang.groessenGesamt;
  const anteil = vorgang.groessenGesamt > 0 ? (eingetragen / vorgang.groessenGesamt) * 100 : 0;
  const fehlen = Math.max(0, vorgang.groessenGesamt - eingetragen);

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
        <span className="text-ink-600">von {vorgang.groessenGesamt} eingetragen</span>
      </div>

      <div className="mt-2.5 mb-3 h-1.5 overflow-hidden rounded-full bg-ink-100">
        <div className="h-full rounded-full bg-pitch-600" style={{ width: `${anteil}%` }} />
      </div>

      {laeuft ? (
        <>
          {vorgang.fehlendeGroessen.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {vorgang.fehlendeGroessen.map((person) => (
                <li
                  key={person}
                  className="flex items-center justify-between gap-2.5 rounded-lg bg-ink-50 px-2.5 py-2 text-sm"
                >
                  <span>{person}</span>
                  <Badge tone="amber">fehlt</Badge>
                </li>
              ))}
            </ul>
          ) : (
            // Bei Jugendmannschaften nennt die Seite keine Namen.
            <p className="text-sm text-ink-600">
              {fehlen} von {vorgang.groessenGesamt} fehlen noch.
            </p>
          )}
          <div className="mt-3.5 flex flex-wrap gap-2">
            <Button
              onClick={() => onDemo("Erinnerung verschickt – im Entwurf passiert noch nichts.")}
            >
              <IconBell width={16} height={16} />
              Erinnerung an {fehlen} senden
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
            {vorgang.groessenBestaetigtAm
              ? `Liste am ${vorgang.groessenBestaetigtAm} von dir bestätigt. `
              : "Liste von dir bestätigt. "}
            {vorgang.feldspielerAnzahl} Feldspieler, {vorgang.torwartAnzahl} Torwart.
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

/** Händler: jede Anfrage geht an beide, damit es ein Vergleichsangebot gibt. */
export function HaendlerKarte({ vorgang, stand }: { vorgang: Vorgang; stand: StufeNr }) {
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
    return <Badge tone="amber">angefragt</Badge>;
  }

  return (
    <Card className="p-5">
      <KartenKopf
        titel="Händler"
        rechts={<span className="text-xs text-ink-400">jede Anfrage geht an beide</span>}
      />
      <div className="flex flex-col">
        {vorgang.haendler.map((h) => (
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
export function GeldKarte({ vorgang, stand }: { vorgang: Vorgang; stand: StufeNr }) {
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
          titel={vorgang.sponsor ? `Sponsor ${vorgang.sponsor}` : "Finanzierung"}
          unter="übernimmt den Satz komplett"
          rechts={
            vorgang.finanzierungZugesagt ? (
              <Badge tone="outline">zugesagt</Badge>
            ) : (
              <Badge tone="neutral">offen</Badge>
            )
          }
        />
        <Zeile
          titel="Eingang Vereinskonto"
          unter="Bestellt wird erst danach"
          rechts={
            geldDa && vorgang.geldEingangAm ? (
              <Badge tone="pitch">
                <IconCheck width={14} height={14} />
                {vorgang.geldEingangAm}
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

function ArtikelGruppe({
  titel,
  anzahl,
  artikel,
}: {
  titel: string;
  anzahl: string;
  artikel: Artikel[];
}) {
  if (artikel.length === 0) return null;
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

export function ArtikelKarte({ vorgang, stand }: { vorgang: Vorgang; stand: StufeNr }) {
  const gruppen: { fuer: ArtikelFuer; titel: string; anzahl: number }[] = [
    { fuer: "feldspieler", titel: "Feldspieler", anzahl: vorgang.feldspielerAnzahl },
    { fuer: "torwart", titel: "Torwart", anzahl: vorgang.torwartAnzahl },
  ];

  return (
    <Card className="p-5">
      <KartenKopf
        titel="Artikel"
        rechts={
          vorgang.beflockung ? (
            <span className="text-xs text-ink-400">Beflockung {vorgang.beflockung}</span>
          ) : undefined
        }
      />
      {gruppen.map((g) => (
        <ArtikelGruppe
          key={g.fuer}
          titel={g.titel}
          anzahl={`${g.anzahl} ${g.anzahl === 1 ? "Person" : "Personen"}`}
          artikel={vorgang.artikel.filter((a) => a.fuer === g.fuer)}
        />
      ))}
      {stand >= 4 && vorgang.groessenBestaetigtAm && (
        <p className="mt-3.5 text-xs text-ink-400">
          Größen: {vorgang.groessenGesamt} von {vorgang.groessenGesamt}, Liste am{" "}
          {vorgang.groessenBestaetigtAm} bestätigt.
        </p>
      )}
    </Card>
  );
}

/** Spieler-Ansicht: nur die eigenen Größen, nie Beträge (docs/konzept.md). */
export function MeineKarte({
  vorgang,
  stand,
  onDemo,
}: {
  vorgang: Vorgang;
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
        {vorgang.meineAusstattung.map((e) => (
          <div key={e.feld} className="rounded-xl border border-ink-200 px-3 py-2.5">
            <dt className="text-xs font-medium text-ink-500">{e.feld}</dt>
            <dd className="tnum mt-0.5 text-xl font-bold tracking-[-0.02em]">{e.wert}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm text-ink-600">{vorgang.meinHinweis}</p>
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
export function VerlaufKarte({
  vorgang,
  stand,
  ansicht,
}: {
  vorgang: Vorgang;
  stand: StufeNr;
  ansicht: Ansicht;
}) {
  // Ein abgebrochener Vorgang hat nie geliefert oder bezahlt: sein Verlauf endet
  // bei der Stufe des Abbruchs und schliesst mit dem Abbruch selbst.
  const abgebrochen = stand > LETZTE_STUFE;
  const bis = abgebrochen ? (vorgang.abbruchBei ?? LETZTE_STUFE) : stand;
  const eintraege = vorgang.verlauf
    .filter((e) => e.ab <= bis && !(ansicht === "spieler" && e.intern))
    .reverse();
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
