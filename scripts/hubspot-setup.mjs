#!/usr/bin/env node
/**
 * Richtet HubSpot fuer kitflow ein: Pipeline „Ausstattung“, Eigenschaftsgruppe
 * und die Deal-Eigenschaften aus docs/datenmodell.md. Ergaenzt ausserdem die
 * dokumentierte Luecke bei `kurze_sporthose`.
 *
 * Aufruf:
 *   npm run hubspot-setup             # nur zeigen
 *   npm run hubspot-setup -- --apply  # anlegen
 *
 * Der npm-Aufruf setzt `--use-env-proxy`. Ohne das ignoriert fetch in Node 22
 * die Proxy-Variablen und laeuft in der Cloud-Umgebung in eine Sperre. Ohne
 * Proxy im Netz ist das Flag wirkungslos.
 *
 * Ohne --apply wird nichts geschrieben, das Skript zeigt nur, was fehlt.
 *
 * Der Schluessel kommt entweder aus HUBSPOT_TOKEN oder, in der Cloud-Umgebung,
 * vom Proxy: dort haengen die Zugangsdaten am Host api.hubapi.com und der
 * Authorization-Header wird jeder Anfrage angehaengt. Dann darf das Skript
 * keinen eigenen Header setzen, sonst stehen zwei drin.
 *
 * Das Skript ist wiederholbar: Vorhandenes wird erkannt und uebersprungen, nie
 * ueberschrieben. Es loescht nichts.
 *
 * Noetige Scopes der Private App:
 *   crm.schemas.deals.write, crm.schemas.contacts.write
 *   (zum Lesen zusaetzlich die Scopes aus docs/datenmodell.md)
 */

const BASIS = "https://api.hubapi.com";
const TOKEN = process.env.HUBSPOT_TOKEN;
const ANWENDEN = process.argv.includes("--apply");

let angelegt = 0;
let vorhanden = 0;
let fehler = 0;

async function api(pfad, methode = "GET", koerper) {
  const kopf = { "Content-Type": "application/json" };
  if (TOKEN) kopf.Authorization = `Bearer ${TOKEN}`;

  const antwort = await fetch(`${BASIS}${pfad}`, {
    method: methode,
    headers: kopf,
    body: koerper ? JSON.stringify(koerper) : undefined,
  });
  const text = await antwort.text();

  // Nicht jede Antwort ist JSON: ein Proxy oder eine Fehlerseite liefert Text.
  let daten = {};
  if (text) {
    try {
      daten = JSON.parse(text);
    } catch {
      if (antwort.ok) throw new Error(`Unerwartete Antwort von ${pfad}: ${text.slice(0, 120)}`);
      daten = { message: text.slice(0, 200) };
    }
  }

  if (!antwort.ok) {
    const fehlerObjekt = new Error(daten.message ?? `HTTP ${antwort.status}`);
    fehlerObjekt.status = antwort.status;
    throw fehlerObjekt;
  }
  return daten;
}

/** Die Stufen aus docs/konzept.md, in dieser Reihenfolge. */
const STUFEN = [
  // Stufe 0: der Trainer hat grob gemeldet und holt einen Richtpreis fuer den
  // Sponsor. Sie steht vor „Groessen laufen“ (docs/konzept.md).
  { label: "Voranfrage", probability: 0.05 },
  { label: "Größen laufen", probability: 0.1 },
  { label: "Anfrage raus", probability: 0.2 },
  { label: "Angebote da", probability: 0.4 },
  { label: "Finanzierung", probability: 0.6 },
  { label: "Bestellbar", probability: 0.8 },
  { label: "Bestellt", probability: 0.9 },
  { label: "Geliefert", probability: 0.95 },
  { label: "Abgeschlossen", geschlossen: "won" },
  { label: "Abgebrochen", geschlossen: "lost" },
];

/** Mannschaften – dieselben Werte wie die Kontakt-Eigenschaft `team`. */
const TEAMS = [
  "2022", "2021", "2020", "2019", "2018", "2017", "2016", "2015",
  "2014", "2013", "2012", "2011", "2010", "2009", "2008", "2007",
  "1. Herren", "2. Herren", "3. Herren",
  "Ü30 Herren", "Ü40 Team 1", "Ü40 Team 2", "Ü40 Team 3",
  "Damen", "Mädchen", "Sponsoring",
];

