import { Router, type Request, type Response } from "express";
import { MINIMAX_API_KEY } from "../config.js";
import { TIMEOUT_MS, formatResetsIn } from "../utils/proxyUtils.js";
import { logQuotaSnapshot } from "../utils/streamLogger.js";
import { parseTokenPlanRemains } from "../utils/quotaTypes.js";
import type { TokenPlanRemainsResponse } from "../utils/quotaTypes.js";

export const quotaRouter = Router();

interface QuotaResponseOptions {
  result: QuotaFetchResult;
  endpoint: string;
  method: string;
  includeLastUpdated?: boolean;
}

/**
 * Shared handler for quota API responses.
 * Maps model data, logs snapshot, and sends JSON response.
 */
function respondWithQuotaModels(
  req: Request,
  res: Response,
  options: QuotaResponseOptions,
): void {
  const { result, endpoint, method, includeLastUpdated } = options;

  if (result.data) {
    const models = result.data.model_remains.map((m) => ({
      ...m,
      resetsIn: formatResetsIn(m.remains_time),
      weeklyResetsIn: formatResetsIn(m.weekly_remains_time),
    }));

    logQuotaSnapshot({
      ok: result.ok,
      status: result.status,
      fetchTimeMs: result.fetchTimeMs,
      modelRemains: models.map((m) => ({
        model_name: m.model_name,
        resetsIn: m.resetsIn,
        weeklyResetsIn: m.weeklyResetsIn,
        currentIntervalRemainingPercent: m.current_interval_remaining_percent,
        currentWeeklyRemainingPercent: m.current_weekly_remaining_percent,
        currentIntervalStatus: m.current_interval_status,
        currentWeeklyStatus: m.current_weekly_status,
      })),
      endpoint,
      method,
    });

    const response: Record<string, unknown> = {
      ok: result.ok,
      model_remains: models,
      base_resp: result.data.base_resp,
      fetchTimeMs: result.fetchTimeMs,
    };

    if (includeLastUpdated) {
      response.lastUpdated = new Date().toISOString();
    }

    res.status(200).json(response);
    return;
  }

  logQuotaSnapshot({
    ok: false,
    status: result.status,
    fetchTimeMs: result.fetchTimeMs,
    error: result.error ?? "upstream_error",
    modelRemains: [
      {
        model_name: "unknown",
        resetsIn: null,
        weeklyResetsIn: null,
        currentIntervalRemainingPercent: 0,
        currentWeeklyRemainingPercent: 0,
        currentIntervalStatus: 0,
        currentWeeklyStatus: 0,
      },
    ],
    endpoint,
    method,
  });

  res.status(502).json({ error: result.error ?? "upstream_error" });
}

interface QuotaFetchResult {
  ok: boolean;
  data: TokenPlanRemainsResponse | null;
  status: number;
  error?: string;
  fetchTimeMs: number;
}

async function fetchQuotaSnapshot(endpoint: string): Promise<QuotaFetchResult> {
  const start = Date.now();

  if (!MINIMAX_API_KEY) {
    return {
      ok: false,
      data: null,
      status: 0,
      error: "missing_api_key",
      fetchTimeMs: Date.now() - start,
    };
  }

  const requestHeaders = {
    Authorization: `Bearer ${MINIMAX_API_KEY}`,
    "Content-Type": "application/json",
  };

  try {
    const fetchRes = await fetch(
      "https://api.minimax.io/v1/token_plan/remains",
      {
        method: "GET",
        headers: requestHeaders,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    const status = fetchRes.status;

    if (!fetchRes.ok) {
      let errorMessage = `http_${status}`;
      try {
        const text = await fetchRes.text();
        if (text) errorMessage = `${errorMessage}:${text.slice(0, 200)}`;
      } catch {
        // ignore body-read errors
      }
      return {
        ok: false,
        data: null,
        status,
        error: errorMessage,
        fetchTimeMs: Date.now() - start,
      };
    }

    let json: unknown;
    try {
      json = await fetchRes.json();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        data: null,
        status,
        error: `json_parse:${msg.slice(0, 200)}`,
        fetchTimeMs: Date.now() - start,
      };
    }

    const parsed = parseTokenPlanRemains(json, endpoint);
    return {
      ok: parsed.success,
      data: parsed.data,
      status,
      fetchTimeMs: Date.now() - start,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      data: null,
      status: 0,
      error: `network:${msg.slice(0, 200)}`,
      fetchTimeMs: Date.now() - start,
    };
  }
}

async function handleQuotaSnapshot(req: Request, res: Response): Promise<void> {
  const result = await fetchQuotaSnapshot("/quota");
  respondWithQuotaModels(req, res, {
    result,
    endpoint: "/quota",
    method: req.method,
    includeLastUpdated: true,
  });
}

async function handleRemains(req: Request, res: Response): Promise<void> {
  const result = await fetchQuotaSnapshot("/quota/remains");
  respondWithQuotaModels(req, res, {
    result,
    endpoint: "/quota/remains",
    method: req.method,
  });
}

quotaRouter.get("/", handleQuotaSnapshot);
quotaRouter.get("/remains", handleRemains);
quotaRouter.post("/remains", handleRemains);
