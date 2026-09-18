import "server-only";

/**
 * M2 · der Erinnerungslauf (docs/mails.md, Schritt 4 des Programms).
 *
 * Einmal am Tag über alle Vorgänge, bei denen Größen gesammelt werden. Wer
 * seine Größe noch nicht eingetragen hat, bekommt eine Erinnerung.
 *
 * Eine Erinnerung ist der einzige Mailweg in kitflow, den kein Mensch auslöst.
 * Deshalb sind die Grenzen hier härter als anderswo, und sie stehen alle an
 * dieser Stelle:
 *
 * 1. **Höchstens zwei je Person.** Danach nie wieder, auch nicht nächste Woche.
 * 2. **Mindestens drei Tage Abstand** zur letzten Mail dieses Vorgangs — auch
 *    zur ersten Größen-Mail. Wer heute angeschrieben wurde, wird nicht morgen
 *    erinnert.
 * 3. **Nie nach der Frist.** Am Tag der Frist noch, danach nicht mehr: eine
 *    Aufforderung, etwas nachzuholen, wofür die Zeit abgelaufen ist, ist keine
 *    Hilfe, sondern Lärm.
 * 4. **Nur, wer die erste Mail schon hatte.** Eine Erinnerung an jemanden, der
 *    nie einen Link bekommen hat, ist keine Erinnerung — sie wäre die erste
 *    Ansprache überhaupt, und sie klänge wie ein Vorwurf. Dieser Fall tritt
 *    wirklich ein: der Trainer entscheidet in der Mail-Karte, wen er anschreibt,
 *    und Nachzügler kommen später dazu.
 * 5. **Eine umgeleitete Mail zählt nicht.** `MAIL_NUR_AN` legt sie in Kais
 *    Postfach, nicht in das des Spielers (`mailsAn` filtert sie heraus). Sonst
 *    bliebe beim ersten scharfen Lauf die Hälfte der Leute ohne Erinnerung.
 *
 * **Keine Namen ins Log.** Der Lauf berichtet in Zahlen. Vorname und Adresse
 * eines Kindes gehören in die Mail und nirgendwo sonst (CLAUDE.md).
 */

import { text } from "./hubspot";
import { absolut, mailAktiv, sendeM2 } from "./mail";
import { groessenLink } from "./links";
import {
  MAIL_ERINNERUNG,
  MAIL_GROESSEN,
  hatGroesse,
  kontakteVon,
  mailKontext,
} from "./vorgaenge";
import {
  mailsAn,
  vermerke,
  vermerkeMail,
  vorgaengeAufStufe,
  type VorgangSatz,
} from "./vorgaenge-db";

/** Höchstens so viele Erinnerungen je Person und Vorgang. */
export const HOECHSTENS = 2;

/** So viele Tage müssen seit der letzten Mail vergangen sein. */
export const ABSTAND_TAGE = 3;

/** Ganze Tage von `a` bis `b`, über den Kalendertag gerechnet. */
function tageZwischen(a: Date, b: Date): number {
  const tag = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((tag(b) - tag(a)) / 86_400_000);
}

/** „2026-09-30“ als Datum. `null`, wenn dort nichts Brauchbares steht. */
function alsDatum(wert: string | undefined): Date | null {
  if (!wert) return null;
  const zeit = new Date(wert);
  return Number.isNaN(zeit.getTime()) ? null : zeit;
}

export type Grund =
  | "hat-groesse"
  | "keine-adresse"
  | "nie-angeschrieben"
  | "genug-erinnert"
  | "zu-frisch"
  | "kein-link";

export type Bericht = {
  /** Wie viele Vorgänge angesehen wurden. */
  vorgaenge: number;
  verschickt: number;
  fehlgeschlagen: number;
  /** Warum jemand nichts bekam, in Zahlen. Nie mit Namen. */
  uebersprungen: Record<Grund, number>;
  /** `MAIL_NUR_AN` war gesetzt – dann zählt nichts davon als echte Erinnerung. */
  umgeleitet: boolean;
};

function leererBericht(): Bericht {
  return {
    vorgaenge: 0,
    verschickt: 0,
    fehlgeschlagen: 0,
    uebersprungen: {
      "hat-groesse": 0,
      "keine-adresse": 0,
      "nie-angeschrieben": 0,
      "genug-erinnert": 0,
      "zu-frisch": 0,
      "kein-link": 0,
    },
    umgeleitet: false,
  };
}

export type LaufErgebnis = { ok: true; bericht: Bericht } | { ok: false; grund: string };