/**
 * Ausstattungsarten – dieselben Werte wie `AUSSTATTUNGSARTEN` in
 * src/lib/mannschaften.ts. Dieses Skript ist reines JavaScript und kann das
 * Modul nicht importieren; weichen die Listen ab, weist HubSpot den Deal mit
 * `INVALID_OPTION` ab.
 */
const AUSSTATTUNGSARTEN = ["Trikotsatz", "Weitere Ausstattung", "Nur Größen erfassen"];

const GRUPPE = "ausstattung";

function auswahl(werte) {
  return werte.map((wert, i) => ({ label: wert, value: wert, displayOrder: i }));
}

function feld(name, label, typ, feldTyp, extra = {}) {
  return { name, label, type: typ, fieldType: feldTyp, groupName: GRUPPE, ...extra };
}

/** Deal-Eigenschaften nach docs/datenmodell.md. */
const DEAL_FELDER = [
  feld("vorgangsnummer", "Vorgangsnummer", "string", "text", {
    description: "AUS-JJJJ-NNN, laufend je Jahr",
  }),
  feld("ausstattungsart", "Ausstattungsart", "enumeration", "select", {
    options: auswahl([...AUSSTATTUNGSARTEN]),
  }),
  feld("mannschaft", "Mannschaft", "enumeration", "checkbox", { options: auswahl(TEAMS) }),
  feld("mannschaftscode", "Mannschaftscode", "string", "text", {
    description: "z. B. JG2014-2015, fuer den Verwendungszweck",
  }),
  feld("trainer_email", "Trainer E-Mail", "string", "text"),
  feld("groessen_frist", "Größen-Frist", "date", "date"),
  feld("lieferadresse", "Lieferadresse", "string", "textarea"),
  feld("ausgeschlossene_spieler", "Ausgeschlossene Spieler", "string", "textarea", {
    description: "Record-IDs, vom Trainer gesetzt",
  }),
  // Gegenstueck zu ausgeschlossene_spieler: wer diese Runde Torwart ist und
  // deshalb die Torwartartikel bekommt (docs/formulare.md, F2 als Trainer).
  feld("torwarte", "Torwarte", "string", "textarea", {
    description: "Record-IDs, vom Trainer gesetzt",
  }),
  // Nur im einfachen Modus von F1: die geschaetzte Kadergroesse. Mal „Stueck je
  // Person“ ergibt die Menge fuer die Voranfrage (docs/datenmodell.md).
  feld("personen_geschaetzt", "Personen geschätzt", "number", "number", {
    description: "F1 einfacher Modus, Grundlage der Voranfrage",
  }),
  // Braucht dieser Vorgang Initialen auf der Kleidung? Gesetzt in F1 bzw. F1b,
  // gelesen von F2: ohne das Haekchen fragt niemand nach Initialen, und ein
  // Ball soll auch nie danach fragen (docs/formulare.md).
  feld("initialen_noetig", "Initialen nötig", "enumeration", "booleancheckbox", {
    description: "F1, schaltet die Initialen-Abfrage in F2 frei",
    options: [
      { label: "Ja", value: "true", displayOrder: 0 },
      { label: "Nein", value: "false", displayOrder: 1 },
    ],
  }),
  // Welche Groessen gefragt werden, wenn es keine Artikel gibt. Bei einem
  // normalen Vorgang sagen das die Positionen; ein reiner Groessencheck hat
  // keine, und dann steht es hier (docs/formulare.md).
  feld("groessenarten", "Größenarten", "string", "text", {
    description: "F1 „Nur Größen erfassen“, Semikolonliste – z. B. trikot;oberteil",
  }),
  feld("liste_bestaetigt_am", "Liste bestätigt am", "date", "date", {
    description: "F3, Bestaetigung des Trainers",
  }),
  feld("hinweis_haendler", "Hinweis an die Händler", "string", "textarea", {
    description: "F3, geht in die Anfrage",
  }),

  feld("angebot_intersport_betrag", "Angebot Intersport Betrag", "number", "number"),
  feld("angebot_intersport_am", "Angebot Intersport eingegangen am", "date", "date"),
  feld("angebot_intersport_gueltig_bis", "Angebot Intersport gültig bis", "date", "date"),
  feld("angebot_intersport_lieferzeit", "Angebot Intersport Lieferzeit", "string", "text"),
  feld("angebot_intersport_abweichung", "Angebot Intersport Abweichung", "string", "textarea"),

  feld("angebot_11teamsports_betrag", "Angebot 11teamsports Betrag", "number", "number"),
  feld("angebot_11teamsports_am", "Angebot 11teamsports eingegangen am", "date", "date"),
  feld("angebot_11teamsports_gueltig_bis", "Angebot 11teamsports gültig bis", "date", "date"),
  feld("angebot_11teamsports_lieferzeit", "Angebot 11teamsports Lieferzeit", "string", "text"),
  feld("angebot_11teamsports_abweichung", "Angebot 11teamsports Abweichung", "string", "textarea"),

  feld("lieferant_gewaehlt", "Lieferant gewählt", "enumeration", "select", {
    options: auswahl(["Intersport Uelzen", "11teamsports"]),
  }),
  feld("kaskadenstufe", "Kaskadenstufe", "number", "number", {
    description: "1 bis 3, nur bei Trikotsatz",
  }),
  feld("stufe_frist", "Frist der Kaskadenstufe", "date", "date"),

  feld("zahlweg_mannschaft", "Zahlweg Mannschaft", "enumeration", "select", {
    options: auswahl(["Anteil an Verein", "Vorkasse"]),
  }),
  feld("rechnungsempfaenger", "Rechnungsempfänger", "string", "text"),
  feld("erstattung_kontoinhaber", "Erstattung Kontoinhaber", "string", "text"),
  // Nach Abschluss des Vorgangs loeschen (docs/datenmodell.md).
  feld("erstattung_iban", "Erstattung IBAN", "string", "text", {
    description: "Nach Abschluss des Vorgangs loeschen",
  }),

  feld("zusage_sponsor", "Zusage Sponsor", "number", "number"),
  feld("eingang_verein", "Eingang Vereinskonto", "number", "number"),
  feld("eingang_am", "Geld eingegangen am", "date", "date", {
    description: "Tag, an dem die Deckung erfuellt war",
  }),
  feld("vorkasse_bestaetigt", "Vorkasse bestätigt", "number", "number"),
  feld("spartenbudget_freigegeben", "Spartenbudget freigegeben", "number", "number"),

  feld("bestellt_am", "Bestellt am", "date", "date"),
  feld("geliefert_am", "Geliefert am", "date", "date"),
  feld("rechnung_betrag", "Rechnung Betrag", "number", "number"),
  feld("rechnung_abweichung", "Rechnung weicht ab", "enumeration", "booleancheckbox", {
    options: [
      { label: "Ja", value: "true", displayOrder: 0 },
      { label: "Nein", value: "false", displayOrder: 1 },
    ],
  }),
  feld("erstattung_betrag", "Erstattung Betrag", "number", "number"),
  feld("erstattet_am", "Erstattet am", "date", "date"),
];

