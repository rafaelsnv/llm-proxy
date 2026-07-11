/**
 * StatusPage - Landing page component for Minimax LLM Proxy
 * Displays server health, quota usage, and available proxy endpoints
 */

import { useState, useEffect, type ReactNode } from "react";
import QuotaIndicator from "./QuotaIndicator";
import { theme, createCardStyle, globalStyles } from "../theme/AppTheme";

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

interface HealthStatus {
  status: string;
  timestamp: string;
}

interface ModelRemains {
  start_time: number;
  end_time: number;
  remains_time: number;
  current_interval_total_count: number;
  current_interval_usage_count: number;
  model_name: string;
  current_weekly_total_count: number;
  current_weekly_usage_count: number;
  weekly_start_time: number;
  weekly_end_time: number;
  weekly_remains_time: number;
  current_interval_status: number;
  current_interval_remaining_percent: number;
  current_weekly_status: number;
  current_weekly_remaining_percent: number;
  resetsIn?: string | null;
  weeklyResetsIn?: string | null;
}

interface QuotaStatus {
  ok: boolean;
  model_remains: ModelRemains[];
  base_resp: { status_code: number; status_msg: string };
  fetchTimeMs: number;
  lastUpdated?: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface CardProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

function Card({ children, style }: CardProps): ReactNode {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      style={{ ...createCardStyle(isHovered), ...style }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
    </div>
  );
}

interface SectionTitleProps {
  children: ReactNode;
}

function SectionTitle({ children }: SectionTitleProps): ReactNode {
  return (
    <h2
      style={{
        ...theme.typography.sectionTitle,
        color: theme.colors.textPrimary,
        marginBottom: "1rem",
      }}
    >
      {children}
    </h2>
  );
}

interface StatusBadgeProps {
  type: "success" | "error" | "warning";
  children: ReactNode;
}

function StatusBadge({ type, children }: StatusBadgeProps): ReactNode {
  const colors = {
    success: theme.colors.success,
    error: theme.colors.error,
    warning: theme.colors.warning,
  };

  return (
    <span
      style={{
        ...theme.typography.statusBadge,
        display: "inline-flex",
        alignItems: "center",
        gap: "0.375rem",
        color: colors[type],
        backgroundColor: `${colors[type]}15`,
        padding: "0.25rem 0.625rem",
        borderRadius: "9999px",
        border: `1px solid ${colors[type]}30`,
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          backgroundColor: colors[type],
          animation: "statusPulse 2s ease-in-out infinite",
        }}
      />
      {children}
    </span>
  );
}

interface EndpointGroupProps {
  title: string;
  endpoints: { method: string; path: string; description?: string }[];
}

function EndpointGroup({ title, endpoints }: EndpointGroupProps): ReactNode {
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const handleCopy = async (path: string) => {
    try {
      await navigator.clipboard.writeText(window.location.origin + path);
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 1500);
    } catch {
      // fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = window.location.origin + path;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 1500);
    }
  };

