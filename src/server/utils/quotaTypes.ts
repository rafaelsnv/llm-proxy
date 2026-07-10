/**
 * Types and safe parsers for the MiniMax Token Plan quota endpoint
 * (POST https://www.minimax.io/v1/token_plan/remains) and the
 * Anthropic Messages response fields we surface in logs.
 *
 * The Token Plan endpoint is not formally documented with a response
 * schema; the schemas below are derived from the sample response
 * captured in the project's context and tolerate extra fields via
 * `.passthrough()`.
 *
 * Public API contract:
 *  - Each `parse*` returns a value with safe defaults, NEVER throws.
 *    Callers downstream (logger, poller) rely on this.
 *  - On schema mismatch we emit a `warn` log carrying the ZodError
 *    so future API drift is observable.
 *  - `parseTokenPlanRemains` also returns `success: boolean` derived
 *    from `base_resp.status_code === 0`, matching the documented
 *    convention.
 */

import { z } from "zod";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Token Plan quota types
// ---------------------------------------------------------------------------

/**
 * Per-model window status (best-effort numeric encoding).
 * Observed values: 1 (active), 3 (inactive/empty). Other values are
 * passed through and surfaced as raw integers.
 */
export type QuotaWindowStatus = number;

const ModelRemainsSchema = z
  .object({
    start_time: z.number(),
    end_time: z.number(),
    remains_time: z.number(),
    current_interval_total_count: z.number(),
    current_interval_usage_count: z.number(),
    model_name: z.string().default("unknown"),
    current_weekly_total_count: z.number(),
    current_weekly_usage_count: z.number(),
    weekly_start_time: z.number(),
    weekly_end_time: z.number(),
    weekly_remains_time: z.number(),
    current_interval_status: z.number().default(0),
    current_interval_remaining_percent: z.number().default(100),
    current_weekly_status: z.number().default(0),
    current_weekly_remaining_percent: z.number().default(100),
  })
  .passthrough();

export type ModelRemains = z.infer<typeof ModelRemainsSchema>;

const QuotaBaseRespSchema = z
  .object({
    status_code: z.number().default(-1),
    status_msg: z.string().default(""),
  })
  .passthrough();

export type QuotaBaseResp = z.infer<typeof QuotaBaseRespSchema>;

const TokenPlanRemainsSchema = z
  .object({
    model_remains: z.array(z.unknown()),
    base_resp: QuotaBaseRespSchema,
  })
  .passthrough();

export interface TokenPlanRemainsResponse {
  model_remains: ModelRemains[];
  base_resp: QuotaBaseResp;
}

// ---------------------------------------------------------------------------
// Fallbacks (returned on schema mismatch; never throws)
// ---------------------------------------------------------------------------

const FALLBACK_MODEL_REMAINS: ModelRemains = {
  start_time: 0,
  end_time: 0,
  remains_time: 0,
  current_interval_total_count: 0,
  current_interval_usage_count: 0,
  model_name: "unknown",
  current_weekly_total_count: 0,
  current_weekly_usage_count: 0,
  weekly_start_time: 0,
  weekly_end_time: 0,
  weekly_remains_time: 0,
  current_interval_status: 0,
  current_interval_remaining_percent: 100,
  current_weekly_status: 0,
  current_weekly_remaining_percent: 100,
};

const FALLBACK_BASE_RESP: QuotaBaseResp = {
  status_code: -1,
  status_msg: "",
};

// ---------------------------------------------------------------------------
// Throttled warn helper
// ---------------------------------------------------------------------------

/**
 * Default throttle window for shape-mismatch warnings.
 * Repeated mismatches within this window are suppressed; a single
 * "suppressed N warnings" follow-up is emitted when the window
 * elapses or the count exceeds the cap. Keeps Logflare from being
 * flooded if the upstream API drift is sustained.
 */
const MISMATCH_THROTTLE_MS = 60_000;
const MISMATCH_SUMMARY_CAP = 50;

/**
 * In-memory throttle state, keyed by `tag:issueKey`.
 * - `lastEmit`: ms timestamp of the last warning we actually sent
 * - `suppressed`: count of warnings suppressed since that emit
 *
 * Reset on each emit. Bounded by the number of distinct (tag, path)
 * combinations observed during the process lifetime.
 */
const throttleState = new Map<
  string,
  { lastEmit: number; suppressed: number }
>();

/**
 * Whether the caller should emit a `warn` for this (tag, path)
 * mismatch right now. Bumps an internal counter for follow-up
 * summaries.
 */
