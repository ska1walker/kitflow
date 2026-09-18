import { abmelden } from "@/app/sparte/aktion";

/**
 * Wer angemeldet ist, und der Weg hinaus.
 *
 * Als Formular statt als Link: Abmelden ändert etwas und gehört deshalb hinter
 * ein POST. Ein Link darauf würde von jedem Vorschaubild-Lader ausgelöst, das
 * die Seite besucht.
 */
export function Abmelden({ email }: { email: string }) {
  return (
    <span className="flex items-center gap-3 text-[13px] text-ink-600">
      <span className="hidden max-w-[220px] truncate sm:inline" title={email}>
        {email}
      </span>
      <form action={abmelden}>
        <button
          type="submit"
          className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-ink-800 transition-colors hover:bg-ink-50"
        >
          Abmelden
        </button>
      </form>
    </span>
  );
}
