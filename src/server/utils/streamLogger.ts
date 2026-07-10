/**
 * Utility for extracting content snippets and usage from streaming responses
 * for logging purposes.
 */

import { logger } from "./logger.js";

// Maximum characters to log from response content (for fallback/trimming)
const MAX_CONTENT_LOG = 500;

/**
 * Extract the last user message from messages array.
 * Returns only the content of the last message with role === "user".
 */
function extractLastUserMessage(
  messages: Array<{ role?: string; content?: unknown }>,
): string | undefined {
  // Find last message where role is "user"
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        return msg.content;
      }
      if (Array.isArray(msg.content)) {
        // For Anthropic format: [{type: "text", text: "..."}]
        const textParts = msg.content
          .filter((c) => c.type === "text")
          .map((c) => (c as { text?: string }).text)
          .filter(Boolean);
        return textParts.join("\n");
      }
    }
  }
  return undefined;
}

/**
 * Parse an SSE data line and return the JSON object
 */
function parseSSEData(line: string): Record<string, unknown> | null {
  if (!line.startsWith("data: ")) return null;
  const data = line.slice(6);
  if (data === "[DONE]") return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Process an SSE buffer and extract content snippet + usage
 * Returns the last 500 chars of text content and any usage found
 *
 * Captures the full token breakdown documented in the Anthropic
 * Compatible API (CreateMessageResp.Usage): input, output, cache
 * creation, cache read. Also captures `service_tier` from the
 * `message_start` event when streaming.
 */
export function extractAnthropicStreamingInfo(buffer: string): {
  contentSnippet: string;
  model: string | null;
  messageId: string | null;
  messageType: string | null;
  messageRole: string | null;
  stopReason: string | null;
  inputTokens: number | null;
  inputTokensDetails: { cachedTokens: number | null };
  outputTokens: number | null;
  outputTokensDetails: { reasoningTokens: number | null };
  cacheCreationInputTokens: number | null;
  cacheReadInputTokens: number | null;
  serviceTier: string | null;
  responseId: string | null;
  finishReason: null;
} {
  const partial: {
    content: string;
    model: string | null;
    messageId: string | null;
    messageType: string | null;
    messageRole: string | null;
    stopReason: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    cacheCreationInputTokens: number | null;
    cacheReadInputTokens: number | null;
    serviceTier: string | null;
  } = {
    content: "",
    model: null,
    messageId: null,
    messageType: null,
    messageRole: null,
    stopReason: null,
    inputTokens: null,
    outputTokens: null,
    cacheCreationInputTokens: null,
    cacheReadInputTokens: null,
    serviceTier: null,
  };

  const lines = buffer.split("\n");
  for (const line of lines) {
    const data = parseSSEData(line);
    if (!data) continue;

    const type = data.type as string;

    // Capture model + service_tier + identity from message_start
    if (type === "message_start") {
      const msg = data.message as Record<string, unknown> | undefined;
      if (msg) {
        if (msg.model && !partial.model) {
          partial.model = msg.model as string;
        }
        if (msg.service_tier && !partial.serviceTier) {
          partial.serviceTier = msg.service_tier as string;
        }
        if (msg.id && !partial.messageId) {
          partial.messageId = msg.id as string;
        }
        if (msg.type && !partial.messageType) {
          partial.messageType = msg.type as string;
        }
        if (msg.role && !partial.messageRole) {
          partial.messageRole = msg.role as string;
        }
      }
    }

    if (type === "content_block_delta") {
      const delta = data.delta as Record<string, unknown>;
      if (delta.type === "text_delta") {
        partial.content += delta.text as string;
      }
    }

    if (type === "message_delta") {
      // Per the Anthropic/MiniMax streaming spec, `message_delta` carries
      // `usage` and `delta.stop_reason` at the TOP LEVEL of the event,
      // NOT under `.message` (which is only populated on `message_start`).
      // Reading from `data.message` here silently yields undefined tokens
      // and stop_reason === 'unknown' in the log payload.
      const usage = data.usage as Record<string, number> | undefined;
      const delta = data.delta as Record<string, unknown> | undefined;
      const stopReason = delta?.stop_reason as string | undefined;

      // Capture stop reason
      if (stopReason && !partial.stopReason) {
        partial.stopReason = stopReason;
      }

      // Capture usage
      if (usage) {
        if (partial.inputTokens === null && usage.input_tokens !== undefined) {
          partial.inputTokens = usage.input_tokens;
        }
        partial.outputTokens = usage.output_tokens ?? null;
        if (
          partial.cacheCreationInputTokens === null &&
          usage.cache_creation_input_tokens !== undefined
        ) {
          partial.cacheCreationInputTokens =
            usage.cache_creation_input_tokens;
        }
        if (
          partial.cacheReadInputTokens === null &&
          usage.cache_read_input_tokens !== undefined
        ) {
          partial.cacheReadInputTokens = usage.cache_read_input_tokens;
        }
      }
    }
  }

  return {
    contentSnippet: partial.content,
    model: partial.model,
    messageId: partial.messageId,
    messageType: partial.messageType,
    messageRole: partial.messageRole,
    stopReason: partial.stopReason,
    inputTokens: partial.inputTokens,
    inputTokensDetails: {
      cachedTokens: partial.cacheReadInputTokens,
    },
    outputTokens: partial.outputTokens,
    outputTokensDetails: {
      reasoningTokens: null,
    },
    cacheCreationInputTokens: partial.cacheCreationInputTokens,
    cacheReadInputTokens: partial.cacheReadInputTokens,
    serviceTier: partial.serviceTier,
    responseId: partial.messageId,
    finishReason: null,
  };
}

/**
 * Parse accumulated OpenAI streaming chunks and extract info
 * Chunks look like: {"id":"...","choices":[{"delta":{"content":"..."}}]}
 */
export function extractOpenAIStreamingInfo(chunks: string[]): {
  contentSnippet: string;
  finishReason: string | null;
  model: string | null;
  toolCalls: Array<{
    index: number;
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  } | null;
  responseId: string | null;
  inputSensitiveType: number | null;
  outputSensitive: boolean | null;
} {
  let content = "";
  let finishReason: string | null = null;
  let model: string | null = null;
  const toolCalls: Array<{
    index: number;
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }> = [];
  let usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  } | null = null;
  let responseId: string | null = null;
  let inputSensitiveType: number | null = null;
  let outputSensitive: boolean | null = null;

  for (const chunkStr of chunks) {
    try {
      const chunk = JSON.parse(chunkStr);
      const choice = chunk.choices?.[0];
      if (!choice) continue;

      // Capture response ID from first chunk
      if (!responseId && chunk.id) {
        responseId = chunk.id;
      }

      // Capture model from first chunk
      if (!model && chunk.model) {
        model = chunk.model;
      }

      // Capture sensitive flags from any chunk
      if (chunk.input_sensitive_type != null) {
        inputSensitiveType = chunk.input_sensitive_type;
      }
      if (chunk.output_sensitive != null) {
        outputSensitive = chunk.output_sensitive;
      }

      // Accumulate content
      const delta = choice.delta;
      if (delta && typeof delta === "object") {
        if (typeof delta.content === "string") {
          content += delta.content;
        }

        // Extract tool calls
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            toolCalls.push({
              index: tc.index ?? 0,
              id: tc.id ?? "",
              type: tc.type ?? "function",
              function: {
                name: tc.function?.name ?? "",
                arguments: tc.function?.arguments ?? "",
              },
            });
          }
        }
      }

      // Track finish reason
      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }

      // Extract usage from final chunk
      if (chunk.usage) {
        usage = {
          input_tokens: chunk.usage.prompt_tokens ?? 0,
          output_tokens: chunk.usage.completion_tokens ?? 0,
          total_tokens: chunk.usage.total_tokens ?? 0,
        };
      }
    } catch {
      // Skip malformed JSON
    }
  }

  return {
    contentSnippet: content,
    finishReason,
    model,
    toolCalls,
    usage,
    responseId,
    inputSensitiveType,
    outputSensitive,
  };
}