/** Zwei neue Kontakt-Eigenschaften aus docs/datenmodell.md. */
const KONTAKT_FELDER = [
  {
    name: "groesse_zuletzt_bestaetigt_am",
    label: "Größe zuletzt bestätigt am",
    type: "date",
    fieldType: "date",
    groupName: GRUPPE,
  },
  {
    name: "bekleidung_zuletzt_erhalten_am",
    label: "Bekleidung zuletzt erhalten am",
    type: "date",
    fieldType: "date",
    groupName: GRUPPE,
  },
];

/**
 * Produkt-Eigenschaften nach docs/datenmodell.md.
 *
 * `groessenart` und `fuer` speichern genau die Schluessel aus src/lib/typen.ts,
 * damit die App die Werte ohne Uebersetzungstabelle lesen kann.
 */
const PRODUKT_FELDER = [
  feld("artikelnr_intersport", "Artikelnr. Intersport", "string", "text"),
  feld("artikelnr_11teamsports", "Artikelnr. 11teamsports", "string", "text"),
  feld("hersteller", "Hersteller", "string", "text"),
  feld("farbe", "Farbe", "string", "text"),
  feld("groessenart", "Größenart", "enumeration", "select", {
    options: [
      { label: "Trikot", value: "trikot", displayOrder: 0 },
      { label: "Oberteil", value: "oberteil", displayOrder: 1 },
      { label: "Kurze Sporthose", value: "shorts", displayOrder: 2 },
      { label: "Trainingshose", value: "trainingshose", displayOrder: 3 },
      { label: "Schuhgröße", value: "schuhe", displayOrder: 4 },
      { label: "ohne Größe", value: "ohne", displayOrder: 5 },
    ],
  }),
  feld("fuer", "Für", "enumeration", "select", {
    options: [
      { label: "Alle", value: "alle", displayOrder: 0 },
      { label: "Feldspieler", value: "feldspieler", displayOrder: 1 },
      { label: "Torwart", value: "torwart", displayOrder: 2 },
    ],
  }),
  feld("beflockung_standard", "Beflockung Standard", "string", "text"),
  feld("aktiv", "Aktiv", "enumeration", "booleancheckbox", {
    options: [
      { label: "Ja", value: "true", displayOrder: 0 },
      { label: "Nein", value: "false", displayOrder: 1 },
    ],
  }),
  feld("auslaufdatum", "Auslaufdatum", "date", "date"),
];

