import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Anhang } from "./mail";

/**
 * Das Vereinswappen für die Händleranfrage.
 *
 * **Eine Datei, kein Upload.** Das Wappen ändert sich nie; es dafür in einen
 * Speicher zu legen, hieße eine Hochlade-Strecke zu bauen, die genau einmal
 * benutzt wird. Es liegt als Datei im Projekt und wird per Bereitstellung
 * getauscht. Damit gibt es auch keinen Weg, über den jemand etwas anderes
 * hochlädt.
 *
 * **Es fehlt, bis Kai es legt.** Kommt die Datei nicht, gibt jede Funktion hier
 * `null` zurück, und die Mail geht ohne Wappen raus — mit der Wortmarke, die
 * immer lädt. Ein fehlendes Logo darf keine Händleranfrage aufhalten.
 *
 * Gelesen wird zur Laufzeit mit `fs`, nicht importiert: ein PNG lässt sich
 * nicht `import`en. Damit Next die Datei in die Bereitstellung mitnimmt, steht
 * sie in `outputFileTracingIncludes` (next.config.ts) — ein aus Strings
 * gebauter Pfad wird sonst nicht als Abhängigkeit erkannt, und die Datei fehlte
 * auf Vercel, ohne dass hier etwas auffiele.
 */

/** Die Kennung, unter der das HTML das Bild anspricht: `cid:wappen`. */
export const WAPPEN_CID = "wappen";

const DATEINAME = "wappen.png";
const TYP = "image/png";

/**
 * `undefined` = noch nicht nachgesehen, `null` = nachgesehen und nicht da.
 * Die Unterscheidung spart bei jeder weiteren Mail einen Dateizugriff und
 * verhindert zugleich, dass eine fehlende Datei bei jedem Versand neu gesucht
 * wird.
 */
let zwischenspeicher: Uint8Array | null | undefined;

export async function wappenBytes(): Promise<Uint8Array | null> {
  if (zwischenspeicher !== undefined) return zwischenspeicher;

  try {
    const datei = path.join(process.cwd(), "src", "assets", DATEINAME);
    zwischenspeicher = new Uint8Array(await readFile(datei));
  } catch {
    // Kein `console.error`: dass die Datei fehlt, ist bis zu Kais erstem
    // Durchlauf der Normalfall und keine Störung. Dass sie fehlt, sieht man
    // daran, dass `wappenAktiv()` false meldet.
    zwischenspeicher = null;
  }
  return zwischenspeicher;
}

/** Ob überhaupt ein Wappen hinterlegt ist. Für Formulare und Hinweistexte. */
export async function wappenAktiv(): Promise<boolean> {
  return (await wappenBytes()) !== null;
}

/**
 * Das Wappen als Inline-Anhang, oder `null` wenn keins hinterlegt ist.
 *
 * Der Aufrufer hängt es an und verweist im HTML mit `cid:wappen` darauf. Kommt
 * `null` zurück, lässt er beides weg — ein `cid:`-Verweis ohne Anhang ergibt
 * in jedem Programm ein kaputtes Bildsymbol.
 */
export async function wappenAnhang(): Promise<Anhang | null> {
  const bytes = await wappenBytes();
  if (!bytes) return null;
  return { art: "binaer", dateiname: DATEINAME, bytes, typ: TYP, inlineId: WAPPEN_CID };
}

/** Nur für Tests: den gemerkten Stand vergessen. */
export function wappenVergessen(): void {
  zwischenspeicher = undefined;
}
