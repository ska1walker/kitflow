import { BedarfFormular } from "@/components/bedarf-formular";

/**
 * F1 · Bedarf melden (docs/formulare.md).
 *
 * Die einzige Seite ohne signierten Link: sie geht offen an alle Trainer. Sie
 * liest nichts aus HubSpot, sie legt nur an. Es gibt hier also nichts zu sehen,
 * was jemandem gehört.
 */
export default function BedarfSeite() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <BedarfFormular />
    </main>
  );
}
