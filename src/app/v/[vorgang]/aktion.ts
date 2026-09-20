"use server";

/**
 * Die Server Actions der Statusseite: eine Voranfrage abbrechen und eine
 * Person in einen laufenden Vorgang nachtragen.
 *
 * Beide pruefen denselben Nachweis – den Trainer-Link. Er traegt den Zweck
 * `status` mit nur der Vorgangsnummer; ein Spieler-Link hat zusaetzlich die
 * Personen-ID unter der Signatur und kommt hier deshalb nicht durch.
 *
 * Abbrechen: der Weg nach vorn ist F1b, der Weg zurueck fehlte bisher ganz –
 * sagt der Sponsor ab, lag der Vorgang ohne Ausweg auf Stufe 0
 * (docs/konzept.md).
 */

import { groessenLink, pruefe } from "@/lib/links";
import { ladeVoranfrage } from "@/lib/ergaenzen";
import { spiegele } from "@/lib/spiegel";
import { sendeGroessenMails, trageNach } from "@/lib/vorgaenge";
import { dbAktiv } from "@/lib/db";
import {
  aendereArtikel,
  aendereVorgang,
  setzeStufe,
  vermerke,
  vorgangPerNummer,
} from "@/lib/vorgaenge-db";
import { GRENZE_BYTES, entferne, lade, ladeFehlerText } from "@/lib/ablage";

export type Ergebnis =
  | { stand: "leer" }
  | { stand: "abgebrochen" }
  | { stand: "fehler"; text: string };

export async function voranfrageAbbrechen(
  vorgang: string,
  token: string,
  _bisher: Ergebnis,
  formular: FormData,
): Promise<Ergebnis> {
  if (!pruefe(token, "status", vorgang)) {
    return { stand: "fehler", text: "Dieser Link funktioniert nicht mehr." };
  }
  // Abbrechen passiert nur ueber die Rueckfrage, nie mit einem Klick.
  if (formular.get("abbrechen") !== "ja") {
    return { stand: "fehler", text: "Bitte den Abbruch bestätigen." };
  }
  if (!dbAktiv()) {
    return { stand: "fehler", text: "Das hat gerade nicht geklappt. Bitte versuch es später." };
  }

  // Nur eine offene Voranfrage laesst sich hier abbrechen. Alles Weitere
  // entscheidet die Spartenleitung in HubSpot.
  const abruf = await ladeVoranfrage(vorgang);
  if (abruf.stand === "gestoert") {
    return { stand: "fehler", text: "kitflow kommt gerade nicht an die Daten. Bitte versuch es in einer Minute noch einmal." };
  }
  if (abruf.stand !== "da") {
    return { stand: "fehler", text: "Dieser Vorgang ist keine offene Voranfrage mehr." };
  }
  const voranfrage = abruf.daten;

  // Stufe 9 ist der Abbruch; `abbruchBei` haelt fest, wo der Vorgang stand.
  // Ohne das liesse er sich spaeter nicht wieder aufnehmen.
  const gesetzt = await setzeStufe(voranfrage.vorgangId, 9, 0);
  if (!gesetzt) {
    return { stand: "fehler", text: "Das hat gerade nicht geklappt. Bitte versuch es später." };
  }

  await vermerke(voranfrage.vorgangId, {
    art: "abgebrochen",
    text: "Der Trainer hat die Voranfrage abgebrochen",
    abStufe: 0,
  });

  const frisch = await vorgangPerNummer(vorgang);
  if (frisch.stand === "da") await spiegele(frisch.vorgang);

  return { stand: "abgebrochen" };
}

export type NachtragErgebnis =
  | { stand: "leer" }
  | { stand: "fertig"; name: string; pfad: string }
  | { stand: "fehler"; text: string };

/**
 * Traegt eine Person in einen laufenden Vorgang nach.
 *
 * Derselbe Token wie beim Abbrechen: der Trainer-Link mit dem Zweck `status`
 * und nur der Vorgangsnummer. Ein Spieler-Link traegt zusaetzlich die
 * Personen-ID unter der Signatur und kommt hier nicht durch.
 *
 * Zurueck kommt der frische Groessen-Link, als Pfad. Absolut macht ihn die
 * Karte aus der Adresse, unter der die Seite gerade laeuft: `KITFLOW_BASIS`
 * ist fuer Mails da und kann fehlen: dann stuende hier nur ein Versprechen
 * und kein Link. Solange M2 nicht gebaut ist, verteilt der Trainer ihn
 * selbst – er muss ihn also wirklich sehen.
 */
