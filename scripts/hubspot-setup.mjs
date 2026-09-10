#!/usr/bin/env node
/**
 * Richtet HubSpot fuer kitflow ein: Pipeline „Ausstattung“, Eigenschaftsgruppe
 * und die Deal-Eigenschaften aus docs/datenmodell.md. Ergaenzt ausserdem die
 * dokumentierte Luecke bei `kurze_sporthose`.
 *
 * Aufruf:
 *   HUBSPOT_TOKEN=pat-... node scripts/hubspot-setup.mjs          # nur zeigen
 *   HUBSPOT_TOKEN=pat-... node scripts/hubspot-setup.mjs --apply  # anlegen
 *
 * Ohne --apply wird nichts geschrieben, das Skript zeigt nur, was fehlt.
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

if (!TOKEN) {
  console.error("HUBSPOT_TOKEN fehlt. Private App anlegen, Token setzen, erneut starten.");
  process.exit(1);
}

let angelegt = 0;
let vorhanden = 0;
let fehler = 0;

async function api(pfad, methode = "GET", koerper) {
  const antwort = await fetch(`${BASIS}${pfad}`, {
    method: methode,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
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
    options: auswahl(["Trikotsatz", "Weitere Ausstattung"]),
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

  feld("angebot_intersport_betrag", "Angebot Intersport Betrag", "number", "number"),
  feld("angebot_intersport_gueltig_bis", "Angebot Intersport gültig bis", "date", "date"),
  feld("angebot_intersport_lieferzeit", "Angebot Intersport Lieferzeit", "string", "text"),
  feld("angebot_intersport_abweichung", "Angebot Intersport Abweichung", "string", "textarea"),

  feld("angebot_11teamsports_betrag", "Angebot 11teamsports Betrag", "number", "number"),
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

async function feldAnlegen(objekt, definition) {
  try {
    await api(`/crm/v3/properties/${objekt}/${definition.name}`);
    vorhanden++;
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

async function pipelineAnlegen() {
  const vorhandene = await api("/crm/v3/pipelines/deals");
  const treffer = vorhandene.results.find((p) => p.label === "Ausstattung");
  if (treffer) {
    console.log("  Pipeline „Ausstattung“: vorhanden");
    for (const stufe of treffer.stages.sort((a, b) => a.displayOrder - b.displayOrder)) {
      console.log(`    ${stufe.displayOrder + 1}. ${stufe.label}`);
    }
    vorhanden++;
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
  await gruppeAnlegen("deals");
  await gruppeAnlegen("contacts");

  console.log("\nDeal-Eigenschaften");
  for (const definition of DEAL_FELDER) await feldAnlegen("deals", definition);

  console.log("\nKontakt-Eigenschaften");
  for (const definition of KONTAKT_FELDER) await feldAnlegen("contacts", definition);
  await hosengroessenErgaenzen();

  console.log(
    `\nFertig. angelegt: ${angelegt}, schon vorhanden: ${vorhanden}, Fehler: ${fehler}`,
  );
  if (fehler > 0) process.exit(1);
}

main().catch((e) => {
  console.error(`Abbruch: ${e.message}`);
  process.exit(1);
});
