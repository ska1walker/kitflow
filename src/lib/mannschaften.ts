/**
 * Die Mannschaften des Vereins, exakt die Werte der HubSpot-Eigenschaft `team`
 * (docs/datenmodell.md). Weichen sie ab, findet F1 keine Spieler.
 *
 * Jahrgänge zuerst, weil sie am häufigsten gewählt werden.
 */

export const TEAMS = [
  "2022", "2021", "2020", "2019", "2018", "2017", "2016", "2015",
  "2014", "2013", "2012", "2011", "2010", "2009", "2008", "2007",
  "1. Herren", "2. Herren", "3. Herren",
  "Ü30 Herren", "Ü40 Team 1", "Ü40 Team 2", "Ü40 Team 3",
  "Damen", "Mädchen",
];

export const AUSSTATTUNGSARTEN = ["Trikotsatz", "Weitere Ausstattung"];

/** Beflockung je Artikel (docs/konzept.md). */
export const BEFLOCKUNGEN = ["Standard", "Ohne", "Abweichend"];
