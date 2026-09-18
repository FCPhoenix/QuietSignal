/**
 * Ring API authentication. Ported from Amazon's own reference
 * (github.com/AmazonAppDev/ring-api-helloworld `lib/auth.ts`) so the token
 * flow matches what the real Partner API expects.
 *
 * Two modes:
 * 1. `RING_ACCESS_TOKEN` — a short-lived (~30 min) token from the Ring
 *    Developer Playground (developer.amazon.com/ring/console/playground).
 *    Fastest path for the Days 1-3 spike: no app registration needed.
 * 2. `RING_REFRESH_TOKEN` + `RING_CLIENT_ID` + `RING_CLIENT_SECRET` — the
 *    production OAuth flow, auto-renewing.
 */

export type RingAuthMode = "access_token" | "refresh_token";

let cachedToken: { token: string; expiresAt: number } | null = null;

export function getRingAuthMode(): RingAuthMode | null {
  const hasAccessToken = !!process.env.RING_ACCESS_TOKEN;
  const hasRefreshToken = !!process.env.RING_REFRESH_TOKEN;
  if (hasAccessToken && hasRefreshToken) return null; // conflict, caller must resolve
  if (hasAccessToken) return "access_token";
  if (hasRefreshToken) return "refresh_token";
  return null;
}

export async function getRingAccessToken(): Promise<string> {
  if (process.env.RING_ACCESS_TOKEN && process.env.RING_REFRESH_TOKEN) {
    throw new Error(
      "Both RING_ACCESS_TOKEN and RING_REFRESH_TOKEN are set in .env.local. Use only one.",
    );
  }

  if (process.env.RING_ACCESS_TOKEN) {
    return process.env.RING_ACCESS_TOKEN;
  }

  if (process.env.RING_REFRESH_TOKEN) {
    if (!process.env.RING_CLIENT_ID || !process.env.RING_CLIENT_SECRET) {
      throw new Error(
        "RING_CLIENT_ID and RING_CLIENT_SECRET are required when using RING_REFRESH_TOKEN.",
      );
    }

    if (cachedToken && Date.now() < cachedToken.expiresAt) {
      return cachedToken.token;
    }

    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: process.env.RING_REFRESH_TOKEN,
      client_id: process.env.RING_CLIENT_ID,
      client_secret: process.env.RING_CLIENT_SECRET,
    });

    const response = await fetch("https://oauth.ring.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ring token refresh failed: ${errorText}`);
    }

    const data = await response.json();
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000 - 60_000,
    };
    return data.access_token;
  }

  throw new Error(
    "Ring authentication not configured. Set RING_ACCESS_TOKEN (fastest, from the Playground) " +
      "or RING_REFRESH_TOKEN + RING_CLIENT_ID + RING_CLIENT_SECRET in .env.local.",
  );
}