/**
 * Log streaming response info combined with HTTP details.
 * Single log entry per request with all data.
 */
export function logStreamingResponse(
  status: number,
  method: string,
  endpoint: string,
  responseTime: number,
  responseInfo: {
    contentSnippet: string;
    model?: string | null;
    stopReason?: string | null;
    finishReason?: string | null;
    usage?: {
      input_tokens: number;
      input_tokens_details?: { cached_tokens?: number };
      output_tokens: number;
      output_tokens_details?: { reasoning_tokens?: number };
      total_tokens: number;
    } | null;
    reqHeaders?: Record<string, string | undefined>;
    /** Pino-http request id, assigned by the middleware (src/server/index.ts). */
    reqId?: string;
    /** `'proxy_out'` for /anthropic and /openai routes; `'proxy_in'` for /v1/token_plan (now unmounted). */
    routeClass?: "proxy_out" | "proxy_in";
    /** Wall-clock ms spent waiting on the upstream fetch (between fetch start and first byte / response headers). */
    upstreamLatencyMs?: number;
    /** Whether the response had cache_read_input_tokens > 0 (Anthropic only). */
    cacheWasRead?: boolean;
    /** Whether the response had cache_creation_input_tokens > 0 (Anthropic only). */
    cacheWasWritten?: boolean;
    /** Tool calls made in this response. */
    toolCalls?: Array<{
      id: string;
      name: string;
      arguments: string;
    }>;
    /** Approximate byte length of the `system` field (string OR joined text-array). */
    systemPromptBytes?: number;
    /** OpenAI response ID. */
    responseId?: string | null;
    /** OpenAI input sensitive type. */
    inputSensitiveType?: number | null;
    /** OpenAI output sensitive flag. */
    outputSensitive?: boolean | null;
    /** User input message (prompt) for the request. */
    userInput?: string | null;
  },
) {
  const logLevel = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
  const logTime = new Date().toISOString();

  const logData = {
    logTime,
    event_message: `${status} - ${method}\t${endpoint}`,
    model: responseInfo.model,
    proxy_response: {
      statusCode: status,
      contentSnippet:
        responseInfo.contentSnippet.length > MAX_CONTENT_LOG
          ? responseInfo.contentSnippet.slice(-MAX_CONTENT_LOG)
          : responseInfo.contentSnippet,
      id: responseInfo.responseId ?? null,
      finish_reason: responseInfo.finishReason ?? null,
      input_sensitive_type: responseInfo.inputSensitiveType ?? null,
      output_sensitive: responseInfo.outputSensitive ?? null,
    },
    usage: responseInfo.usage ?? null,
    responseTime_ms: responseTime,
    upstream_latency_ms: responseInfo.upstreamLatencyMs,
    req_id: responseInfo.reqId,
    route_class: responseInfo.routeClass ?? "proxy_out",
    client_user_agent: responseInfo.reqHeaders?.["user-agent"] ?? null,
    client_correlation_id: responseInfo.reqHeaders?.["x-correlation-id"] ?? null,
    user_input_message: responseInfo.userInput ?? null,
    cache_was_read: responseInfo.cacheWasRead,
    cache_was_written: responseInfo.cacheWasWritten,
    tool_calls: responseInfo.toolCalls?.length
      ? responseInfo.toolCalls
      : undefined,
    system_prompt_bytes: responseInfo.systemPromptBytes,
  };

  logger[logLevel](logData, logData.event_message);
}

