import { NextRequest, NextResponse } from "next/server";
import { parseRingWebhook, mapWebhookToSensorEvent } from "@/lib/ingestion/ringWebhook";
import { getEventStore } from "@/lib/eventStore";

/**
 * Receives real-time Ring webhook events and appends them to the event
 * store (FR-1.1 Mode A/B). This is the live path - the Partner API has no
 * polling endpoint for events, only a per-device history lookup (used for
 * backfill in src/lib/ingestion/ringClient.ts).
 *
 * Configure your Ring webhook to POST here. If RING_WEBHOOK_SECRET is set,
 * requests must carry it as a Bearer token.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.RING_WEBHOOK_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await request.json().catch(() => null);
  const parsed = parseRingWebhook(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid webhook payload", issues: parsed.error.issues }, { status: 400 });
  }

  const event = mapWebhookToSensorEvent(parsed.data);
  if (!event) {
    return NextResponse.json({ status: "ignored", reason: `Unmapped event type: ${parsed.data.data.type}` });
  }

  await getEventStore().append([event]);
  return NextResponse.json({ status: "stored", event });
}
