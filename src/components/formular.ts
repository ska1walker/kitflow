"use client";

import { startTransition, type FormEvent } from "react";

/**
 * Schickt ein Formular ab, ohne dass es danach leer ist.
 *
 * React 19 setzt ein Formular automatisch zurueck, sobald die Server Action
 * durch ist – auch dann, wenn sie einen Fehler gemeldet hat. Wer ein Feld
 * vergessen hat, steht danach vor einem leeren Formular und tippt alles neu.
 *
 * Deshalb wird die Action hier von Hand aufgerufen statt ueber `action={…}`:
 * dann ruehrt React die Felder nicht an, und die Eingaben ueberstehen eine
 * Fehlermeldung. Die Pruefung des Browsers (`required`) laeuft vorher wie
 * gewohnt.
 *
 * Preis: ohne JavaScript wird nicht abgeschickt. Diese Formulare brauchen
 * JavaScript ohnehin – fuer den Modus-Umschalter, „Artikel hinzufuegen“ und
 * die Felder, die von einer Auswahl abhaengen.
 */
export function abschicken(absenden: (daten: FormData) => void) {
  return (ereignis: FormEvent<HTMLFormElement>) => {
    ereignis.preventDefault();
    const daten = new FormData(ereignis.currentTarget);
    startTransition(() => absenden(daten));
  };
}