  return (
    <div>
      <h3
        style={{
          ...theme.typography.endpointTitle,
          color: theme.colors.accent,
          marginBottom: "0.5rem",
        }}
      >
        {title}
      </h3>
      {endpoints.map((ep) => (
        <div
          key={ep.path + ep.method}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "0.5rem 0.75rem",
            marginLeft: "-0.75rem",
            borderRadius: theme.radius.inner,
            borderLeft: "2px solid transparent",
            transition: "all 0.15s ease",
            cursor: "pointer",
            backgroundColor: copiedPath === ep.path ? "rgba(0, 255, 136, 0.1)" : "transparent",
            borderLeftColor: copiedPath === ep.path ? theme.colors.success : "transparent",
          }}
          onClick={() => handleCopy(ep.path)}
          onMouseEnter={(e) => {
            if (copiedPath !== ep.path) {
              e.currentTarget.style.backgroundColor = "rgba(0, 212, 255, 0.05)";
              e.currentTarget.style.borderLeftColor = theme.colors.accent;
            }
          }}
          onMouseLeave={(e) => {
            if (copiedPath !== ep.path) {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.borderLeftColor = "transparent";
            }
          }}
        >
          <span
            style={{
              ...theme.typography.methodBadge,
              fontFamily: theme.fonts.code,
              color: theme.colors.accent,
              backgroundColor: "rgba(251, 146, 60, 0.1)",
              padding: "0.125rem 0.375rem",
              borderRadius: "3px",
              minWidth: "52px",
              textAlign: "center",
            }}
          >
            {ep.method}
          </span>
          <code
            style={{
              ...theme.typography.code,
              fontFamily: theme.fonts.code,
              color: copiedPath === ep.path ? theme.colors.success : theme.colors.textSecondary,
            }}
          >
            {copiedPath === ep.path ? "Copied!" : ep.path}
          </code>
          {ep.description && (
            <span
              style={{
                ...theme.typography.footer,
                color: theme.colors.textMuted,
                marginLeft: "auto",
              }}
            >
              {ep.description}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function StatusPage(): ReactNode {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isVisible, setIsVisible] = useState(!document.hidden);
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function handleVisibilityChange() {
      setIsVisible(!document.hidden);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    checkHealth();
    checkQuota();
  }, [isVisible]);

  async function checkHealth() {
    if (!isVisible) return;

    try {
      const res = await fetch("/health");
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
        setError(null);
      } else {
        setError(`Health check failed: ${res.status}`);
      }
    } catch {
      setError("Cannot connect to proxy");
    } finally {
      setLoading(false);
    }
  }

  async function checkQuota() {
    if (!isVisible) return;

    try {
      const res = await fetch("/quota");
      if (res.status === 503 || res.status === 502) {
        setQuota(null);
        setQuotaLoading(false);
      } else if (res.ok) {
        const data = await res.json();
        setQuota(data as QuotaStatus);
        setQuotaLoading(false);
      } else {
        setQuota(null);
        setQuotaLoading(false);
      }
    } catch {
      setQuota(null);
      setQuotaLoading(false);
    }
  }

  // Animation delay for staggered fade-in
  const cardAnimationStyle = (delay: number): React.CSSProperties => ({
    opacity: mounted ? 1 : 0,
    transform: mounted ? "translateY(0)" : "translateY(12px)",
    transition: `opacity 0.4s ease-out ${delay}ms, transform 0.4s ease-out ${delay}ms`,
  });

  return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: theme.colors.bgPrimary,
          fontFamily: theme.fonts.body,
          color: theme.colors.textPrimary,
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
      <style dangerouslySetInnerHTML={{ __html: globalStyles }} />

      <div
        style={{
          maxWidth: "1024px",
          width: "100%",
          margin: "0 auto",
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <header
          style={{
            marginBottom: theme.spacing.cardGap,
            ...cardAnimationStyle(0),
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div>
              <h1
                style={{
                  ...theme.typography.pageTitle,
                  color: theme.colors.textPrimary,
                }}
              >
                Minimax LLM Proxy
              </h1>
              <p
                style={{
                  ...theme.typography.subtitle,
                  color: theme.colors.textMuted,
                  marginTop: "0.25rem",
                }}
              >
                API Gateway Status & Documentation
              </p>
            </div>
            {!loading && !error && health && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
                <StatusBadge type="success">Online</StatusBadge>
                <span
                  style={{
                    ...theme.typography.caption,
                    color: theme.colors.textMuted,
                  }}
                >
                  Last checked:{" "}
                  {new Date(health.timestamp).toLocaleTimeString("en-US", {
                    hour12: false,
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
              </div>
            )}
            {!loading && error && <StatusBadge type="error">Offline</StatusBadge>}
            {loading && (
              <StatusBadge type="warning">Checking...</StatusBadge>
            )}
          </div>
        </header>

        {/* Quota Card */}
        <div
          style={{
            marginBottom: theme.spacing.sectionGap,
            ...cardAnimationStyle(80),
          }}
        >
          <QuotaIndicator snapshot={quota} loading={quotaLoading} />
        </div>

        {/* Proxy Endpoints Card */}
        <Card style={cardAnimationStyle(240)}>
          <SectionTitle>Proxy Endpoints</SectionTitle>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "1rem",
            }}
          >
            <EndpointGroup
              title="Anthropic"
              endpoints={[
                { method: "POST", path: "/anthropic/v1/messages" },
                { method: "GET", path: "/anthropic/v1/models" },
              ]}
            />

            <EndpointGroup
              title="OpenAI"
              endpoints={[
                { method: "POST", path: "/openai/v1/chat/completions" },
                { method: "GET", path: "/openai/v1/models" },
              ]}
            />

            <EndpointGroup
              title="Utilities"
              endpoints={[
                { method: "GET", path: "/health" },
                { method: "GET", path: "/quota" },
              ]}
            />
          </div>
        </Card>

        {/* Footer */}
        <footer
          style={{
            textAlign: "center",
            paddingTop: "1.5rem",
            marginTop: "auto",
          }}
        >
          <p
            style={{
              ...theme.typography.footer,
              color: theme.colors.textMuted,
            }}
          >
            Minimax LLM Proxy • Status Page
          </p>
        </footer>
      </div>
    </div>
  );
}
