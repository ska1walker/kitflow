import "server-only";

/**
 * Signierte Links (docs/konzept.md, docs/formulare.md).
 *
 * kitflow hat keinen Login für Trainer, Spieler und Eltern. Wer eine Seite
 * öffnen darf, weist das über einen Link nach, der einen HMAC-SHA256 trägt.
 * Der Schlüssel steht ausschliesslich in `LINK_SECRET` und nie in HubSpot.
 *
 * Signiert wird genau das, was in der URL steht, plus der Zweck:
 *
 *   /v/AUS-2026-014?t=…              Trainer-Ansicht  -> ["status", vorgang]
 *   /v/AUS-2026-014/12345?t=…        Spieler-Ansicht  -> ["status", vorgang, person]
 *   /g/AUS-2026-014/12345?t=…        Groessen         -> ["groessen", vorgang, person]
 *   /b/AUS-2026-014?t=…              Liste bestaetigen-> ["bestaetigen", vorgang]
 *   /b/AUS-2026-014/12345?t=…        F2 als Trainer   -> ["trainer", vorgang, person]
 *   /e/AUS-2026-014?t=…              Angaben ergaenzen-> ["ergaenzen", vorgang]
 *
 * Der Trainer-Zweck liegt unter /b, weil er zur Liste gehoert: die Links auf
 * die einzelnen Zeilen erzeugt F3 selbst. Er ist ein eigener Zweck, damit ein
 * Spieler-Link nicht zum Trainerformular wird.
 *
 * Die Personen-ID gehoert zwingend unter die Signatur. Sonst koennte jemand mit
 * einem gueltigen Link die ID austauschen und die Groessen eines anderen Kindes
 * sehen. Der Zweck gehoert darunter, damit ein Status-Link nicht als
 * Bestaetigungs-Link durchgeht.
 *
 * Kein Ablaufdatum: Ob eine Seite noch etwas darf, entscheidet die Stufe des
 * Vorgangs (docs/formulare.md), nicht die Uhr. Ein Link, den Eltern in einer
 * Gruppe weiterreichen, soll nicht mitten in der Frist sterben.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export type Zweck = "status" | "groessen" | "bestaetigen" | "trainer" | "ergaenzen";

/**
 * Der Schluessel. Fehlt er, funktioniert kein einziger Link – das ist Absicht:
 * eine Anwendung ohne Schluessel darf nicht offen stehen.
 */
function schluessel(): string | null {
  const wert = process.env.LINK_SECRET;
  return wert && wert.length >= 32 ? wert : null;
}

export function linksAktiv(): boolean {
  return schluessel() !== null;
}

/**
 * Die zu signierende Zeichenkette. Die Teile werden mit einem Zeichen getrennt,
 * das in keinem Teil vorkommen darf, damit ("a","bc") und ("ab","c") nicht
 * dieselbe Signatur ergeben.
 */
function nachricht(zweck: Zweck, teile: string[]): string {
  return [zweck, ...teile].join("\n");
}

/** Signatur als base64url, ohne Polsterung. */
export function signiere(zweck: Zweck, ...teile: string[]): string | null {
  const key = schluessel();
  if (!key) return null;
  return createHmac("sha256", key).update(nachricht(zweck, teile)).digest("base64url");
}

/**
 * Prueft ein Token. Vergleicht in konstanter Zeit, damit sich die Signatur
 * nicht Zeichen fuer Zeichen erraten laesst.
 */
export function pruefe(token: string | undefined, zweck: Zweck, ...teile: string[]): boolean {
  if (!token) return false;

  const erwartet = signiere(zweck, ...teile);
  if (!erwartet) return false;

  const a = Buffer.from(token);
  const b = Buffer.from(erwartet);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Der Link auf die Statusseite: mit Person die Spieler-, ohne die Trainer-Ansicht. */
export function statusLink(vorgang: string, person?: string): string | null {
  const teile = person ? [vorgang, person] : [vorgang];
  const token = signiere("status", ...teile);
  if (!token) return null;
  return `/v/${encodeURIComponent(vorgang)}${
    person ? `/${encodeURIComponent(person)}` : ""
  }?t=${token}`;
}

/** Der Link auf die Groessenabfrage einer einzelnen Person. */
export function groessenLink(vorgang: string, person: string): string | null {
  const token = signiere("groessen", vorgang, person);
  if (!token) return null;
  return `/g/${encodeURIComponent(vorgang)}/${encodeURIComponent(person)}?t=${token}`;
}

/** Der Link, mit dem der Trainer die Liste bestaetigt. */
export function bestaetigenLink(vorgang: string): string | null {
  const token = signiere("bestaetigen", vorgang);
  if (!token) return null;
  return `/b/${encodeURIComponent(vorgang)}?t=${token}`;
}

/**
 * Der Link, mit dem der Trainer eine Voranfrage vervollstaendigt (F1b).
 *
 * Eigener Zweck, kein Status-Link: dieses Formular schreibt am ganzen Vorgang
 * und hebt ihn aus der Voranfrage in die Groessenabfrage.
 */
export function ergaenzenLink(vorgang: string): string | null {
  const token = signiere("ergaenzen", vorgang);
  if (!token) return null;
  return `/e/${encodeURIComponent(vorgang)}?t=${token}`;
}

/** Der Link, mit dem der Trainer die Angaben einer Person aendert (F2 als Trainer). */
export function trainerLink(vorgang: string, person: string): string | null {
  const token = signiere("trainer", vorgang, person);
  if (!token) return null;
  return `/b/${encodeURIComponent(vorgang)}/${encodeURIComponent(person)}?t=${token}`;
}
