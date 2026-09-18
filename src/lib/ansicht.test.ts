import { describe, expect, test } from "vitest";
import {
  artikelVon,
  ausstattungVon,
  gefragteArten,
  haendler,
  istJugend,
  nurGroessen,
  pruefungen,
  rollen,
  torwarte,
  verlauf,
} from "./ansicht";
import { artikel, kontakt, person, satz } from "../../test/satz";
import type { EreignisSatz } from "./vorgaenge-db";

/**
 * Was aus einem Vorgang der Datenbank wird, bevor eine Seite ihn zeigt.
 *
 * Reine Rechnerei, kein Netz. Geprüft wird, was wehtut, wenn es bricht: ob F2
 * und F3 dieselben Größen meinen, wer als Torwart zählt, und ob die sechs
 * Prüfungen eine falsche Liste durchlassen.
 */

describe("Jugend oder nicht", () => {
  test("ein Jahrgang ist Jugend", () => {
    expect(istJugend(satz({ mannschaften: ["2014"] }))).toBe(true);
  });

  test("Ü40 ist es nicht", () => {
    expect(istJugend(satz({ mannschaften: ["Ü40 Team 3"] }))).toBe(false);
  });

  test("bei einer Spielgemeinschaft zählt, dass Jugend dabei ist", () => {
    expect(istJugend(satz({ mannschaften: ["2014", "2015"] }))).toBe(true);
  });
});

describe("Welche Größen gefragt werden", () => {
  test("die Artikel sagen es", () => {
    const v = satz({
      artikel: [artikel(), artikel({ id: "a2", groessenart: "trainingshose" })],
    });
    expect(gefragteArten(v)).toEqual(["oberteil", "trainingshose"]);
  });

  test("jede Art nur einmal, auch wenn zwei Artikel sie brauchen", () => {
    const v = satz({ artikel: [artikel(), artikel({ id: "a2" })] });
    expect(gefragteArten(v)).toEqual(["oberteil"]);
  });

  test("„ohne“ ist keine Frage", () => {
    const v = satz({ artikel: [artikel({ groessenart: "ohne" })] });
    expect(gefragteArten(v)).toEqual([]);
  });

  test("ohne Artikel sagt es der Vorgang selbst", () => {
    // Der Größencheck: kein Artikel, trotzdem eine Frage.
    const v = satz({ ausstattungsart: "Nur Größen erfassen", groessenarten: ["trikot", "schuhe"] });
    expect(gefragteArten(v)).toEqual(["trikot", "schuhe"]);
    expect(nurGroessen(v)).toBe(true);
  });

  test("Artikel schlagen die Liste am Vorgang", () => {
    const v = satz({ artikel: [artikel()], groessenarten: ["trikot"] });
    expect(gefragteArten(v)).toEqual(["oberteil"]);
  });
});

describe("Wer mitzählt", () => {
  test("Torwart und Feldspieler", () => {
    const v = satz({
      personen: [person(), person({ id: "p2", kontaktId: "222", torwart: true })],
    });
    expect(rollen(v)).toEqual({ feldspieler: 1, torwart: 1 });
    expect(torwarte(v).has("222")).toBe(true);
  });

  test("wer ausgeschlossen ist, zählt gar nicht", () => {
    const v = satz({
      personen: [person(), person({ id: "p2", kontaktId: "222", ausgeschlossen: true })],
    });
    expect(rollen(v)).toEqual({ feldspieler: 1, torwart: 0 });
  });

  test("ein ausgeschlossener Torwart zählt auch nicht als Torwart", () => {
    const v = satz({ personen: [person({ torwart: true, ausgeschlossen: true })] });
    expect(rollen(v)).toEqual({ feldspieler: 0, torwart: 0 });
  });
});

describe("Die eigene Ausstattung", () => {
  test("zeigt die Größen zu den gefragten Arten und die Rückennummer", () => {
    const v = satz({
      artikel: [artikel()],
      personen: [person({ trikotnummer: "7" })],
    });
    const k = kontakt("111", { trainingsanzug_oberteil: "L", trikot: "XXL" });

    // `trikot` steht am Kontakt, wird aber nicht gefragt: es gehoert zu einem
    // anderen Vorgang und hat hier nichts zu suchen.
    expect(ausstattungVon(v, k)).toEqual([
      { feld: "Oberteil", wert: "L" },
      { feld: "Rückennummer", wert: "7" },
    ]);
  });

  test("ohne Kontakt bleibt sie leer", () => {
    // Sonst zeigte die Seite Größen, ohne zu wissen, wem sie gehören.
    expect(ausstattungVon(satz({ artikel: [artikel()] }), undefined)).toEqual([]);
  });

  test("eine nicht eingetragene Größe fehlt einfach", () => {
    const v = satz({ artikel: [artikel()], personen: [person()] });
    expect(ausstattungVon(v, kontakt("111"))).toEqual([]);
  });
});

