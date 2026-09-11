import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { IconChevronDown } from "./icons";

/**
 * Bausteine nach docs/design-coachbase.md. Rezepte stehen dort, hier ist ihre
 * einzige Umsetzung – Klassen nicht an anderer Stelle wiederholen.
 */

type ButtonVariante = "primary" | "neon" | "sekundaer";

const VARIANTEN: Record<ButtonVariante, string> = {
  // Primäraktion: der dunkle Knopf.
  primary:
    "rounded-xl bg-ink-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink-800",
  // Marketing-CTA: höchstens einer je Bildschirm, nur auf Inhaltsseiten.
  neon: "rounded-xl bg-signal-400 px-5 py-2.5 text-sm font-semibold text-ink-950 hover:bg-signal-300",
  // Sekundär als Pill.
  sekundaer:
    "rounded-full border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-800 hover:bg-ink-50",
};

export function Button({
  variante = "primary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: ButtonVariante;
}) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50 ${VARIANTEN[variante]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-ink-200 bg-white shadow-soft ${className}`}>
      {children}
    </div>
  );
}

/**
 * Gebrandetes Select: nativer select ohne OS-Pfeil, eigener Chevron.
 *
 * Nimmt die Eigenschaften eines echten `select`, damit es sowohl kontrolliert
 * (value und onChange) als auch im Formular (name und defaultValue) taugt.
 * `className` liegt am Rahmen, damit die Breite den Chevron mitnimmt.
 */
export function SelectFeld({
  children,
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={`relative ${className}`}>
      <select
        {...props}
        className="w-full cursor-pointer appearance-none rounded-lg border border-ink-200 bg-white py-2 pr-9 pl-3 text-sm text-ink-800 focus:border-pitch-400 focus:ring-2 focus:ring-pitch-100 focus:outline-none"
      >
        {children}
      </select>
      <IconChevronDown
        width={16}
        height={16}
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-400"
      />
    </div>
  );
}

/** Semantik nach Designdoku: Erfolg = pitch, Info = blue, Achtung = amber, Fehler = red. */
export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "pitch" | "blue" | "amber" | "red" | "outline";
  className?: string;
}) {
  const tones = {
    neutral: "bg-ink-100 text-ink-700",
    pitch: "bg-pitch-100 text-pitch-800",
    blue: "bg-blue-100 text-blue-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
    outline: "border border-ink-200 bg-white text-ink-700",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * Kennzeichnung für Beispieldaten. Pflicht überall dort, wo Namen, Termine oder
 * Beträge erfunden sind – siehe CLAUDE.md.
 */
export function DemoBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="Beispieldaten – kein echter Vorgang"
      className={`inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-amber-700 uppercase ring-1 ring-amber-200 ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Beispieldaten
    </span>
  );
}

/** Dunkle Icon-Fliese – der einzige Ort, an dem Neon Vordergrund ist. */
export function Fliese({
  children,
  gross = false,
  puls = false,
}: {
  children: ReactNode;
  gross?: boolean;
  puls?: boolean;
}) {
  return (
    <span
      className={`relative flex flex-none items-center justify-center bg-ink-950 text-signal-400 ${
        gross ? "h-12 w-12 rounded-[14px]" : "h-10 w-10 rounded-xl"
      } ${puls ? "kf-live" : ""}`}
    >
      {children}
    </span>
  );
}
