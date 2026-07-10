import 'dotenv/config';

if (!process.env.MINIMAX_API_KEY) {
  console.error('FATAL: MINIMAX_API_KEY environment variable is required');
  process.exit(1);
}

// Server configuration
const PORT = parseInt(process.env.PORT || '7331', 10);
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_BASE_URL = 'https://api.minimax.io/anthropic';
const OPENAI_BASE_URL = 'https://api.minimax.io/v1';

// Rate limiting configuration
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10); // 15 minutes

// Proxy configuration
const TIMEOUT_MS = 60_000; // 60 seconds

// Logging configuration
const MAX_CONTENT_LOG = 500; // Maximum characters to log from response content

// Throttle configuration for quota mismatch warnings
const MISMATCH_THROTTLE_MS = 60_000; // 60 seconds
const MISMATCH_SUMMARY_CAP = 50;

/**
 * Throttle settings for shape-mismatch warnings.
 * Repeated mismatches within the throttle window are suppressed.
 */
export interface ThrottleSettings {
  throttleMs: number;
  summaryCap: number;
}

export const THROTTLE_SETTINGS: ThrottleSettings = {
  throttleMs: MISMATCH_THROTTLE_MS,
  summaryCap: MISMATCH_SUMMARY_CAP,
};

export {
  PORT,
  MINIMAX_API_KEY,
  MINIMAX_BASE_URL,
  OPENAI_BASE_URL,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  TIMEOUT_MS,
  MAX_CONTENT_LOG,
  MISMATCH_THROTTLE_MS,
  MISMATCH_SUMMARY_CAP,
};