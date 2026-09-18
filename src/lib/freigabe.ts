import "server-only";

/**
 * Wer die Händleranfrage freigibt — und die Naht, an der das später von selbst
 * läuft.
 *
 * **Warum es die Freigabe gibt.** Bis zum 18.09.2026 löste die Bestätigung des
 * Trainers M4 unmittelbar aus. Das ist die einzige Mail, die kitflow nach
 * draußen schickt, an zwei echte Geschäftspartner, und sie ist nicht
 * zurückzuholen. Kais Ansage: die Spartenleitung genehmigt.
 *
 * **Warum `Freigeber` ein Typ ist und kein String.** Kai will, dass die
 * Freigabe später automatisch durchläuft. Wäre „ein Mensch hat geklickt“ fest
 * in den Ablauf gebaut, müsste man dafür den ganzen Weg umbauen. So entscheidet
 * `freigabeWeg()`, ob ein Mensch gefragt wird oder eine Regel entscheidet —
 * alles danach ist identisch, und der Verlauf hält fest, welches von beidem es
 * war. Heute gibt es genau eine Antwort: der Mensch. Das ist Absicht und kein
 * halbfertiger Zustand: eine Automatik, die niemand festgelegt hat, wäre
 * geraten, und geraten wird bei einer Mail nach draußen nicht.
 */

import { vermerke } from "./vorgaenge-db";
import { telegram, telegramAktiv, todoist, todoistAktiv } from "./melden";
import { haendlerZahl } from "./texte";

/**
 * Wer entschieden hat. Eine Adresse aus `SPARTE_EMAILS` oder der Name einer
 * Regel — beides beantwortet „wer war das“ und gehört in den Verlauf.
 */
export type Freigeber =
  | { art: "mensch"; email: string }
  | { art: "regel"; name: string };

/** Für den Verlauf und die Spalte `freigabe_von`. */
export function freigeberName(wer: Freigeber): string {
  return wer.art === "mensch" ? wer.email : `Regel: ${wer.name}`;
}

/**
 * Entscheidet ein Mensch oder eine Regel?
 *
 * Die Naht für Kais „soll später automatisiert durchlaufen“. Wenn es soweit
 * ist, gibt diese Funktion für die Fälle, die durchlaufen dürfen, einen
 * `Freigeber` vom Typ `regel` zurück — und `beantrageFreigabe` gibt dann sofort
 * frei, statt zu fragen. Der übrige Weg bleibt, wie er ist.
 *
 * **Ohne Parameter**, obwohl die Regel den Vorgang brauchen wird: was genau sie
 * ansehen muss, ist offen (docs/freigabe.md nennt den Betrag — den es zu diesem
 * Zeitpunkt noch gar nicht gibt). Einen geratenen Parameter hereinzureichen und
 * ungelesen wegzuwerfen sähe aus wie eine Entscheidung, die niemand getroffen
 * hat. Es gibt genau eine Aufrufstelle; sie mitzuändern kostet eine Zeile.
 */
export function freigabeWeg(): Freigeber | null {
  return null;
}

/* ------------------------------------------------------------------ *
 * Die Benachrichtigung
 * ------------------------------------------------------------------ */

export type FreigabeRuf = {
  nummer: string;
  mannschaft: string;
  gegenstand: string;
  /** Wie viele Stück insgesamt angefragt würden. */
  stueck: number;
  /** Wie viele Händler die Anfrage bekämen. */
  haendler: number;
  /** Adresse der Seite /sparte, absolut. Leer, wenn sie sich nicht bauen ließ. */
  link: string;
};

/**
 * Der Text für Telegram und Todoist.
 *
 * **Keine Namen, keine Größen.** Eine Telegram-Nachricht liegt auf
 * Sperrbildschirmen und wird weitergeleitet; was hier steht, muss auch dann
 * harmlos sein. Die Mannschaft ist eine Mannschaft, kein Mensch.
 */
export function rufText(ruf: FreigabeRuf): string {
  const zeilen = [
    `Freigabe nötig: ${ruf.nummer}`,
    `${ruf.mannschaft} · ${ruf.gegenstand}`,
    `${ruf.stueck} Stück an ${haendlerZahl(ruf.haendler)}`,
    "",
    "Der Trainer hat die Liste bestätigt. Ohne Freigabe geht die Anfrage nicht raus.",
  ];
  if (ruf.link) zeilen.push("", ruf.link);
  return zeilen.join("\n");
}

/**
 * Meldet die offene Freigabe nach Telegram und Todoist.
 *
 * Fällt beides aus, ist das kein Abbruch: die Freigabe steht in der Datenbank
 * und wartet sichtbar auf `/sparte`. Verschwiegen wird der Ausfall trotzdem
 * nicht — sonst wundert sich jemand, warum nie eine Nachricht kam, und hält
 * die Stille für „nichts zu tun“.
 */
export async function ruftZurFreigabe(vorgangId: string, ruf: FreigabeRuf): Promise<void> {
  const text = rufText(ruf);

  if (!telegramAktiv() && !todoistAktiv()) {
    await vermerke(vorgangId, {
      art: "freigabe_ruf_aus",
      text: "Freigabe offen, aber weder Telegram noch Todoist sind eingerichtet",
      intern: true,
      abStufe: 1,
    });
    return;
  }

  // Beide gleichzeitig: sie hängen nicht zusammen, und der Trainer wartet
  // gerade auf seine Bestätigungsseite. Nacheinander kostete ihn eine halbe
  // Sekunde für nichts. Keiner der beiden wirft — sie geben Ja/Nein zurück
  // (`melden.ts`) —, also kann `Promise.all` hier nicht abbrechen.
  const umfang = `${ruf.stueck} Stück an ${haendlerZahl(ruf.haendler)}.`;
  const [telegramGing, todoistId] = await Promise.all([
    telegramAktiv() ? telegram(text) : Promise.resolve(true),
    todoistAktiv()
      ? todoist({
          titel: `Händleranfrage ${ruf.nummer} freigeben (${ruf.mannschaft})`,
          beschreibung: ruf.link ? `${umfang}\n${ruf.link}` : umfang,
          faellig: "heute",
        })
      : Promise.resolve<string | null>(""),
  ]);

  // Die Reihenfolge der Fehlerzeilen steht hier, nicht in der Reihenfolge der
  // Aufrufe — das war der eigentliche Grund für das frühere Nacheinander.
  if (!telegramGing) {
    await vermerke(vorgangId, {
      art: "freigabe_ruf_fehler",
      text: "Telegram hat die Freigabe-Nachricht nicht angenommen",
      intern: true,
      abStufe: 1,
    });
  }
  if (todoistId === null) {
    await vermerke(vorgangId, {
      art: "freigabe_ruf_fehler",
      text: "Todoist hat die Aufgabe nicht angelegt",
      intern: true,
      abStufe: 1,
    });
  }
}
