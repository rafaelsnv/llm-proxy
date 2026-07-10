import express from "express";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import compression from "compression";
import { logger } from "./utils/logger.js";
import {
  PORT,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
} from "./config.js";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { anthropicRouter } from "./routes/anthropic.js";
import { openaiRouter } from "./routes/openai.js";
import { quotaRouter } from "./routes/quota.js";
import { startThrottleCleanup } from "./utils/quotaTypes.js";

// Extend Express Request to include startTime
declare global {
  namespace Express {
    interface Request {
      startTime?: number;
    }
  }
}

const rateLimiter = rateLimit({
  max: RATE_LIMIT_MAX,
  windowMs: RATE_LIMIT_WINDOW_MS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(
      {
        event_message: `429 - ${req.method}\t${req.path}`,
        req: { method: req.method, url: req.path },
      },
      "Rate limit exceeded",
    );
    res.status(429).json({
      error: {
        message: "Too many requests",
        type: "rate_limit_error",
        status: 429,
      },
    });
  },
});

const app = express();

// Trust first proxy (for X-Forwarded-For behind reverse proxy)
app.set("trust proxy", 1);

// Correlation ID middleware
app.use((req, res, next) => {
  const correlationId =
    (req.headers["x-correlation-id"] as string) || crypto.randomUUID();
  res.setHeader("X-Correlation-ID", correlationId);
  req.headers["x-correlation-id"] = correlationId;
  next();
});

// Middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(corsMiddleware);
app.use(helmet());
app.use(compression());
app.use((req, res, next) => {
  req.startTime = Date.now();
  next();
});
app.use(
  pinoHttp({
    logger,
    autoLogging: false,
    quietReqLogger: true,
    quietResLogger: true,
    timestamp: false,
    customLogLevel: (_req, res, err) => {
      if (res.statusCode >= 500 || err) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
    customSuccessMessage: (_req, res, _responseTime) => {
      return `${res.statusCode} - ${res.req.method} ${res.req.url}`;
    },
    customErrorMessage: (_req, res, _err) => {
      return `${res.statusCode} - ${res.req.method} ${res.req.url}`;
    },
    customProps: () => ({}),
    serializers: {
      req: (req: {
        id: number;
        method: string;
        url: string;
        remoteAddress: string;
        remotePort: number;
        headers: Record<string, unknown>;
      }) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress,
        remotePort: req.remotePort,
      }),
      res: (res: { statusCode: number; headers: Record<string, unknown> }) => ({
        statusCode: res.statusCode,
      }),
    },
    formatters: {
      log: (obj: Record<string, unknown>) => {
        if (obj.metadata) {
          const { metadata, ...rest } = obj;
          return { ...rest, ...(metadata as Record<string, unknown>) };
        }
        return obj;
      },
    },
    redact: {
      paths: ["timestamp"],
      remove: true,
    },
  }),
);
app.use(rateLimiter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Proxy routes
app.use("/anthropic", anthropicRouter);
app.use("/", openaiRouter);
app.use("/quota", quotaRouter);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`Minimax Proxy running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);

  logger.info(
    {
      event: "server_startup",
      port: PORT,
      url: `http://localhost:${PORT}`,
      timestamp: new Date().toISOString(),
    },
    "Minimax Proxy running",
  );
  logger.info(
    {
      event: "health_check_available",
      url: `http://localhost:${PORT}/health`,
    },
    "Health check endpoint ready",
  );
  // Start periodic throttle state cleanup
  startThrottleCleanup();
});



// Graceful shutdown handler
const shutdown = () => {
  server.close(() => {
    process.exit(0);
  });
};

// Register shutdown handlers
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
