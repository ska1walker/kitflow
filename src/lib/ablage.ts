import "server-only";

/**
 * Die Ablage: Supabase Storage über die REST-Schnittstelle.
 *
 * Gebaut wie `db.ts` und `hubspot.ts` — eigener `fetch`, keine neue
 * Abhängigkeit, prüfbar mit demselben Papp-Netz. Dieselbe Regel auch beim
 * Rückgabewert: **`null` heißt „konnte nicht", nicht „gibt es nicht"**. Wer
 * beides zusammenwirft, zeigt bei einer Störung ein Formular ohne Bild und
 * behauptet damit, es sei keins hinterlegt.
 *
 * **Der Eimer ist privat.** Es gibt keine öffentliche Adresse; gelesen wird nur
 * serverseitig mit dem Dienst-Schlüssel, und an den Browser gehen die Bytes über
 * `/api/bild`, das denselben signierten Token verlangt wie die Seite, auf der
 * das Bild steht. Ein öffentlicher Eimer wäre einfacher — aber seine Adressen
 * gelten für immer und für jeden, und rückgängig macht man das nicht.
 *
 * **Hier liegen nur Sachbilder**: ein Sponsorlogo und Produktfotos. Keine
 * Gesichter, keine Namen, nichts aus HubSpot. Das ist keine technische Grenze,
 * sondern eine Auflage an den einzigen Weg hinein — `lade()` wird ausschließlich
 * aus der Statusseite heraus gerufen, hinter dem Trainer-Link.
 */

import { BILD_GRENZE_BYTES } from "./typen";

const EIMER = "kitflow";

