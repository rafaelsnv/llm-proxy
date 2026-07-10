/**
 * Shared proxy utility functions and constants
 */

import { TIMEOUT_MS } from "../config.js";

/**
 * Convert a Unix timestamp in milliseconds to a human-readable duration string.
 * Returns null for null/undefined/non-positive values.
 * Examples: "2h 30m", "45m", "<1m"
 */
export function formatResetsIn(unixMs: number | null | undefined): string | null {
  if (unixMs == null || unixMs <= 0) return null;
  const totalSeconds = Math.floor(unixMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return "<1m";
}

// Allowed headers for OpenAI route
export const ALLOWED_HEADERS = ["content-type"];

// Allowed headers for Anthropic route
// NOTE: x-api-key is NOT included — the caller's x-api-key must never be
// forwarded to upstream. The proxy reads it for its own auth (if needed) but
// the upstream request is sent with the server's MINIMAX_API_KEY via
// headers["x-api-key"] = MINIMAX_API_KEY in the route handler.
export const ANTHROPIC_ALLOWED_HEADERS = [
  "content-type",
  "anthropic-version",
  "anthropic-beta",
];

// Request timeout in milliseconds (imported from config)
export { TIMEOUT_MS };

// Key prefix for valid API keys
export const KEY_PREFIX = "sk-cp";

/**
 * Forward rate-limit headers from upstream response to client.
 */
export function forwardRateLimitHeaders(
  upstreamRes: Response,
  clientRes: { setHeader: (key: string, value: string) => void },
): void {
  const ratelimitHeaders = [
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
    "x-ratelimit-reset",
  ];
  for (const header of ratelimitHeaders) {
    const value = upstreamRes.headers.get(header);
    if (value) {
      clientRes.setHeader(header, value);
    }
  }
}

/**
 * Filter request headers based on an allowed list.
 * Handles headers values that may be string, string[], or undefined
 * (from Express Request type).
 */
export function filterHeaders(
  headers: Record<string, string | string[] | undefined>,
  allowed: string[],
): Record<string, string> {
  const filtered: Record<string, string> = {};

  for (const key of allowed) {
    const value = headers[key.toLowerCase()];
    if (value) {
      filtered[key] = Array.isArray(value) ? value[0] : value;
    }
  }

  return filtered;
}
