/**
 * Notification layer (FR-4.2, FR-5). Two legs for the demo: in-app (the
 * Active break conversation view reads directly from the event/alert store)
 * and email via SES. Alerts are deduplicated per break — this module
 * upserts one conversation per breakId rather than firing repeat pings.
 */

import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import type { ComposedAlert } from "@/lib/alerts/composer";

export interface NotificationRecipient {
  watcherName: string;
  email: string;
}

const conversations = new Map<string, ComposedAlert[]>();

/** In-app: appends the latest alert state to that break's conversation thread. */
export function upsertInAppConversation(alert: ComposedAlert): ComposedAlert[] {
  const thread = conversations.get(alert.breakId) ?? [];
  thread.push(alert);
  conversations.set(alert.breakId, thread);
  return thread;
}

export function getConversation(breakId: string): ComposedAlert[] {
  return conversations.get(breakId) ?? [];
}

export function listActiveConversations(): Map<string, ComposedAlert[]> {
  return conversations;
}

export async function sendEmailAlert(
  recipient: NotificationRecipient,
  alert: ComposedAlert,
  fromAddress: string = process.env.QS_ALERT_FROM_EMAIL ?? "alerts@quietsignal.example",
): Promise<void> {
  const region = process.env.AWS_REGION ?? "us-east-1";
  const client = new SESClient({ region });

  await client.send(
    new SendEmailCommand({
      Source: fromAddress,
      Destination: { ToAddresses: [recipient.email] },
      Message: {
        Subject: { Data: `QuietSignal: ${alert.headline}` },
        Body: {
          Text: {
            Data: `Hi ${recipient.watcherName},\n\n${alert.body}\n\nSuggested action: ${alert.suggestedAction}\n\n— QuietSignal is a notice system, not a life-safety system. Always use your own judgment.`,
          },
        },
      },
    }),
  );
}
