import { Router } from "express";
import {
  filterHeaders,
  forwardRateLimitHeaders,
  TIMEOUT_MS,
  ALLOWED_HEADERS,
} from "../utils/proxyUtils.js";
import { OPENAI_BASE_URL, MINIMAX_API_KEY } from "../config.js";
import {
  extractOpenAIStreamingInfoFromBytes,
  logStreamingResponse,
  logStreamingError,
} from "../utils/streamLogger.js";

export const openaiRouter = Router();

openaiRouter.post("/openai/v1/chat/completions", async (req, res) => {
  const targetUrl = `${OPENAI_BASE_URL}/chat/completions`;

  const headers = filterHeaders(req.headers, ALLOWED_HEADERS);
  // OpenAI-compatible endpoint expects Authorization header with Bearer token.
  headers["Authorization"] = `Bearer ${MINIMAX_API_KEY}`;

  try {
    // Boundary A — start of upstream fetch.
    const fetchStart = Date.now();
    const fetchRes = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const upstreamLatencyMs = Date.now() - fetchStart;
    res.status(fetchRes.status);

    forwardRateLimitHeaders(fetchRes, res);

    if (fetchRes.body) {
      const chunks: Uint8Array[] = [];
      const body = fetchRes.body as unknown as AsyncIterable<Uint8Array>;
      for await (const chunk of body) {
        chunks.push(chunk);
        res.write(chunk);
      }
      res.end();

      const info = extractOpenAIStreamingInfoFromBytes(chunks);
      logStreamingResponse(
        fetchRes.status,
        req.method,
        "/openai/v1/chat/completions",
        Date.now() - (req.startTime ?? Date.now()),
        {
          contentSnippet: info.contentSnippet,
          model: info.model,
          finishReason: info.finishReason,
          usage: info.usage,
          responseId: info.responseId,
          inputSensitiveType: info.inputSensitiveType,
          outputSensitive: info.outputSensitive,
          toolCalls: info.toolCalls?.map((tc: { id: string; function: { name: string; arguments: string } }) => ({
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
          })),
          reqId: String(req.id),
          routeClass: "proxy_out",
          upstreamLatencyMs,
          cacheWasRead: false,
          cacheWasWritten: false,
          systemPromptBytes: computeOpenAISystemPromptBytes(
            extractOpenAISystemPrompt(req.body),
          ),
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
    } else {
      res.end();
      logStreamingResponse(
        fetchRes.status,
        req.method,
        "/openai/v1/chat/completions",
        Date.now() - (req.startTime ?? Date.now()),
        {
          contentSnippet: "",
          // Round-4 net-new fields (no streaming response -> cache_was_* = false).
          reqId: String(req.id),
          routeClass: "proxy_out",
          upstreamLatencyMs,
          cacheWasRead: false,
          cacheWasWritten: false,
          toolCalls: Array.isArray(req.body.tools)
            ? req.body.tools.map((t: unknown) => ({
                id: (t as { id?: string }).id ?? "",
                name: (t as { function?: { name?: string } }).function?.name ?? "",
                arguments: "",
              }))
            : undefined,
          systemPromptBytes: computeOpenAISystemPromptBytes(
            extractOpenAISystemPrompt(req.body),
          ),
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
    const responseTime = Date.now() - (req.startTime ?? Date.now());
    logStreamingError({
      err,
      method: req.method,
      endpoint: "/openai/v1/chat/completions",
      responseTime_ms: responseTime,
      reqId: String(req.id),
      routeClass: "proxy_out",
      upstreamStatus: undefined,
    });
  }
});

openaiRouter.get("/v1/models", (req, res) => {
  res.json({
    object: "list",
    data: [
      {
        id: "MiniMax-M2.7",
        object: "model",
        created: 1715367400,
        owned_by: "minimax",
      },
    ],
  });
});

/**
 * OpenAI's `messages` array accepts a top-level entry with `role: "system"`
 * instead of a separate `system` field. This helper returns the
 * concatenated text of any such entry, or `undefined` when none exists.
 *
 * Used to compute `system_prompt_present` / `system_prompt_bytes` for the
 * log payload.
 */
function extractOpenAISystemPrompt(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const messages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return undefined;
  const parts: string[] = [];
  for (const msg of messages) {
    if (
      typeof msg === "object" &&
      msg !== null &&
      (msg as { role?: unknown }).role === "system"
    ) {
      const content = (msg as { content?: unknown }).content;
      if (typeof content === "string") parts.push(content);
    }
  }
  return parts.length > 0 ? parts.join("\n") : undefined;
}

/**
 * Byte length of the joined OpenAI system-prompt content. Returns 0
 * when the body has no system-role messages.
 */
function computeOpenAISystemPromptBytes(prompt: string | undefined): number {
  return prompt ? prompt.length : 0;
}