/**
 * Der Lauf. `jetzt` ist einspeisbar, damit die Fristenregeln prüfbar sind, ohne
 * die Uhr des Rechners zu stellen.
 */
export async function erinnerungslauf(jetzt: Date = new Date()): Promise<LaufErgebnis> {
  if (!mailAktiv()) return { ok: false, grund: "kein-versand" };

  // Nur Stufe 1: dort und nur dort werden Größen gesammelt.
  const vorgaenge = await vorgaengeAufStufe(1);
  if (vorgaenge === null) return { ok: false, grund: "gestoert" };

  const bericht = leererBericht();

  for (const satz of vorgaenge) {
    const frist = alsDatum(satz.groessenFrist);
    // Ohne Frist gibt es nichts zu erinnern: es gibt keinen Zeitpunkt, auf den
    // hin erinnert würde. Ein Vorgang ohne Frist wartet auf den Trainer.
    if (!frist) continue;

    const tageBisFrist = tageZwischen(jetzt, frist);
    if (tageBisFrist < 0) continue;

    bericht.vorgaenge += 1;
    await erinnereVorgang(satz, tageBisFrist, jetzt, bericht);
  }

  return { ok: true, bericht };
}

async function erinnereVorgang(
  satz: VorgangSatz,
  tageBisFrist: number,
  jetzt: Date,
  bericht: Bericht,
): Promise<void> {
  const kontakte = await kontakteVon(satz);
  // `null` heißt „HubSpot hat nicht geantwortet“. Dann diesen Vorgang
  // auslassen – nicht: niemand braucht eine Erinnerung.
  if (kontakte === null || kontakte.length === 0) return;

  const kontext = mailKontext(satz);
  let verschicktHier = 0;

  for (const k of kontakte) {
    if (hatGroesse(k)) {
      bericht.uebersprungen["hat-groesse"] += 1;
      continue;
    }

    const email = text(k, "email");
    if (!email) {
      // Der Trainer trägt diese Größen selbst ein; er sieht das in der Liste.
      bericht.uebersprungen["keine-adresse"] += 1;
      continue;
    }

    const erinnerungen = await mailsAn(satz.id, MAIL_ERINNERUNG, k.id);
    const ersteMails = await mailsAn(satz.id, MAIL_GROESSEN, k.id);
    // `null` heißt „konnte nicht fragen“. Weiterzumachen hieße, den Zähler auf
    // null zu lesen und womöglich die dritte Erinnerung zu schicken.
    if (erinnerungen === null || ersteMails === null) {
      bericht.fehlgeschlagen += 1;
      continue;
    }

    if (ersteMails.length === 0) {
      bericht.uebersprungen["nie-angeschrieben"] += 1;
      continue;
    }
    if (erinnerungen.length >= HOECHSTENS) {
      bericht.uebersprungen["genug-erinnert"] += 1;
      continue;
    }

    // Der Abstand zählt ab der letzten Mail dieses Vorgangs, gleich welcher
    // Art: sonst käme einen Tag nach der Größen-Mail schon die Erinnerung.
    const letzte = [...erinnerungen, ...ersteMails]
      .map(alsDatum)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    if (letzte && tageZwischen(letzte, jetzt) < ABSTAND_TAGE) {
      bericht.uebersprungen["zu-frisch"] += 1;
      continue;
    }

    const pfad = groessenLink(satz.nummer, k.id);
    const link = pfad ? absolut(pfad) : null;
    if (!link) {
      bericht.uebersprungen["kein-link"] += 1;
      continue;
    }

    const nummer = (erinnerungen.length + 1) as 1 | 2;
    const ging = await sendeM2(email, {
      vorgang: satz.nummer,
      vorname: text(k, "firstname") ?? "",
      mannschaft: kontext.mannschaft,
      arten: kontext.arten,
      frist: satz.groessenFrist ?? "",
      nurGroessen: kontext.nurGroessen,
      groessenLink: link,
      tageBisFrist,
      nummer,
    });
    if (!ging) {
      bericht.fehlgeschlagen += 1;
      continue;
    }

    const umgeleitet = ging !== email;
    if (umgeleitet) bericht.umgeleitet = true;
    bericht.verschickt += 1;
    verschicktHier += 1;
    await vermerkeMail(satz.id, MAIL_ERINNERUNG, k.id, umgeleitet);
  }

  if (verschicktHier > 0) {
    // Ohne Namen: der Verlauf steht auch auf der Spieler-Ansicht.
    await vermerke(satz.id, {
      art: "mail",
      text: `Erinnerung an ${verschicktHier} ${verschicktHier === 1 ? "Person" : "Personen"} verschickt`,
      abStufe: 1,
    });
  }
}