/** Positionen = Person x Artikel am Deal (docs/datenmodell.md). */
const POSITION_FELDER = [
  feld("groesse", "Größe", "string", "text"),
  feld("rueckennummer", "Rückennummer", "string", "text"),
  feld("spieler_hsid", "Spieler Record-ID", "string", "text"),
  // Bei Jugendmannschaften nie anzeigen (CLAUDE.md). Die App zaehlt dann nur.
  feld("spieler_name", "Spieler Name", "string", "text"),
  feld("sponsor", "Sponsor", "string", "text"),
  // Der Groessenbereich der Voranfrage. `groesse` bleibt die Groesse EINER
  // Person; diese beiden gelten fuer die ganze Position (docs/konzept.md).
  feld("groesse_von", "Größenbereich von", "string", "text", {
    description: "F1 einfacher Modus, untere Grenze",
  }),
  feld("groesse_bis", "Größenbereich bis", "string", "text", {
    description: "F1 einfacher Modus, obere Grenze",
  }),
];

/** Firmen sind Sponsoren oder Lieferanten (docs/datenmodell.md). */
const FIRMEN_FELDER = [
  feld("rolle", "Rolle", "enumeration", "select", {
    options: auswahl(["Sponsor", "Lieferant"]),
  }),
];

/** kurze_sporthose kennt bisher nur S bis XXXL (docs/datenmodell.md). */
const HOSEN_GROESSEN = [
  "116", "128", "140", "152", "164", "176",
  "XS", "S", "M", "L", "XL", "XXL", "XXXL",
];

async function gruppeAnlegen(objekt) {
  try {
    await api(`/crm/v3/properties/${objekt}/groups/${GRUPPE}`);
    console.log(`  Gruppe „Ausstattung“ auf ${objekt}: vorhanden`);
    vorhanden++;
  } catch (e) {
    if (e.status !== 404) throw e;
    if (!ANWENDEN) {
      console.log(`  Gruppe „Ausstattung“ auf ${objekt}: WÜRDE angelegt`);
      return;
    }
    await api(`/crm/v3/properties/${objekt}/groups`, "POST", {
      name: GRUPPE,
      label: "Ausstattung",
      displayOrder: -1,
    });
    console.log(`  Gruppe „Ausstattung“ auf ${objekt}: angelegt`);
    angelegt++;
  }
}

/**
 * Traegt Auswahlmoeglichkeiten nach, die an einer vorhandenen Eigenschaft noch
 * fehlen.
 *
 * Wichtig, weil `feldAnlegen` eine vorhandene Eigenschaft sonst gar nicht
 * anfasst: eine neue Ausstattungsart stuende dann zwar im Code, aber HubSpot
 * wiese sie mit `INVALID_OPTION` ab – und das Skript meldete „vollstaendig“.
 *
 * Entfernt wird nichts. Eine Option, die an einem Datensatz haengt, wegzunehmen
 * hiesse, dessen Wert ungueltig zu machen.
 */