export async function personNachtragen(
  vorgang: string,
  token: string,
  _bisher: NachtragErgebnis,
  formular: FormData,
): Promise<NachtragErgebnis> {
  if (!pruefe(token, "status", vorgang)) {
    return { stand: "fehler", text: "Dieser Link funktioniert nicht mehr." };
  }

  const person = String(formular.get("person") ?? "").trim();
  if (!person) return { stand: "fehler", text: "Bitte eine Person wählen." };

  if (!dbAktiv()) {
    return { stand: "fehler", text: "Das hat gerade nicht geklappt. Bitte versuch es später." };
  }

  const ergebnis = await trageNach(vorgang, person);
  if (!ergebnis.ok) return { stand: "fehler", text: ergebnis.fehler };

  return { stand: "fertig", name: ergebnis.name, pfad: groessenLink(vorgang, person) ?? "" };
}

export type VersandStand =
  | { stand: "leer" }
  | { stand: "fertig"; verschickt: number; fehlgeschlagen: number; umgeleitetAn?: string }
  | { stand: "fehler"; text: string };

/**
 * Verschickt die Größen-Mail an die angehakten Personen (M2a).
 *
 * Bis hierher verteilte der Trainer 24 Links von Hand aus M1. Welche IDs das
 * Formular mitschickt, entscheidet nichts: `sendeGroessenMails` lädt den
 * Vorgang frisch und lässt nur durch, wer wirklich daran hängt.
 */
export async function groessenMailsSenden(
  vorgang: string,
  token: string,
  _bisher: VersandStand,
  formular: FormData,
): Promise<VersandStand> {
  if (!pruefe(token, "status", vorgang)) {
    return { stand: "fehler", text: "Dieser Link funktioniert nicht mehr." };
  }

  const ids = formular.getAll("person").filter((w): w is string => typeof w === "string");
  if (ids.length === 0) {
    return { stand: "fehler", text: "Bitte hak an, wer eine Mail bekommen soll." };
  }

  const ergebnis = await sendeGroessenMails(vorgang, ids);
  if (ergebnis.ok) {
    return {
      stand: "fertig",
      verschickt: ergebnis.verschickt,
      fehlgeschlagen: ergebnis.fehlgeschlagen,
      umgeleitetAn: ergebnis.umgeleitetAn,
    };
  }

  const texte: Record<typeof ergebnis.grund, string> = {
    gestoert:
      "kitflow kommt gerade nicht an die Daten. Bitte versuch es in einer Minute noch einmal.",
    unbekannt: "Dieser Link funktioniert nicht mehr.",
    zu: "Für diesen Vorgang werden keine Größen mehr gesammelt.",
    niemand: "Von den Angehakten gehört niemand mehr zu diesem Vorgang.",
    // Nicht „die Links stehen unten“: auf der Statusseite stehen sie das
    // nicht, nur auf der Danke-Seite. Der Trainer hat sie in M1.
    "kein-versand":
      "kitflow kann gerade keine Mails verschicken. Die persönlichen Links stehen in der Mail, mit der dieser Vorgang angelegt wurde – von dort lassen sie sich von Hand verteilen.",
  };
  return { stand: "fehler", text: texte[ergebnis.grund] };
}

/* ------------------------------------------------------------------ *
 * Bilder: Sponsorlogo und Artikelfotos
 * ------------------------------------------------------------------ */

export type BildErgebnis =
  | { stand: "leer" }
  | { stand: "gespeichert" }
  | { stand: "entfernt" }
  | { stand: "fehler"; text: string };

