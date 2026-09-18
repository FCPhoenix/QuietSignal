/**
 * Ring Partner API client. Endpoints and response shapes confirmed against
 * Amazon's own reference implementation (github.com/AmazonAppDev/ring-api-helloworld).
 * See docs/SPIKE_DAY1-3.md for what that spike found and the one open risk
 * it surfaced.
 *
 * IMPORTANT: the Partner API has no polling endpoint for live events - Ring
 * delivers those via webhook (see src/lib/ingestion/ringWebhook.ts and
 * src/app/api/webhook/ring/route.ts). `pollEvents` here backfills from the
 * per-device event *history* endpoint, which is what seeds the baseline
 * engine's rolling window; ongoing/live events arrive through the webhook
 * route instead.
 */

import type { SensorEvent, SensorType } from "@/lib/events/types";
import { getRingAccessToken } from "@/lib/ingestion/ringAuth";

const API_BASE = "https://api.amazonvision.com";

export interface RingDevice {
  id: string;
  name: string;
  online: boolean;
  capabilities: Record<string, unknown>;
}

interface JsonApiResource<A> {
  id: string;
  attributes: A;
}

interface JsonApiListResponse<A> {
  data: JsonApiResource<A>[];
}

interface RingDeviceAttributes {
  name?: string;
  description?: string;
  online?: boolean;
  capabilities?: Record<string, unknown>;
}

interface RingEventAttributes {
  event_type: string; // observed: "motion.human", "ding" (doorbell press)
  start: string;
  end?: string;
}

async function ringFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ring API ${path} failed: ${response.status} ${body}`);
  }
  return response.json() as Promise<T>;
}

export async function listRingDevices(token: string): Promise<RingDevice[]> {
  const data = await ringFetch<JsonApiListResponse<RingDeviceAttributes>>("/v1/devices", token);
  return data.data.map((device) => ({
    id: device.id,
    name: device.attributes.name ?? device.attributes.description ?? "Ring device",
    online: device.attributes.online ?? false,
    capabilities: device.attributes.capabilities ?? {},
  }));
}

export async function getDeviceEventHistory(
  token: string,
  deviceId: string,
  eventTypes?: string,
): Promise<Array<{ eventType: string; start: string; end?: string }>> {
  const query = eventTypes ? `?event_types=${encodeURIComponent(eventTypes)}` : "";
  const data = await ringFetch<JsonApiListResponse<RingEventAttributes>>(
    `/v1/history/devices/${deviceId}/events${query}`,
    token,
  );
  return data.data.map((event) => ({
    eventType: event.attributes.event_type,
    start: event.attributes.start,
    end: event.attributes.end,
  }));
}

/**
 * Maps Ring's event vocabulary to ours. Only motion and doorbell events are
 * confirmed to exist on this API (see docs/SPIKE_DAY1-3.md) - there is no
 * observed "contact sensor open/close" event type, which is a real risk
 * against the zero-camera-dependency requirement (motion + contact only).
 */
function mapRingEventType(ringEventType: string): { sensorType: SensorType; eventType: SensorEvent["eventType"] } | null {
  if (ringEventType.startsWith("motion")) return { sensorType: "motion", eventType: "motion-detected" };
  if (ringEventType === "ding") return { sensorType: "doorbell", eventType: "press" };
  return null; // unmapped event type (e.g. "person_detected") - dropped, not guessed
}

export interface RingClientOptions {
  /** Comma-separated Ring event type filter, e.g. "motion.human,ding". */
  eventTypes?: string;
}

export interface RingIngestionSource {
  listDevices(): Promise<RingDevice[]>;
  pollEvents(sinceIso: string): Promise<SensorEvent[]>;
}

export function createRingClient(options: RingClientOptions = {}): RingIngestionSource {
  return {
    async listDevices() {
      const token = await getRingAccessToken();
      return listRingDevices(token);
    },

    async pollEvents(sinceIso: string) {
      const token = await getRingAccessToken();
      const devices = await listRingDevices(token);
      const allEvents: SensorEvent[] = [];

      for (const device of devices) {
        const history = await getDeviceEventHistory(token, device.id, options.eventTypes);
        for (const event of history) {
          if (event.start < sinceIso) continue;
          const mapped = mapRingEventType(event.eventType);
          if (!mapped) continue;
          allEvents.push({
            sensorId: device.id,
            sensorType: mapped.sensorType,
            locationLabel: device.name,
            eventType: mapped.eventType,
            timestamp: event.start,
          });
        }
      }

      return allEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    },
  };
}
