/**
 * Ring webhook payload validation and mapping. Schema ported from Amazon's
 * reference implementation (`lib/schemas/webhook.ts` in
 * github.com/AmazonAppDev/ring-api-helloworld) - this is the real, live
 * event delivery path, since the Partner API has no event polling endpoint.
 */

import { z } from "zod";
import type { SensorEvent, SensorType } from "@/lib/events/types";

const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

const RingWebhookAttributesSchema = z.object({
  source: z.string(),
  source_type: z.string(),
  timestamp: z.union([z.number(), z.string()]),
  confidence: z.number().optional(),
  bounding_box: BoundingBoxSchema.optional(),
  thumbnail_url: z.string().optional(),
});

const RingWebhookDataSchema = z.object({
  id: z.string(),
  type: z.enum(["motion_detected", "device_added", "device_removed", "person_detected"]),
  attributes: RingWebhookAttributesSchema,
  relationships: z
    .object({
      devices: z
        .object({
          links: z.object({ self: z.string().optional() }).optional(),
        })
        .optional(),
    })
    .optional(),
});

export const RingWebhookPayloadSchema = z.object({
  meta: z.object({
    version: z.string(),
    time: z.string(),
    request_id: z.string(),
  }),
  data: RingWebhookDataSchema,
});

export type RingWebhookPayload = z.infer<typeof RingWebhookPayloadSchema>;

export function parseRingWebhook(body: unknown) {
  return RingWebhookPayloadSchema.safeParse(body);
}

function toIsoTimestamp(timestamp: number | string): string {
  return typeof timestamp === "number" ? new Date(timestamp).toISOString() : new Date(timestamp).toISOString();
}

/**
 * Only `motion_detected` and `person_detected` map to a SensorEvent -
 * `device_added`/`device_removed` are inventory changes, not activity.
 * No contact-sensor webhook type is defined in this schema (see
 * docs/SPIKE_DAY1-3.md for why that matters).
 */
export function mapWebhookToSensorEvent(payload: RingWebhookPayload): SensorEvent | null {
  const { data } = payload;
  if (data.type !== "motion_detected" && data.type !== "person_detected") return null;

  const sensorType: SensorType = "motion";
  return {
    sensorId: data.attributes.source,
    sensorType,
    locationLabel: data.attributes.source,
    eventType: "motion-detected",
    timestamp: toIsoTimestamp(data.attributes.timestamp),
  };
}