/**
 * Ein Bild hochladen oder entfernen.
 *
 * **Der Trainer-Link ist die einzige Tür.** Es gibt bewusst keinen Weg über
 * `/neu`: die Seite steht offen im Netz und legt seit Migration 002 nur
 * Entwürfe an. Ein Hochladefeld dort hieße, Dateien von Unbekannten für
 * Vorgänge zu speichern, die es noch gar nicht gibt.
 *
 * **Die Datei wird an ihren ersten Bytes gemessen, nicht an ihrem Namen**
 * (`lade` in `lib/ablage.ts`). Ein Browser meldet als Typ, was die Endung
 * nahelegt, und die ist frei wählbar.
 *
 * Scheitert das Entfernen in der Ablage, wird der Verweis trotzdem gelöscht:
 * sonst zeigte die Seite weiter auf ein Bild, das der Trainer gerade
 * weggenommen hat. Zurück bleibt eine verwaiste Datei — der billigere Fehler.
 */
export async function bildSetzen(
  vorgang: string,
  token: string,
  _bisher: BildErgebnis,
  formular: FormData,
): Promise<BildErgebnis> {
  if (!pruefe(token, "status", vorgang)) {
    return { stand: "fehler", text: "Dieser Link funktioniert nicht mehr." };
  }
  if (!dbAktiv()) {
    return { stand: "fehler", text: "Das hat gerade nicht geklappt. Bitte versuch es später." };
  }

  const art = String(formular.get("art") ?? "");
  const artikelId = String(formular.get("artikel") ?? "");
  if (art !== "sponsor" && art !== "artikel") {
    return { stand: "fehler", text: "Das hat nicht geklappt." };
  }

  const geladen = await vorgangPerNummer(vorgang);
  if (geladen.stand === "gestoert") {
    return { stand: "fehler", text: "kitflow kommt gerade nicht an die Daten." };
  }
  if (geladen.stand !== "da") {
    return { stand: "fehler", text: "Dieser Link funktioniert nicht mehr." };
  }
  const satz = geladen.vorgang;

  // Eine fremde Artikel-ID darf nicht an einem fremden Vorgang landen.
  const artikel = art === "artikel" ? satz.artikel.find((a) => a.id === artikelId) : undefined;
  if (art === "artikel" && !artikel) {
    return { stand: "fehler", text: "Diesen Artikel gibt es an diesem Vorgang nicht." };
  }

  const bisher = art === "sponsor" ? satz.sponsorLogo : artikel?.bild;

  if (formular.get("entfernen") === "ja") {
    if (bisher) await entferne(bisher);
    const weg =
      art === "sponsor"
        ? await aendereVorgang(satz.id, { sponsorLogo: "" })
        : await aendereArtikel(artikelId, { bild: "" });
    if (!weg) return { stand: "fehler", text: "Das hat gerade nicht geklappt." };
    return { stand: "entfernt" };
  }

  const datei = formular.get("bild");
  if (!(datei instanceof File) || datei.size === 0) {
    return { stand: "fehler", text: "Bitte ein Bild auswählen." };
  }
  if (datei.size > GRENZE_BYTES) {
    return { stand: "fehler", text: ladeFehlerText("zu_gross") };
  }

  const bytes = new Uint8Array(await datei.arrayBuffer());
  const ergebnis = await lade(
    art === "sponsor" ? "sponsor" : "artikel",
    art === "sponsor" ? satz.id : artikelId,
    bytes,
  );
  if (!ergebnis.ok) return { stand: "fehler", text: ladeFehlerText(ergebnis.grund) };

  const gemerkt =
    art === "sponsor"
      ? await aendereVorgang(satz.id, { sponsorLogo: ergebnis.pfad })
      : await aendereArtikel(artikelId, { bild: ergebnis.pfad });

  if (!gemerkt) {
    // Die Datei liegt, der Verweis fehlt — ohne ihn findet sie niemand wieder.
    await entferne(ergebnis.pfad);
    return { stand: "fehler", text: "Das hat gerade nicht geklappt." };
  }

  // Der alte Pfad kann ein anderer sein, wenn sich das Dateiformat geaendert
  // hat (etwa PNG nach JPEG). Dann liegt sonst eine Leiche im Eimer.
  if (bisher && bisher !== ergebnis.pfad) await entferne(bisher);

  return { stand: "gespeichert" };
}
