/**
 * Wer zur Spartenleitung gehört — die Regel allein, ohne Netz und ohne Next.
 *
 * Sie steht in einer eigenen Datei, weil zwei sehr verschiedene Orte sie
 * brauchen: `anmeldung.ts` (Server, mit `server-only` und `next/headers`) und
 * `proxy.ts`, das in einer schlankeren Umgebung läuft und deshalb nichts
 * davon importieren darf. Eine Kopie an zwei Stellen wäre die Art von
 * Doppelung, bei der eine Seite irgendwann nachzieht und die andere nicht.
 */

/**
 * Die freigeschalteten Adressen aus `SPARTE_EMAILS` (Komma getrennt).
 *
 * Kleingeschrieben und getrimmt: die Adressen werden von Hand in eine
 * Umgebungsvariable getippt, und „Kai.Boehm@…“ ist dieselbe Person.
 *
 * Eine leere oder fehlende Variable sperrt **alle** aus. Das ist der sichere
 * Ausgang: sonst stünde die Übersicht über alle Vorgänge offen, sobald jemand
 * die Variable vergisst.
 */
export function spartenAdressen(): string[] {
  return (process.env.SPARTE_EMAILS ?? "")
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a.includes("@"));
}

/** Steht diese Adresse auf der Liste? */
export function darfSparte(email: string | null | undefined): boolean {
  if (!email) return false;
  return spartenAdressen().includes(email.trim().toLowerCase());
}