/**
 * Inputs for logStreamingError. Mirrors the fields the route already
 * has on hand at the catch site, plus the upstream HTTP status when
 * the failure was an non-2xx upstream response (as opposed to a local
 * network/timeout/abort failure).
 */
export interface LogStreamingErrorInput {
  err: unknown;
  method: string;
  endpoint: string;
  responseTime_ms: number;
  reqId?: string;
  routeClass?: "proxy_out" | "proxy_in";
  /** Upstream HTTP status, when the failure was a non-2xx upstream response. */
  upstreamStatus?: number;
}

/**
 * Classify an unknown error into one of a small set of buckets so
 * downstream triage in Logflare can filter by `error_class`.
 *
 *  - `timeout`  — the AbortController fired (TIMEOUT_MS) or the error
 *                 carries a `name === 'AbortError'` / `code === 'ABORT_ERR'`.
 *  - `network`  — fetch failed with a TypeError (Node's fetch wraps DNS,
 *                 connection-refused, ECONNRESET, etc. as TypeError).
 *  - `parse`    — response body was not valid JSON / SSE (rare at the
 *                 route level; more common in quotaClient.ts).
 *  - `auth`     — upstream returned 401 or 403.
 *  - `unknown`  — anything else.
 */
function classifyError(err: unknown, upstreamStatus?: number): string {
  if (typeof upstreamStatus === "number") {
    if (upstreamStatus === 401 || upstreamStatus === 403) return "auth";
  }
  if (err && typeof err === "object") {
    const e = err as { name?: string; code?: string; status?: number; response?: { status?: number } };
    if (e.name === "AbortError" || e.code === "ABORT_ERR") return "timeout";
    const status = e.status ?? e.response?.status;
    if (status === 401 || status === 403) return "auth";
  }
  if (err instanceof TypeError) return "network";
  return "unknown";
}

