# Minimax Token Plan Proxy

A local proxy server that enables AI coding tools to use the Minimax Token Plan API from any network via OpenAI or Anthropic-compatible endpoints.

## Features

- **Dual API compatibility** - OpenAI (`/openai/v1/chat/completions`) and Anthropic (`/anthropic/v1/messages`) endpoints
- **Transparent proxy** - Pass-through requests with header filtering and rate limit header forwarding
- **Quota monitoring** - Built-in quota status page with interval and weekly usage visualization
- **Security** - Helmet security headers, configurable CORS, rate limiting per IP
- **Observability** - Structured logging with Pino, correlation IDs, Logflare support
- **Streaming support** - Full pass-through streaming for real-time responses
- **Graceful shutdown** - Clean SIGTERM/SIGINT handling
- **Visibility-aware polling** - Status page pauses polling when tab is hidden

## Requirements

- Node.js >= 18.0.0

## Setup

1. Clone the repository
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Configure environment variables in `.env`:
   ```bash
   MINIMAX_API_KEY=your_minimax_token_plan_key
   PORT=7331                                        # optional, defaults to 7331
   CORS_ORIGIN=*                                    # optional, defaults to *
   RATE_LIMIT_MAX=100                               # optional, defaults to 100
   RATE_LIMIT_WINDOW_MS=900000                      # optional, defaults to 900000 (15 min)
   LOGFLARE_API_KEY=                                # optional
   LOGFLARE_SOURCE_TOKEN=                           # optional
   ```
4. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Start Server

```bash
npm run dev
```

The server starts on `http://localhost:7331` by default.

### Configure AI Tools

**Anthropic-compatible (Claude Desktop, etc.):**

```
API Endpoint: http://localhost:7331/anthropic/v1/messages
API Key: sk-cp:your_minimax_key
```

**OpenAI-compatible (Cursor, Windsurf, etc.):**

```
API Endpoint: http://localhost:7331/openai/v1/chat/completions
API Key: sk-cp:your_minimax_key
```

### Endpoints

| Method | Path                          | Description                     |
| ------ | ----------------------------- | ------------------------------- |
| `GET`  | `/health`                     | Health check                    |
| `GET`  | `/quota`                      | Quota status with usage metrics |
| `GET`  | `/anthropic/v1/models`        | List available models           |
| `GET`  | `/openai/v1/models`           | List available models           |
| `POST` | `/openai/v1/chat/completions` | OpenAI-compatible proxy         |
| `POST` | `/anthropic/v1/messages`      | Anthropic-compatible proxy      |

### Status Page

Open `http://localhost:7331` in your browser to see the status page. The page displays:

- Server connection status
- Quota usage with interval and weekly progress bars
- Available proxy endpoints

Polling automatically pauses when the tab is hidden to reduce unnecessary requests.

## Configuration

| Variable                | Default    | Description                                       |
| ----------------------- | ---------- | ------------------------------------------------- |
| `PORT`                  | 7331       | Server port                                       |
| `MINIMAX_API_KEY`       | (required) | Minimax API key - fails startup if missing        |
| `CORS_ORIGIN`           | `*`        | CORS origins (comma-separated, `null` to disable) |
| `RATE_LIMIT_MAX`        | 100        | Max requests per window per IP                    |
| `RATE_LIMIT_WINDOW_MS`  | 900000     | Rate limit window (15 min default)                |
| `LOGFLARE_API_KEY`      | -          | Logflare API key for log streaming                |
| `LOGFLARE_SOURCE_TOKEN` | -          | Logflare source token                             |

## Security Notes

- API keys must use `sk-cp:` prefix
- CORS is wildcard by default; restrict with `CORS_ORIGIN` for production
- Rate limiting enabled by default (100 req/15min per IP)
- Helmet security headers applied to all responses
- Caller's `x-api-key` is never forwarded to upstream; server uses its own key

## Architecture

```
src/
├── client/                    # React + Vite status UI
│   ├── App.tsx
│   └── components/
│       ├── StatusPage.tsx     # Main status page with health check
│       └── QuotaIndicator.tsx # Quota usage visualization
├── server/
│   ├── index.ts              # Express app setup
│   ├── config.ts             # Configuration & validation
│   ├── middleware/
│   │   ├── cors.ts           # CORS middleware
│   │   └── errorHandler.ts   # Error & 404 handlers
│   ├── routes/
│   │   ├── anthropic.ts      # Anthropic /v1/messages proxy
│   │   ├── openai.ts         # OpenAI /v1/chat/completions proxy
│   │   └── quota.ts          # Token plan quota endpoints
│   └── utils/
│       ├── logger.ts         # Pino logger configuration
│       ├── proxyUtils.ts     # Header filtering, rate limit forwarding
│       ├── quotaTypes.ts     # Quota response types
│       └── streamLogger.ts   # Streaming response logging
```

## Logging

Structured JSON logs are output to stdout with the following events:

- `200 - POST /anthropic/v1/messages` - Successful Anthropic proxy request
- `200 - POST /openai/v1/chat/completions` - Successful OpenAI proxy request
- `200 - GET /quota` - Quota snapshot retrieved
- `proxy.error` - Streaming error (timeout, network, auth, parse, unknown)

Log fields include: `responseTime_ms`, `upstream_latency_ms`, `usage`, `cache_was_read`, `cache_was_written`, `req_id`, `correlation_id`, and more.

For Logflare streaming, set `LOGFLARE_API_KEY` and `LOGFLARE_SOURCE_TOKEN`.

## Development

```bash
npm run dev        # Run both server and client in parallel
npm run server     # Run server only with tsx watch
npm run client     # Run Vite dev server only
npm run build      # Build for production
npm run start      # Run production server
npm run test       # Run tests with Vitest
```

## Termux (Android)

### Prerequisites

```bash
pkg update && pkg upgrade -y
pkg install nodejs git
```

### Clone and Setup

```bash
git clone https://github.com/your-user/llm-proxy.git
cd llm-proxy
npm install
```

### Cloudflare Tunnel Setup

```bash
# Install cloudflared
pkg install cloudflared

# Authenticate (opens browser to authorize)
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create <tunnel-name>

# Create config file
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml << 'EOF'
ingress:
  - hostname: proxy.example.com
    service: http://localhost:7331
  - service: http_status:404
EOF

# Route DNS
cloudflared tunnel route dns <tunnel-name> proxy.example.com

# Run tunnel in background
nohup cloudflared tunnel run <tunnel-name> > cloudflared.log 2>&1 &
```

### Build and Run

```bash
# Create production script if needed (add to package.json)
# "prod": "tsx src/server/index.ts"

# Run proxy (from ~/llm-proxy directory)
pm2 start npm --name "llm-proxy" -- run prod
```

### Useful Commands

```bash
# Health check
curl https://proxy.example.com/health

# Test POST
curl -X POST https://proxy.example.com/anthropic/v1/messages -H "Content-Type: application/json" -H "x-api-key: sk-cp:test" -H "anthropic-version: 2023-06-01" -d '{"model":"MiniMax-M2.7","max_tokens":100,"messages":[{"role":"user","content":"Hello"}]}'

# PM2 status and logs
pm2 list
pm2 logs llm-proxy --lines 20
pm2 flush

# Stop cloudflared
pkill cloudflared

# Start everything after phone reboot
cd ~/llm-proxy
nohup cloudflared tunnel run <tunnel-name> > cloudflared.log 2>&1 &
pm2 start npm --name "llm-proxy" -- run prod
```
