import Link from "next/link";
import { loadConfig } from "@/lib/config";
import { evaluateHousehold } from "@/lib/pipeline";
import type { BreakCandidate } from "@/lib/detector/breakDetector";

// Household state changes minute to minute — never statically cache this page.
export const dynamic = "force-dynamic";

function breakLabel(breakClass: BreakCandidate["breakClass"]): string {
  switch (breakClass) {
    case "absence":
      return "Absence break";
    case "nocturnal-anomaly":
      return "Nocturnal anomaly";
    case "sequence-break":
      return "Sequence break";
    case "silence-after-anomaly":
      return "Silence after anomaly";
  }
}

export default async function Home() {
  const config = loadConfig();
  const { baseline, breaks } = await evaluateHousehold();

  const householdAnchors = baseline.anchors.filter((a) => a.scope === "household");
  const isLearning = householdAnchors.every((a) => a.confidence === "learning");

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col gap-8 px-6 py-12 sm:px-10">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">QuietSignal</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              It watches the routine, never the person.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {config.demoMode && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                Demo mode
              </span>
            )}
            <Link href="/resident" className="text-sm font-medium underline underline-offset-4">
              Resident view
            </Link>
          </div>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          {breaks.length === 0 ? (
            <p className="text-lg font-medium text-emerald-700 dark:text-emerald-400">
              All normal — today&apos;s rhythm looks typical.
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {breaks.map((b) => (
                <li key={b.id} className="rounded-xl bg-amber-50 p-4 dark:bg-amber-950/30">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-amber-900 dark:text-amber-300">
                      {breakLabel(b.breakClass)}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {b.confirmed ? "Escalated" : "Monitoring — not yet escalated"}
                    </span>
                  </div>
                  <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700 dark:text-zinc-300">
                    {b.reasons.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Learning mode {isLearning && "— still building this household's baseline"}
          </h2>
          <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-100 text-left dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Routine</th>
                  <th className="px-4 py-2 font-medium">Scope</th>
                  <th className="px-4 py-2 font-medium">Days observed</th>
                  <th className="px-4 py-2 font-medium">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {baseline.anchors.map((a, i) => (
                  <tr key={i} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-4 py-2">{a.label}</td>
                    <td className="px-4 py-2 text-zinc-500">{a.scope}</td>
                    <td className="px-4 py-2">{a.sampleDays}</td>
                    <td className="px-4 py-2 capitalize">{a.confidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="text-xs text-zinc-500 dark:text-zinc-500">
          QuietSignal is a notice system, not a life-safety system. It does not replace
          emergency services or medical monitoring.
        </footer>
      </main>
    </div>
  );
}
