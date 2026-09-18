"use server";

/**
 * Der Klick, aus dem ein Entwurf ein Vorgang wird.
 *
 * Alles, was früher am Ende von `/neu/aktion.ts` stand, steht jetzt hier:
 * anlegen, M1 verschicken, Entwurf wegräumen. Der Unterschied ist, wer es
 * auslöst — hier jemand, der den Link aus der Mail hat, und damit jemand, der
 * das Postfach besitzt.
 *
 * Die Action prüft das Token **selbst**, wie jede andere in kitflow: sie ist
 * eine eigene Adresse und lässt sich ohne die Seite aufrufen.
 */

import { meldeBedarf } from "@/lib/bedarf";
import { holeEntwurf, loescheEntwurf } from "@/lib/entwurf";
import { pruefe } from "@/lib/links";
import { absolut, sendeM1 } from "@/lib/mail";
import { NUR_GROESSEN } from "@/lib/mannschaften";
import type { BedarfErgebnis } from "@/lib/bedarf";

export type AnlegeStand =
  | { stand: "leer" }
  | { stand: "fertig"; ergebnis: BedarfErgebnis }
  | { stand: "fehler"; text: string };

export async function vorgangAnlegen(
  entwurfId: string,
  token: string,
  bisher: AnlegeStand,
): Promise<AnlegeStand> {
  // Steht der Vorgang schon, bleibt es dabei. Ein zweiter Klick auf den Knopf
  // würde sonst „schon benutzt“ zeigen, obwohl gerade alles geklappt hat —
  // der Entwurf ist nach dem ersten Mal weg.
  if (bisher.stand === "fertig") return bisher;

  if (!pruefe(token, "anlegen", entwurfId)) {
    return { stand: "fehler", text: "Dieser Link funktioniert nicht mehr." };
  }

  const abruf = await holeEntwurf(entwurfId);
  if (abruf.stand === "gestoert") {
    return {
      stand: "fehler",
      text: "kitflow kommt gerade nicht an die Daten. Bitte versuch es in einer Minute noch einmal.",
    };
  }
  if (abruf.stand === "abgelaufen") {
    return {
      stand: "fehler",
      text: "Dieser Bestätigungslink ist abgelaufen. Bitte melde den Bedarf noch einmal – es dauert keine Minute.",
    };
  }
  // „Gibt es nicht“ heisst meistens: schon bestaetigt, der Entwurf ist weg.
  if (abruf.stand !== "da") {
    return {
      stand: "fehler",
      text: "Dieser Link wurde schon benutzt oder ist abgelaufen. Sieh in deinem Postfach nach der Mail „Größenabfrage läuft“ – dann ist alles in Ordnung.",
    };
  }

  const eingabe = abruf.entwurf.daten;
  const ergebnis = await meldeBedarf(eingabe);
  if (!ergebnis) {
    return {
      stand: "fehler",
      text: "Der Vorgang konnte gerade nicht angelegt werden. Bitte versuch es in einer Minute noch einmal.",
    };
  }

  // Ab hier steht der Vorgang. Nichts, was jetzt noch schiefgeht, darf ihn
  // zurücknehmen — deshalb hält keine dieser Zeilen den Trainer auf.
  await loescheEntwurf(abruf.entwurf.id);

  const mailAn = await sendeM1(eingabe.email, {
    vorgang: ergebnis.vorgang,
    vorname: eingabe.vorname,
    mannschaft: eingabe.person ? eingabe.person.name : eingabe.teams.join(", "),
    nurGroessen: eingabe.ausstattungsart === NUR_GROESSEN,
    artikel: ergebnis.artikelText,
    groessenFrist: eingabe.groessenFrist,
    statusLink: absolut(ergebnis.trainerStatus) ?? "",
    bestaetigenLink: absolut(ergebnis.bestaetigen) ?? undefined,
    ergaenzenLink: absolut(ergebnis.ergaenzen) ?? undefined,
  });

  // Auch diese Seite hängt an keinem Personen-Token: sie beweist nur, dass
  // jemand die Mail bekommen hat. Namen und persönliche Links bleiben deshalb
  // serverseitig, genau wie auf der Danke-Seite von `/neu`.
  return {
    stand: "fertig",
    ergebnis: { ...ergebnis, personen: [], mailAn: mailAn ?? undefined },
  };
}