/** Was angenommen wird. Alles andere wird abgewiesen, bevor es hochgeht. */
const ERLAUBT: Record<string, Uint8Array[]> = {
  // Die ersten Bytes, nicht der gemeldete Typ: ein Browser schickt als
  // Content-Type, was der Dateiname nahelegt, und der ist frei wählbar.
  "image/png": [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  "image/jpeg": [new Uint8Array([0xff, 0xd8, 0xff])],
  "image/webp": [new Uint8Array([0x52, 0x49, 0x46, 0x46])], // "RIFF", danach WEBP
};

/**
 * 2 MB. Großzügig für ein Logo, knapp für ein Handyfoto — und genau das ist
 * gewollt: was hier hochgeht, hängt entweder an einer Mail an einen Händler
 * oder wird von 26 Leuten auf dem Handy geladen.
 *
 * **Verkleinert wird nicht.** Das bräuchte `sharp`, und kitflow hat außer Next
 * und React keine Abhängigkeit. Die harte Grenze ist der ehrlichere Ersatz: sie
 * weist zu große Dateien ab, statt sie klaglos anzunehmen und langsam
 * auszuliefern.
 */
export const GRENZE_BYTES = BILD_GRENZE_BYTES;

const ZEITGRENZE_MS = 15_000;

function basis(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
}

function schluessel(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function ablageAktiv(): boolean {
  return Boolean(basis() && schluessel());
}

/** Was beim Hochladen schiefgehen kann — in Sätzen, die ein Mensch versteht. */
export type LadeErgebnis =
  | { ok: true; pfad: string }
  | { ok: false; grund: "zu_gross" | "falscher_typ" | "nicht_eingerichtet" | "gestoert" };

export function ladeFehlerText(grund: Exclude<LadeErgebnis, { ok: true }>["grund"]): string {
  switch (grund) {
    case "zu_gross":
      return "Das Bild ist zu groß. Bitte höchstens 2 MB.";
    case "falscher_typ":
      return "Nur PNG, JPEG oder WebP.";
    case "nicht_eingerichtet":
      return "Die Ablage ist nicht eingerichtet. Bitte bei Kai melden.";
    case "gestoert":
      return "Das Bild konnte nicht gespeichert werden. Bitte später erneut.";
  }
}

function beginntMit(bytes: Uint8Array, anfang: Uint8Array): boolean {
  if (bytes.length < anfang.length) return false;
  return anfang.every((b, i) => bytes[i] === b);
}

/**
 * Der wirkliche Typ, aus den ersten Bytes gelesen — oder `null`, wenn es keiner
 * der erlaubten ist. Der vom Browser gemeldete Typ wird bewusst ignoriert.
 */
export function typVonBytes(bytes: Uint8Array): string | null {
  for (const [typ, anfaenge] of Object.entries(ERLAUBT)) {
    if (anfaenge.some((a) => beginntMit(bytes, a))) {
      // WebP heisst erst dann WebP, wenn nach "RIFF" und der Laenge "WEBP" steht.
      if (typ === "image/webp") {
        const marke = new TextDecoder().decode(bytes.slice(8, 12));
        if (marke !== "WEBP") continue;
      }
      return typ;
    }
  }
  return null;
}

function endung(typ: string): string {
  return typ === "image/png" ? "png" : typ === "image/jpeg" ? "jpg" : "webp";
}

/**
 * Legt ein Bild ab und gibt seinen Pfad im Eimer zurück.
 *
 * `ordner` trennt die Anlässe (`sponsor/`, `artikel/`), `name` ist innerhalb
 * davon eindeutig — in der Regel die Vorgangs- oder Artikel-ID. Ein zweiter
 * Aufruf mit demselben Namen **ersetzt** das Bild (`x-upsert`): ein Trainer, der
 * ein falsches Foto hochgeladen hat, soll es überschreiben können, statt
 * Karteileichen zu hinterlassen.
 */
export async function lade(
  ordner: string,
  name: string,
  bytes: Uint8Array,
): Promise<LadeErgebnis> {
  const url = basis();
  const key = schluessel();
  if (!url || !key) return { ok: false, grund: "nicht_eingerichtet" };

  if (bytes.byteLength > GRENZE_BYTES) return { ok: false, grund: "zu_gross" };

  const typ = typVonBytes(bytes);
  if (!typ) return { ok: false, grund: "falscher_typ" };

  const pfad = `${ordner}/${name}.${endung(typ)}`;

  try {
    const antwort = await fetch(`${url}/storage/v1/object/${EIMER}/${pfad}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": typ,
        // Ohne das antwortet Storage auf eine bestehende Datei mit 409.
        "x-upsert": "true",
      },
      body: bytes as BodyInit,
      signal: AbortSignal.timeout(ZEITGRENZE_MS),
    });
    if (!antwort.ok) {
      console.error(`Ablage antwortete ${antwort.status} beim Hochladen`);
      return { ok: false, grund: "gestoert" };
    }
    return { ok: true, pfad };
  } catch (fehler) {
    console.error("Ablage nicht erreicht", fehler instanceof Error ? fehler.message : fehler);
    return { ok: false, grund: "gestoert" };
  }
}

export type Bild = { bytes: Uint8Array; typ: string };

/**
 * Holt ein Bild. `null` heißt „konnte nicht" **und** „gibt es nicht" — anders
 * als bei `db.ts`, und mit Absicht: die beiden Aufrufer (die Mail und
 * `/api/bild`) tun in beiden Fällen dasselbe, nämlich das Bild weglassen. Eine
 * Unterscheidung, die niemand auswertet, wäre nur eine Einladung, sie falsch
 * auszuwerten.
 */
export async function hole(pfad: string): Promise<Bild | null> {
  const url = basis();
  const key = schluessel();
  if (!url || !key) return null;

  try {
    const antwort = await fetch(`${url}/storage/v1/object/${EIMER}/${pfad}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(ZEITGRENZE_MS),
    });
    if (!antwort.ok) {
      if (antwort.status !== 404) console.error(`Ablage antwortete ${antwort.status}`);
      return null;
    }
    const typ = antwort.headers.get("content-type") ?? "application/octet-stream";
    return { bytes: new Uint8Array(await antwort.arrayBuffer()), typ };
  } catch (fehler) {
    console.error("Ablage nicht erreicht", fehler instanceof Error ? fehler.message : fehler);
    return null;
  }
}

/**
 * Entfernt ein Bild. Gibt `true` zurück, wenn es danach weg ist.
 *
 * Ein Fehlschlag ist nie ein Abbruch: der Verweis in der Datenbank wird
 * trotzdem gelöscht, sonst zeigte die Seite weiter auf ein Bild, das der
 * Trainer gerade entfernt hat. Zurück bleibt dann eine verwaiste Datei — das
 * ist der billigere von beiden Fehlern.
 */
export async function entferne(pfad: string): Promise<boolean> {
  const url = basis();
  const key = schluessel();
  if (!url || !key) return false;

  try {
    const antwort = await fetch(`${url}/storage/v1/object/${EIMER}/${pfad}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(ZEITGRENZE_MS),
    });
    return antwort.ok;
  } catch {
    return false;
  }
}