/**
 * Extract a best-effort upstream HTTP status from the error object.
 * Node's fetch sets `err.response.status` on HTTP errors.
 */
function extractUpstreamStatus(err: unknown): number | undefined {
  if (err && typeof err === "object") {
    const e = err as { response?: { status?: number }; status?: number };
    if (typeof e.response?.status === "number") return e.response.status;
    if (typeof e.status === "number") return e.status;
  }
  return undefined;
}

/**
 * Log a streaming route error with structured fields.
 * Emits `event_message: 'proxy.error'` so Logflare can distinguish
 * these from normal success logs.
 */
export function logStreamingError(input: LogStreamingErrorInput): void {
  const { err, method, endpoint, responseTime_ms, reqId, routeClass, upstreamStatus } = input;
  const errorClass = classifyError(err, upstreamStatus);
  const errorUpstreamStatus = upstreamStatus ?? extractUpstreamStatus(err);
  const errorMessage = err instanceof Error ? err.message : String(err);

  logger.error(
    {
      event_message: `${errorUpstreamStatus ?? 0} - ${method}\t${endpoint}`,
      responseTime_ms,
      req_id: reqId,
      route_class: routeClass ?? "proxy_out",
      error_class: errorClass,
      error_upstream_status: errorUpstreamStatus,
      error_message: errorMessage,
    },
    "proxy.error",
  );
}

// ---------------------------------------------------------------------------
// Quota snapshot logging
// ---------------------------------------------------------------------------

export interface QuotaSnapshotLogInput {
  ok: boolean;
  status: number;
  fetchTimeMs: number;
  error?: string;
  modelRemains: Array<{
    model_name: string;
    resetsIn: string | null;
    weeklyResetsIn: string | null;
    currentIntervalRemainingPercent: number;
    currentWeeklyRemainingPercent: number;
    currentIntervalStatus: number;
    currentWeeklyStatus: number;
  }>;
  endpoint: string;
  method: string;
}

function formatRemainingTime(unixMs: number | null | undefined): string | null {
  if (unixMs == null || unixMs <= 0) return null;
  const totalSeconds = Math.floor(unixMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return "<1m";
}

/**
 * Log a quota snapshot event with structured fields for Logflare.
 * Converts Unix timestamps to human-readable duration strings.
 */
export function logQuotaSnapshot(input: QuotaSnapshotLogInput): void {
  const { ok, status, fetchTimeMs, error, modelRemains, endpoint, method } =
    input;
  const logLevel = ok ? "info" : "warn";
  const logTime = new Date().toISOString();

  const models: Record<string, object> = {};
  for (const m of modelRemains) {
    const key = m.model_name;
    models[key] = {
      resets_in: m.resetsIn,
      weekly_resets_in: m.weeklyResetsIn,
      interval_remaining_pct: m.currentIntervalRemainingPercent,
      weekly_remaining_pct: m.currentWeeklyRemainingPercent,
      interval_status: m.currentIntervalStatus,
      weekly_status: m.currentWeeklyStatus,
    };
  }

  const logData = {
    logTime,
    event_message: `${status} - ${method}\t${endpoint}`,
    quota: {
      ok,
      status,
      fetch_time_ms: fetchTimeMs,
      error: error ?? null,
    },
    models,
  };

  logger[logLevel](logData, logData.event_message);
}