function shouldEmitMismatch(tag: string, issueKey: string, now: number): {
  emit: boolean;
  suppressed: number;
} {
  const key = `${tag}:${issueKey}`;
  const state = throttleState.get(key);
  if (!state) {
    throttleState.set(key, { lastEmit: now, suppressed: 0 });
    return { emit: true, suppressed: 0 };
  }
  const elapsed = now - state.lastEmit;
  if (elapsed >= MISMATCH_THROTTLE_MS) {
    const prior = state.suppressed;
    state.lastEmit = now;
    state.suppressed = 0;
    return { emit: true, suppressed: prior };
  }
  state.suppressed += 1;
  if (state.suppressed >= MISMATCH_SUMMARY_CAP) {
    const prior = state.suppressed;
    state.suppressed = 0;
    state.lastEmit = now;
    return { emit: true, suppressed: prior };
  }
  return { emit: false, suppressed: state.suppressed };
}

interface MismatchIssue {
  path: PropertyKey[];
  message: string;
}

function issuesKey(issues: MismatchIssue[]): string {
  // Build a stable key from the path+message of each issue. This
  // groups repeated identical mismatches together while still
  // distinguishing between different shapes of mismatch.
  return issues
    .map((i) => {
      const path = i.path
        .map((p) => (typeof p === "symbol" ? p.toString() : String(p)))
        .join(".");
      return `${path}:${i.message}`;
    })
    .sort()
    .join("|");
}

function warnMismatch(tag: string, issues: MismatchIssue[], endpoint: string): void {
  const now = Date.now();
  const key = issuesKey(issues);
  const decision = shouldEmitMismatch(tag, key, now);

  if (!decision.emit) {
    return;
  }

  const payload = {
    event_message: `502 - ${endpoint}`,
    quota_parse_tag: tag,
    quota_parse_issues: issues.map((i) => ({
      path: i.path
        .map((p) => (typeof p === "symbol" ? p.toString() : String(p)))
        .join("."),
      message: i.message,
    })),
    quota_parse_suppressed:
      decision.suppressed > 0 ? decision.suppressed : undefined,
    quota_parse_window_ms:
      decision.suppressed > 0 ? MISMATCH_THROTTLE_MS : undefined,
  };

  logger.warn(payload, "quota.parse.shape_mismatch");
}

/**
 * Test-only helper. Resets the in-memory throttle state so unit
 * tests can assert deterministic behavior. Do not call from
 * production code.
 */
export function __resetMismatchThrottleForTests(): void {
  throttleState.clear();
}

// ---------------------------------------------------------------------------
// Public parsers (never throw)
// ---------------------------------------------------------------------------

/**
 * Parse and validate one `model_remains` entry. Unknown fields are
 * kept (`.passthrough()`) so future API additions don't break logging.
 */
export function parseModelRemains(input: unknown, endpoint: string): ModelRemains {
  const r = ModelRemainsSchema.safeParse(input ?? {});
  if (!r.success) {
    warnMismatch("model_remains", r.error.issues, endpoint);
    return FALLBACK_MODEL_REMAINS;
  }
  return r.data;
}

export function parseBaseResp(input: unknown, endpoint: string): QuotaBaseResp {
  const r = QuotaBaseRespSchema.safeParse(input ?? {});
  if (!r.success) {
    warnMismatch("base_resp", r.error.issues, endpoint);
    return FALLBACK_BASE_RESP;
  }
  return r.data;
}

/**
 * Parse and validate a full `/v1/token_plan/remains` response.
 * Always returns a value with safe defaults so callers do not have
 * to handle `null`. `success` reflects the documented
 * `status_code === 0` convention.
 */
export function parseTokenPlanRemains(input: unknown, endpoint: string): {
  data: TokenPlanRemainsResponse;
  success: boolean;
} {
  const outer = TokenPlanRemainsSchema.safeParse(input ?? {});
  if (!outer.success) {
    warnMismatch("token_plan_remains", outer.error.issues, endpoint);
    return {
      success: false,
      data: {
        model_remains: [],
        base_resp: FALLBACK_BASE_RESP,
      },
    };
  }

  const baseResp = parseBaseResp(outer.data.base_resp, endpoint);
  const items = (outer.data.model_remains ?? []).map((entry) =>
    parseModelRemains(entry, endpoint),
  );

  return {
    success: baseResp.status_code === 0,
    data: {
      model_remains: items,
      base_resp: baseResp,
    },
  };
}