async function optionenNachtragen(objekt, definition, da) {
  if (!definition.options || !da.options) return false;

  const vorhandeneWerte = new Set(da.options.map((o) => o.value));
  const fehlende = definition.options.filter((o) => !vorhandeneWerte.has(o.value));
  if (fehlende.length === 0) return false;

  const namen = fehlende.map((o) => o.label).join(", ");
  if (!ANWENDEN) {
    console.log(`  WÜRDE ergänzen: ${objekt}.${definition.name} um ${namen}`);
    return true;
  }

  const alle = [...da.options, ...fehlende].map((o, i) => ({
    label: o.label,
    value: o.value,
    displayOrder: i,
  }));
  try {
    await api(`/crm/v3/properties/${objekt}/${definition.name}`, "PATCH", { options: alle });
    console.log(`  ergänzt: ${objekt}.${definition.name} um ${namen}`);
    angelegt++;
  } catch (e) {
    console.error(`  FEHLER bei ${objekt}.${definition.name}: ${e.message}`);
    fehler++;
  }
  return true;
}

async function feldAnlegen(objekt, definition) {
  try {
    const da = await api(`/crm/v3/properties/${objekt}/${definition.name}`);
    if (!(await optionenNachtragen(objekt, definition, da))) vorhanden++;
    return;
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  if (!ANWENDEN) {
    console.log(`  WÜRDE anlegen: ${objekt}.${definition.name}`);
    return;
  }
  try {
    await api(`/crm/v3/properties/${objekt}`, "POST", definition);
    console.log(`  angelegt: ${objekt}.${definition.name}`);
    angelegt++;
  } catch (e) {
    console.error(`  FEHLER bei ${objekt}.${definition.name}: ${e.message}`);
    fehler++;
  }
}

/**
 * Traegt Stufen nach, die es in einer vorhandenen Pipeline noch nicht gibt.
 *
 * Ohne das bliebe eine produktive Pipeline fuer immer auf dem Stand ihres
 * Anlegetags. Geloescht oder umbenannt wird nie: nur ergaenzt, danach werden
 * alle Stufen in die Reihenfolge aus STUFEN gebracht.
 */
async function stufenErgaenzen(pipeline) {
  const vorhandeneLabels = new Set(pipeline.stages.map((s) => s.label));
  const fehlende = STUFEN.filter((s) => !vorhandeneLabels.has(s.label));

  if (fehlende.length === 0) {
    console.log("  Stufen: vollständig");
    vorhanden++;
    return;
  }
  if (!ANWENDEN) {
    console.log(`  Stufen: WÜRDE ergänzt um ${fehlende.map((s) => s.label).join(", ")}`);
    return;
  }

  for (const stufe of fehlende) {
    await api(`/crm/v3/pipelines/deals/${pipeline.id}/stages`, "POST", {
      label: stufe.label,
      displayOrder: STUFEN.findIndex((s) => s.label === stufe.label),
      metadata: {
        isClosed: stufe.geschlossen ? "true" : "false",
        probability: stufe.geschlossen === "won" ? "1.0" : stufe.geschlossen === "lost" ? "0.0" : String(stufe.probability),
      },
    });
    console.log(`  Stufe „${stufe.label}“: angelegt`);
    angelegt++;
  }

  // Die Reihenfolge richtigstellen. Einzelne PATCHes reichen nicht: HubSpot
  // schiebt bei jedem die uebrigen mit, das Ergebnis haengt an der Aufruffolge.
  // Das PUT setzt die ganze Liste auf einmal. Es enthaelt jede vorhandene Stufe
  // mit ihrer ID, damit keine verloren geht.
  const neu = await api(`/crm/v3/pipelines/deals/${pipeline.id}`);
  const rang = (stufe) => {
    const i = STUFEN.findIndex((s) => s.label === stufe.label);
    return i < 0 ? STUFEN.length : i;
  };
  const sortiert = [...neu.stages].sort((a, b) => rang(a) - rang(b));
  try {
    await api(`/crm/v3/pipelines/deals/${pipeline.id}`, "PUT", {
      label: neu.label,
      displayOrder: neu.displayOrder,
      stages: sortiert.map((stufe, i) => ({
        id: stufe.id,
        label: stufe.label,
        displayOrder: i,
        metadata: stufe.metadata,
      })),
    });
    console.log("  Reihenfolge der Stufen: gesetzt");
  } catch (e) {
    console.error(`  Reihenfolge der Stufen nicht gesetzt: ${e.message}`);
    fehler++;
  }
}

async function pipelineAnlegen() {
  const vorhandene = await api("/crm/v3/pipelines/deals");
  const treffer = vorhandene.results.find((p) => p.label === "Ausstattung");
  if (treffer) {
    console.log("  Pipeline „Ausstattung“: vorhanden");
    for (const stufe of treffer.stages.sort((a, b) => a.displayOrder - b.displayOrder)) {
      console.log(`    ${stufe.displayOrder + 1}. ${stufe.label}`);
    }
    vorhanden++;
    await stufenErgaenzen(treffer);
    return;
  }
  if (!ANWENDEN) {
    console.log("  Pipeline „Ausstattung“: WÜRDE angelegt, mit diesen Stufen:");
    STUFEN.forEach((s, i) => console.log(`    ${i + 1}. ${s.label}`));
    return;
  }
  const erstellt = await api("/crm/v3/pipelines/deals", "POST", {
    label: "Ausstattung",
    displayOrder: 0,
    stages: STUFEN.map((s, i) => ({
      label: s.label,
      displayOrder: i,
      metadata: {
        isClosed: s.geschlossen ? "true" : "false",
        probability: s.geschlossen === "won" ? "1.0" : s.geschlossen === "lost" ? "0.0" : String(s.probability),
      },
    })),
  });
  console.log(`  Pipeline „Ausstattung“: angelegt (id ${erstellt.id})`);
  angelegt++;
}

async function hosengroessenErgaenzen() {
  const aktuell = await api("/crm/v3/properties/contacts/kurze_sporthose");
  const vorhandeneWerte = new Set((aktuell.options ?? []).map((o) => o.value));
  const fehlende = HOSEN_GROESSEN.filter((g) => !vorhandeneWerte.has(g));
  if (fehlende.length === 0) {
    console.log("  kurze_sporthose: vollständig");
    vorhanden++;
    return;
  }
  if (!ANWENDEN) {
    console.log(`  kurze_sporthose: WÜRDE ergänzt um ${fehlende.join(", ")}`);
    return;
  }
  await api("/crm/v3/properties/contacts/kurze_sporthose", "PATCH", {
    options: auswahl(HOSEN_GROESSEN),
  });
  console.log(`  kurze_sporthose: ergänzt um ${fehlende.join(", ")}`);
  angelegt++;
}

async function main() {
  console.log(
    ANWENDEN
      ? "kitflow richtet HubSpot ein.\n"
      : "Trockenlauf. Es wird nichts geschrieben. Mit --apply anwenden.\n",
  );

  console.log("Pipeline");
  await pipelineAnlegen();

  console.log("\nEigenschaftsgruppe");
  for (const objekt of ["deals", "contacts", "products", "line_items", "companies"]) {
    await gruppeAnlegen(objekt);
  }

  console.log("\nDeal-Eigenschaften");
  for (const definition of DEAL_FELDER) await feldAnlegen("deals", definition);

  console.log("\nKontakt-Eigenschaften");
  for (const definition of KONTAKT_FELDER) await feldAnlegen("contacts", definition);
  await hosengroessenErgaenzen();

  console.log("\nProdukt-Eigenschaften");
  for (const definition of PRODUKT_FELDER) await feldAnlegen("products", definition);

  console.log("\nPositions-Eigenschaften");
  for (const definition of POSITION_FELDER) await feldAnlegen("line_items", definition);

  console.log("\nFirmen-Eigenschaften");
  for (const definition of FIRMEN_FELDER) await feldAnlegen("companies", definition);

  console.log(
    `\nFertig. angelegt: ${angelegt}, schon vorhanden: ${vorhanden}, Fehler: ${fehler}`,
  );
  if (fehler > 0) process.exit(1);
}

main().catch((e) => {
  console.error(`Abbruch: ${e.message}`);
  process.exit(1);
});