describe("Händler und Verlauf", () => {
  test("das Angebotsdatum steht kurz da, der gewählte ist markiert", () => {
    const v = satz({
      angebote: { intersport: { am: "2026-10-02" }, elfteamsports: {} },
      lieferantGewaehlt: "Intersport Uelzen",
    });
    expect(haendler(v)).toEqual([
      { name: "Intersport Uelzen", ansprechpartner: "", angebotAm: "02.10.", gewaehlt: true },
      { name: "11teamsports", ansprechpartner: "", angebotAm: "", gewaehlt: false },
    ]);
  });

  test("der Verlauf mischt Daten am Vorgang und eigene Ereignisse, nach Zeit", () => {
    const ereignisse: EreignisSatz[] = [
      {
        zeitpunkt: "2026-09-20T09:30:00+00:00",
        art: "nachtrag",
        text: "Person nachgetragen",
        intern: true,
        abStufe: 1,
      },
    ];
    const v = satz({ groessenFrist: "2026-09-30", bestelltAm: "2026-10-10" });

    const eintraege = verlauf(v, ereignisse);

    expect(eintraege.map((e) => e.text)).toEqual([
      "Person nachgetragen",
      "Frist für die Größen",
      "Bestellt",
    ]);
    // 09:30 UTC sind in Munster 11:30 – der Verlauf zeigt Ortszeit.
    expect(eintraege[0]).toMatchObject({ uhrzeit: "11:30", intern: true });
  });

  test("Ereignisse stehen in deutscher Zeit, nicht in UTC", () => {
    // Auf der Statusseite rechnet der Kopf („Stand: …“) in Ortszeit um. Stünde
    // der Verlauf daneben in UTC, zeigte eine Seite zwei verschiedene Uhren.
    const sommer = verlauf(satz({ groessenFrist: undefined }), [
      { zeitpunkt: "2026-09-18T06:38:00+00:00", art: "x", text: "Sommerzeit", intern: false, abStufe: 0 },
    ]);
    expect(sommer[0]).toMatchObject({ datum: "18.09.", uhrzeit: "08:38" });

    const winter = verlauf(satz({ groessenFrist: undefined }), [
      { zeitpunkt: "2026-12-01T06:38:00+00:00", art: "x", text: "Winterzeit", intern: false, abStufe: 0 },
    ]);
    expect(winter[0]).toMatchObject({ datum: "01.12.", uhrzeit: "07:38" });

    // Um 23:30 UTC ist in Munster schon der naechste Tag.
    const mitternacht = verlauf(satz({ groessenFrist: undefined }), [
      { zeitpunkt: "2026-09-18T23:30:00+00:00", art: "x", text: "spät", intern: false, abStufe: 0 },
    ]);
    expect(mitternacht[0].datum).toBe("19.09.");
  });

  test("steht ein Lieferant fest, sagt der Verlauf, an wen bestellt wurde", () => {
    const v = satz({ bestelltAm: "2026-10-10", lieferantGewaehlt: "11teamsports" });
    expect(verlauf(v).map((e) => e.text)).toContain("Bestellung an 11teamsports verschickt");
  });

  test("ohne Ereignisse und ohne Daten bleibt der Verlauf leer", () => {
    expect(verlauf(satz({ groessenFrist: undefined }))).toEqual([]);
  });
});

