/**
 * Minimal Bedrock connectivity check. Sends the smallest possible request
 * and reports whether the credentials/model/region are actually reachable,
 * rather than waiting to find out during real alert composition.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

export interface BedrockPingResult {
  ok: boolean;
  modelId: string;
  region: string;
  error?: string;
}

export async function pingBedrock(): Promise<BedrockPingResult> {
  const region = process.env.AWS_REGION ?? "us-east-1";
  const modelId = process.env.QS_BEDROCK_MODEL_ID ?? "anthropic.claude-3-5-haiku-20241022-v1:0";

  try {
    const client = new BedrockRuntimeClient({ region });
    await client.send(
      new InvokeModelCommand({
        modelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 8,
          messages: [{ role: "user", content: "ping" }],
        }),
      }),
    );
    return { ok: true, modelId, region };
  } catch (error) {
    return { ok: false, modelId, region, error: error instanceof Error ? error.message : String(error) };
  }
}
