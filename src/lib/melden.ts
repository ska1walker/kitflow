import "server-only";

/**
 * Telegram und Todoist: der Ruf, dass etwas auf Entscheidung wartet.
 *
 * **Beides darf ausfallen, ohne dass etwas verlorengeht.** Die Freigabe lebt in
 * der Datenbank (`freigabe_stand`), nicht hier. Telegram und Todoist sagen nur
 * Bescheid; wer sie für den Zustand hält, verliert eine Freigabe, sobald jemand
 * eine Chatnachricht wegwischt. Deshalb gibt jede Funktion hier Ja/Nein zurück
 * und wirft nie — der Aufrufer vermerkt den Ausfall im Verlauf und macht
 * weiter.
 *
 * **Keine Spielernamen.** Dieselbe Auflage wie bei der Händleranfrage
 * (`anfrage.ts`), und hier wiegt sie schwerer: eine Telegram-Nachricht landet
 * in einer Gruppe, liegt auf Sperrbildschirmen und wird weitergeleitet. Was
 * hier rausgeht, sind Vorgangsnummer, Mannschaft und Stückzahlen.
 *
 * Gebaut wie `hubspot.ts` und `db.ts`: eigener `fetch`, keine neue
 * Abhängigkeit, damit dieselbe Papp-Netz-Prüfung greift.
 */

const ZEITGRENZE_MS = 10_000;

/* ------------------------------------------------------------------ *
 * Telegram
 * ------------------------------------------------------------------ */

export function telegramAktiv(): boolean {
  return Boolean(process.env.TELEGRAM_TOKEN && process.env.TELEGRAM_CHAT);
}

/**
 * Eine Nachricht an den hinterlegten Chat.
 *
 * Absichtlich ohne Formatierungsmodus: Telegram lehnt eine Nachricht mit
 * `parse_mode` komplett ab, wenn ein Zeichen wie `_` oder `*` im Text steht —
 * und in Mannschaftsnamen wie „Ü40 Team 3“ steckt genug Sonderzeichen, dass
 * sich darauf kein Verlass ist. Eine zugestellte schlichte Nachricht ist mehr
 * wert als eine schöne, die nie ankommt.
 */
export async function telegram(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_TOKEN;
  const chat = process.env.TELEGRAM_CHAT;
  if (!token || !chat) return false;

  try {
    const antwort = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chat,
        text,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(ZEITGRENZE_MS),
    });
    if (!antwort.ok) {
      // Der Text der Antwort, nicht der Text der Nachricht: in der Nachricht
      // steht eine Mannschaft, und Logs sind kein Ort dafür.
      console.error(`Telegram antwortete ${antwort.status}`);
      return false;
    }
    return true;
  } catch (fehler) {
    console.error("Telegram nicht erreicht", fehler instanceof Error ? fehler.message : fehler);
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Todoist
 * ------------------------------------------------------------------ */

export function todoistAktiv(): boolean {
  return Boolean(process.env.TODOIST_TOKEN);
}

export type Aufgabe = {
  titel: string;
  beschreibung?: string;
  /** Natürliche Sprache, wie Todoist sie versteht: „heute“, „morgen 18:00“. */
  faellig?: string;
};

/**
 * Eine Aufgabe anlegen. Gibt die Todoist-ID zurück, damit sie sich später
 * abhaken lässt — `null` heißt, es hat nicht geklappt.
 *
 * Ohne `TODOIST_PROJEKT` landet die Aufgabe im Posteingang. Das ist kein
 * Fehler, sondern der brauchbarere Ausfall: gesehen wird sie dort auch.
 *
 * **Warum `/api/v1/` und nicht `/rest/v2/`.** Die Projekt-ID dieses Kontos ist
 * `6f8v4J3qcVwmhc7M` — alphanumerisch, das neue Format. So steht sie im
 * laufenden Make-Szenario „Kosten einreichen“, und so gibt Todoist sie auch
 * sonst heraus. REST v2 ist die abgekündigte Schnittstelle mit numerischen IDs;
 * ihr eine Kennung im neuen Format zu schicken, hätte sehr wahrscheinlich einen
 * 400er ergeben.
 *
 * **Nicht geprüft**: `api.todoist.com` und `developer.todoist.com` sind aus der
 * Entwicklungsumgebung gesperrt. Der Pfad ist nach dem ID-Format geschlossen,
 * nicht nachgelesen. Fällt er falsch aus, kostet das keine Freigabe — es steht
 * dann „Todoist hat die Aufgabe nicht angelegt“ im Verlauf, und der Status-Code
 * im Log sagt, was zu ändern ist.
 */
export async function todoist(aufgabe: Aufgabe): Promise<string | null> {
  const token = process.env.TODOIST_TOKEN;
  if (!token) return null;

  const koerper: Record<string, unknown> = { content: aufgabe.titel };
  if (aufgabe.beschreibung) koerper.description = aufgabe.beschreibung;
  if (aufgabe.faellig) koerper.due_string = aufgabe.faellig;
  if (process.env.TODOIST_PROJEKT) koerper.project_id = process.env.TODOIST_PROJEKT;

  try {
    const antwort = await fetch("https://api.todoist.com/api/v1/tasks", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(koerper),
      signal: AbortSignal.timeout(ZEITGRENZE_MS),
    });
    if (!antwort.ok) {
      console.error(`Todoist antwortete ${antwort.status}`);
      return null;
    }
    const daten = (await antwort.json()) as { id?: string };
    return typeof daten.id === "string" ? daten.id : null;
  } catch (fehler) {
    console.error("Todoist nicht erreicht", fehler instanceof Error ? fehler.message : fehler);
    return null;
  }
}