describe("Die sechs Prüfungen", () => {
  const vollstaendig = [{ name: "Kai Böhm", groessen: [{ label: "Oberteil", wert: "L" }], nummer: "7", veraltet: false }];

  test("ein vollständiger Vorgang besteht sie", () => {
    const v = satz({ artikel: [artikel()] });
    const p = pruefungen(v, vollstaendig);

    expect(p).toHaveLength(6);
    expect(p.filter((x) => x.stand === "gefallen")).toEqual([]);
  });

  test("ein Größencheck bekommt nur die eine Prüfung, um die es geht", () => {
    // „Es hängt kein Artikel am Vorgang“ wäre dort ein erfundener Mangel.
    const v = satz({ ausstattungsart: "Nur Größen erfassen", groessenarten: ["oberteil"] });
    const p = pruefungen(v, vollstaendig);

    expect(p).toHaveLength(1);
    expect(p[0].nr).toBe(2);
  });

  test("ein Artikel ohne Herstellernummer und Farbe fällt auf", () => {
    const v = satz({ artikel: [artikel({ herstellernummer: undefined, farbe: undefined })] });
    const p = pruefungen(v, vollstaendig);

    expect(p[0].stand).toBe("gefallen");
    expect(p[0].details.join(" ")).toContain("keine Herstellernummer");
    expect(p[0].details.join(" ")).toContain("keine Farbe");
  });

  test("gar kein Artikel fällt auch auf", () => {
    expect(pruefungen(satz(), vollstaendig)[0].details).toContain("Es hängt kein Artikel am Vorgang.");
  });

  test("eine fehlende Größe wird benannt", () => {
    const v = satz({ artikel: [artikel()] });
    const p = pruefungen(v, [
      { name: "Kai Böhm", groessen: [{ label: "Oberteil", wert: "" }], nummer: "7", veraltet: false },
    ]);
    expect(p[1].details).toEqual(["Kai Böhm: Oberteil fehlt"]);
  });

  test("eine veraltete Größe auch", () => {
    const v = satz({ artikel: [artikel()] });
    const p = pruefungen(v, [
      { name: "Kai Böhm", groessen: [{ label: "Oberteil", wert: "L" }], nummer: "7", veraltet: true },
    ]);
    expect(p[1].details).toEqual(["Kai Böhm: Größe ist veraltet"]);
  });

  test("Rückennummern zählen nur beim Trikotsatz", () => {
    const ohne = [{ name: "Kai Böhm", groessen: [{ label: "Oberteil", wert: "L" }], nummer: "", veraltet: false }];
    expect(pruefungen(satz({ artikel: [artikel()] }), ohne)[2].stand).toBe("bestanden");

    const trikot = satz({ ausstattungsart: "Trikotsatz", artikel: [artikel()] });
    expect(pruefungen(trikot, ohne)[2].details).toEqual(["Kai Böhm: keine Rückennummer"]);
  });

  test("eine doppelte Rückennummer nennt beide Namen", () => {
    const v = satz({ ausstattungsart: "Trikotsatz", artikel: [artikel()] });
    const p = pruefungen(v, [
      { name: "Kai Böhm", groessen: [{ label: "Oberteil", wert: "L" }], nummer: "7", veraltet: false },
      { name: "Uwe Christiani", groessen: [{ label: "Oberteil", wert: "M" }], nummer: "7", veraltet: false },
    ]);
    expect(p[2].details).toEqual(["Rückennummer 7 doppelt: Kai Böhm und Uwe Christiani"]);
  });

  test("eine Rückennummer außerhalb von 1 bis 99 fällt auf", () => {
    const v = satz({ ausstattungsart: "Trikotsatz", artikel: [artikel()] });
    const p = pruefungen(v, [
      { name: "Kai Böhm", groessen: [{ label: "Oberteil", wert: "L" }], nummer: "100", veraltet: false },
    ]);
    expect(p[2].details[0]).toContain("liegt nicht zwischen 1 und 99");
  });

  test("Prüfung 4 bleibt offen, statt zu lügen", () => {
    // Das Vereinslogo als Datei kennt das Datenmodell nicht.
    const p = pruefungen(satz({ artikel: [artikel()] }), vollstaendig);
    expect(p[3].stand).toBe("offen");
  });

  test("ein Artikel ohne Beflockung fällt dagegen auf", () => {
    const v = satz({ artikel: [artikel({ beflockung: undefined })] });
    expect(pruefungen(v, vollstaendig)[3].stand).toBe("gefallen");
  });

  test("fehlende Lieferadresse und Trainer-Mail", () => {
    const v = satz({ artikel: [artikel()], lieferadresse: undefined, trainerEmail: undefined });
    expect(pruefungen(v, vollstaendig)[5].details).toEqual([
      "Lieferadresse fehlt",
      "Trainer-E-Mail fehlt",
    ]);
  });
});

describe("Artikel für die Anzeige", () => {
  test("Hersteller und Bezeichnung werden zu einem Namen", () => {
    expect(artikelVon(satz({ artikel: [artikel()] }))[0]).toMatchObject({
      name: "adidas Trainingsjacke",
      herstellernummer: "10371232",
      groessenart: "oberteil",
    });
  });

  test("ohne Herstellernummer bleibt das Feld leer, statt zu fehlen", () => {
    const a = artikelVon(satz({ artikel: [artikel({ herstellernummer: undefined })] }))[0];
    expect(a.herstellernummer).toBe("");
  });
});
