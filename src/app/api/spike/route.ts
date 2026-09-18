import { NextResponse } from "next/server";
import { getRingAuthMode } from "@/lib/ingestion/ringAuth";
import { createRingClient } from "@/lib/ingestion/ringClient";
import { getEventStore } from "@/lib/eventStore";
import { pingBedrock } from "@/lib/alerts/ping";

/**
 * The Days 1-3 spike's "kill-or-commit" check (docs/PRD.md §10), as a
 * runnable endpoint instead of a one-off script: validates Ring API access,
 * exercises the minimal event -> store -> query loop, and validates Bedrock
 * access. Hit this after filling in .env.local with real credentials.
 *
 * GET /api/spike
 */
export async function GET() {
  const result: Record<string, unknown> = {};

  // --- Ring: auth + device discovery + backfill + query ---
  const ringAuthMode = getRingAuthMode();
  if (!ringAuthMode) {
    result.ring = {
      ok: false,
      reason: "Not configured. Set RING_ACCESS_TOKEN (fastest) or RING_REFRESH_TOKEN + RING_CLIENT_ID + RING_CLIENT_SECRET in .env.local.",
    };
  } else {
    try {
      const client = createRingClient();
      const devices = await client.listDevices();
      const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const events = await client.pollEvents(sinceIso);

      await getEventStore().append(events);
      const stored = await getEventStore().query(sinceIso);

      result.ring = {
        ok: true,
        authMode: ringAuthMode,
        devicesFound: devices.length,
        devices: devices.map((d) => ({ id: d.id, name: d.name, online: d.online, capabilities: Object.keys(d.capabilities) })),
        eventsIngestedLast24h: events.length,
        eventsQueryableFromStore: stored.length,
        note: "Check `devices[].capabilities` above for anything indicating a contact/door sensor - see docs/SPIKE_DAY1-3.md's open risk about this API being motion/camera-oriented.",
      };
    } catch (error) {
      result.ring = { ok: false, authMode: ringAuthMode, error: error instanceof Error ? error.message : String(error) };
    }
  }

  // --- Bedrock ---
  if (!process.env.AWS_REGION && !process.env.AWS_ACCESS_KEY_ID) {
    result.bedrock = { ok: false, reason: "Not configured. Set AWS_REGION and AWS credentials in .env.local." };
  } else {
    result.bedrock = await pingBedrock();
  }

  const decision =
    (result.ring as { ok?: boolean } | undefined)?.ok && (result.bedrock as { ok?: boolean } | undefined)?.ok
      ? "proceed"
      : "not yet - fill in missing credentials above, or fall back to synthetic-only ingestion (disclosed) per docs/PRD.md §9";

  return NextResponse.json({ ...result, decision });
}
