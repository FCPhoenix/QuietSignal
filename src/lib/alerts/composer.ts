/**
 * Calls Bedrock with a locked prompt template plus structured evidence
 * JSON. The LLM only chooses phrasing; every fact in its output must trace
 * back to `candidate.evidence`/`reasons`.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import type { BreakCandidate } from "@/lib/detector/breakDetector";

export interface ComposedAlert {
  breakId: string;
  headline: string;
  body: string;
  suggestedAction: string;
  confidence: string;
  generatedAt: string;
}

const SYSTEM_PROMPT = `You write short, calm alerts for a family member about an elderly relative's home routine.
Rules (do not break these):
- Use ONLY the facts given in the evidence JSON. Never invent a time, count, or event.
- Never mention cameras, video, or audio — this system has none.
- Tone: plain language, reassuring but honest, no alarmist language.
- Always end with exactly one concrete suggested action.
- Output strict JSON: {"headline": string, "body": string, "suggestedAction": string}`;

function buildUserPrompt(candidate: BreakCandidate): string {
  return JSON.stringify(
    {
      breakClass: candidate.breakClass,
      riskScore: candidate.riskScore,
      reasons: candidate.reasons,
      evidence: candidate.evidence,
    },
    null,
    2,
  );
}

/**
 * Best-effort fact check: every number/reason the model used must already
 * appear in the candidate's own reasons array. Cheap guard against
 * hallucinated specifics; not a substitute for the locked prompt.
 */
function validateAgainstEvidence(alert: { headline: string; body: string }, candidate: BreakCandidate): boolean {
  const combinedText = `${alert.headline} ${alert.body}`.toLowerCase();
  return candidate.reasons.some((reason) =>
    reason
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 4)
      .some((word) => combinedText.includes(word)),
  );
}

export interface ComposeAlertOptions {
  region?: string;
  modelId?: string;
}

export async function composeAlert(
  candidate: BreakCandidate,
  options: ComposeAlertOptions = {},
): Promise<ComposedAlert> {
  const region = options.region ?? process.env.AWS_REGION ?? "us-east-1";
  const modelId = options.modelId ?? process.env.QS_BEDROCK_MODEL_ID ?? "anthropic.claude-3-5-haiku-20241022-v1:0";

  const client = new BedrockRuntimeClient({ region });
  const command = new InvokeModelCommand({
    modelId,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(candidate) }],
    }),
  });

  const response = await client.send(command);
  const payload = JSON.parse(new TextDecoder().decode(response.body));
  const text: string = payload.content?.[0]?.text ?? "{}";
  const parsed = JSON.parse(text) as { headline: string; body: string; suggestedAction: string };

  if (!validateAgainstEvidence(parsed, candidate)) {
    throw new Error(
      `Bedrock output for break ${candidate.id} didn't match its evidence — refusing to send an unverified alert.`,
    );
  }

  return {
    breakId: candidate.id,
    headline: parsed.headline,
    body: parsed.body,
    suggestedAction: parsed.suggestedAction,
    confidence: candidate.evidence.anchor?.confidence ?? "n/a",
    generatedAt: new Date().toISOString(),
  };
}

export function composeAllClear(breakId: string): ComposedAlert {
  return {
    breakId,
    headline: "Back to normal",
    body: "Activity has returned to the usual pattern for this home.",
    suggestedAction: "No action needed.",
    confidence: "n/a",
    generatedAt: new Date().toISOString(),
  };
}
