import Link from "next/link";
import { evaluateHousehold } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

/**
 * Resident transparency view (FR-5.3, product principle P2). Large type,
 * plain language, no jargon — this is the Resident's page, not the
 * Watcher's. It must always be reachable and always tell the truth about
 * what the system knows.
 */
export default async function ResidentView() {
  const { baseline } = await evaluateHousehold();
  const knownRoutines = baseline.anchors.filter((a) => a.sampleDays > 0);

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-xl flex-col gap-8 px-6 py-12 text-lg sm:px-10">
        <Link href="/" className="text-base underline underline-offset-4">
          ← Back
        </Link>

        <h1 className="text-3xl font-semibold tracking-tight">What QuietSignal knows</h1>

        <p>
          QuietSignal only knows <strong>when</strong> your doors and motion sensors are
          typically active — never what you were doing, and never anything from a camera or
          microphone, because this system has none.
        </p>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="mb-4 text-xl font-medium">Routines it has learned</h2>
          {knownRoutines.length === 0 ? (
            <p className="text-zinc-500">Nothing yet — it&apos;s still learning your routine.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {knownRoutines.map((a, i) => (
                <li key={i} className="flex items-center justify-between">
                  <span className="capitalize">{a.label.replace(/-/g, " ")}</span>
                  <span className="text-sm text-zinc-500">{a.sampleDays} days observed</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            className="flex-1 rounded-full border border-zinc-300 px-6 py-3 text-center font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Pause QuietSignal
          </button>
          <button
            type="button"
            className="flex-1 rounded-full bg-red-600 px-6 py-3 text-center font-medium text-white hover:bg-red-700"
          >
            Delete my data
          </button>
        </div>

        <p className="text-sm text-zinc-500">
          Pausing stops all monitoring immediately. Deleting removes everything QuietSignal has
          learned about this home — permanently, right away, with nothing kept.
        </p>
      </main>
    </div>
  );
}
