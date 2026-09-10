# kitflow – Design nach Coachbase

Quelle: Kais Coachbase-Design-System (design.md, Stand 10.09.2026). kitflow übernimmt Tokens, Rollen und Rezepte 1:1. Quelle der Wahrheit in Coachbase: src/app/globals.css (@theme, Tailwind v4) und src/components/.

## Tokens
- pitch (Identität, Violett): 50 #f5f3ff · 100 #ede9fe · 200 #ddd6fe · 300 #c4b5fd · 400 #a78bfa · 500 #8b5cf6 · 600 #7c3aed · 700 #6d28d9 · 800 #5b21b6 · 900 #4c1d95 · 950 #2e1065
- signal (Akzent, Neon-Lime): 300 #ddff66 · 400 #c6ff1a · 500 #aef000 · 600 #8bc400
- ink (Neutrale, Zinc): 50 #fafafa · 100 #f4f4f5 · 200 #e4e4e7 · 300 #d4d4d8 · 400 #a1a1aa · 500 #71717a · 600 #52525b · 700 #3f3f46 · 800 #27272a · 900 #18181b · 950 #09090b
- paper #fafafa (body), Karten bg-white
- Schrift: Geist Sans (sans und display), Geist Mono
- Schatten: shadow-soft (Karten, erhobene Buttons), shadow-pop (Dialoge), shadow-float (stark abgehoben)
- Neue Farbe nur als Token in @theme, keine Hex-Werte im JSX

## Farbrollen
- Primäraktion: bg-ink-950 text-white hover:bg-ink-800
- Marketing-CTA: bg-signal-400 text-ink-950 hover:bg-signal-300 (nur Landing/Inhalt, max. einer pro Bildschirm)
- Sekundär: border border-ink-200 bg-white text-ink-800 hover:bg-ink-50
- Identität/Fokus: pitch-* (Fokusring, aktive Nav, Zähler-Badges, Eyebrows)
- Dunkle Fliese: bg-ink-950 text-signal-400 (einziger Ort für Neon als Vordergrund)
- Fließtext text-ink-900, sekundär text-ink-600; ink-400 nur Metadaten
- Rahmen border-ink-200; Leerzustand border-dashed border-ink-300
- Semantik: Erfolg = pitch, Info = blue, Achtung/Demo = amber, Fehler = red
- signal-400 nie als Text auf Weiß; Hervorhebung im Text über .neon-mark

## Typografie
- .font-display (Tracking −0.025em, ss01, balance) für jede Headline
- .eyebrow: Geist Mono 11px uppercase, Tracking 0.12em, meist text-pitch-600
- .tnum für Zahlen, .text-pretty für Absätze
- h1: font-display text-3xl font-extrabold tracking-tight text-ink-900
- h2: font-display text-2xl font-bold tracking-tight text-ink-900
- h3: font-display text-lg font-bold text-ink-900
- Label: block text-xs font-medium text-ink-500; Metadaten text-xs text-ink-400

## Form, Abstand, Ebenen
- Radius: Karten rounded-2xl · Buttons rounded-xl/lg · Felder rounded-lg · Pills rounded-full · Dialoge rounded-t-3xl sm:rounded-3xl
- Container mx-auto px-4: max-w-6xl (Listen), max-w-3xl (Inhalt/Formular), max-w-2xl (Lauftext), max-w-md (Dialog)
- Header z-40 sticky h-16 · Overlay z-30 · Dialoge z-50
- Bewegung 150–250 ms, transition-colors; prefers-reduced-motion respektieren

## Rezepte
- Primärbutton: rounded-xl bg-ink-950 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-50
- Sekundär/Pill: inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-800 hover:bg-ink-50
- Feld: mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-pitch-400 focus:outline-none focus:ring-2 focus:ring-pitch-100 (einzige Fokus-Behandlung)
- Leerzustand: rounded-2xl border border-dashed border-ink-300 bg-white p-10 text-center text-ink-500
- Dialog-Shell: fixed inset-0 z-50 … bg-ink-950/50 backdrop-blur-sm; Panel max-w-md rounded-t-3xl bg-white p-6 shadow-pop sm:rounded-3xl
- Dunkle Icon-Fliese: flex h-10 w-10 items-center justify-center rounded-xl bg-ink-950 text-signal-400

## Regeln
- Keine Emojis als Icons; Icon-only-Buttons mit aria-label
- Typografische Anführungszeichen („…“) in JSX-Text
- Kontaktdaten nie direkt sichtbar
- Demo-Daten markieren (DemoBadge)
- Offene Punkte aus Coachbase gleich richtig machen: eine Button-Komponente mit Varianten primary/neon/sekundaer, Overlay ink-950/50, nur pitch statt violet, h1 = font-extrabold
