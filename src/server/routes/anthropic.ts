import { Router } from "express";
import { MINIMAX_BASE_URL, MINIMAX_API_KEY } from "../config.js";
import {
  filterHeaders,
  ANTHROPIC_ALLOWED_HEADERS,
  forwardRateLimitHeaders,
  TIMEOUT_MS,
} from "../utils/proxyUtils.js";
import {
  extractAnthropicStreamingInfo,
  logStreamingResponse,
  logStreamingError,
} from "../utils/streamLogger.js";

export const anthropicRouter = Router();

anthropicRouter.post("/v1/messages", async (req, res) => {
  const targetUrl = `${MINIMAX_BASE_URL}/v1/messages`;

  // Build headers - only allowed ones (x-api-key is NOT forwarded;
  // upstream requires the server's own key via x-api-key header).
  const headers = filterHeaders(req.headers, ANTHROPIC_ALLOWED_HEADERS);
  headers["x-api-key"] = MINIMAX_API_KEY;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // Boundary A — start of upstream fetch. `upstreamLatencyMs` is
    // wall-clock time spent waiting on fetch() to resolve (NOT including
    // streaming back to the client).
    const fetchStart = Date.now();
    const fetchRes = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });
    const upstreamLatencyMs = Date.now() - fetchStart;

    clearTimeout(timeout);
    res.status(fetchRes.status);

    forwardRateLimitHeaders(fetchRes, res);

    // Stream response back
    if (fetchRes.body) {
      const textChunks: string[] = [];
      const body = fetchRes.body as unknown as AsyncIterable<Uint8Array>;
      for await (const chunk of body) {
        textChunks.push(new TextDecoder().decode(chunk));
        res.write(chunk);
      }
      res.end();
      const buffer = textChunks.join('');

      const info = extractAnthropicStreamingInfo(buffer);
      logStreamingResponse(
        fetchRes.status,
        req.method,
        "/anthropic/v1/messages",
        Date.now() - (req.startTime ?? Date.now()),
        {
          contentSnippet: info.contentSnippet,
          model: info.model,
          stopReason: info.stopReason,
          usage: {
            input_tokens: info.inputTokens ?? 0,
            input_tokens_details: {
              cached_tokens: info.inputTokensDetails?.cachedTokens ?? undefined,
            },
            output_tokens: info.outputTokens ?? 0,
            output_tokens_details: {
              reasoning_tokens: info.outputTokensDetails?.reasoningTokens ?? undefined,
            },
            total_tokens: (info.inputTokens ?? 0) + (info.outputTokens ?? 0),
          },
          reqId: String(req.id),
          routeClass: "proxy_out",
          upstreamLatencyMs,
          cacheWasRead: (info.cacheReadInputTokens ?? 0) > 0,
          cacheWasWritten: (info.cacheCreationInputTokens ?? 0) > 0,
          toolCalls: undefined,
          systemPromptBytes: computeSystemPromptBytes(req.body.system),
          reqHeaders: {
            "x-correlation-id": req.headers["x-correlation-id"] as
              | string
              | undefined,
            "content-type": req.headers["content-type"] as string | undefined,
            "user-agent": req.headers["user-agent"] as string | undefined,
          },
          responseId: info.responseId,
          finishReason: info.finishReason,
          userInput: JSON.stringify(req.body.messages ?? []),
        },
      );
    } else {
      res.end();
      logStreamingResponse(
        fetchRes.status,
        req.method,
        "/anthropic/v1/messages",
        Date.now() - (req.startTime ?? Date.now()),
        {
          contentSnippet: "",
          reqId: String(req.id),
          routeClass: "proxy_out",
          upstreamLatencyMs,
          cacheWasRead: false,
          cacheWasWritten: false,
          systemPromptBytes: computeSystemPromptBytes(req.body.system),
          reqHeaders: {
            "x-correlation-id": req.headers["x-correlation-id"] as
              | string
              | undefined,
            "content-type": req.headers["content-type"] as string | undefined,
            "user-agent": req.headers["user-agent"] as string | undefined,
          },
          userInput: JSON.stringify(req.body.messages ?? []),
        },
      );
    }
  } catch (err: unknown) {
    clearTimeout(timeout);
    const responseTime = Date.now() - (req.startTime ?? Date.now());
    logStreamingError({
      err,
      method: req.method,
      endpoint: "/anthropic/v1/messages",
      responseTime_ms: responseTime,
      reqId: String(req.id),
      routeClass: "proxy_out",
      upstreamStatus: undefined,
    });
  }
});

anthropicRouter.get("/v1/models", (req, res) => {
  res.json({
    type: "list",
    data: [
      {
        type: "model",
        id: "MiniMax-M2.7",
        created_at: "2024-05-10T18:56:40Z",
        display_name: "MiniMax-M2.7",
      },
    ],
  });
});

/**
 * Approximate byte length of the `system` field. Anthropic accepts:
 *   - a plain string (`"You are ..."`)
 *   - an array of content blocks (`[{type:"text", text:"..."}, ...]`)
 * For the array form we join the `.text` of each block (defaulting to
 * empty string for missing `text`) and report that length.
 * Anything else (undefined, number, object) returns 0.
 */
function computeSystemPromptBytes(
  system: unknown,
): number {
  if (typeof system === "string") return system.length;
  if (Array.isArray(system)) {
    return system
      .map((s) => (typeof s === "object" && s !== null && "text" in s
        ? String((s as { text?: unknown }).text ?? "")
        : ""))
      .join("").length;
  }
  return 0;
}
