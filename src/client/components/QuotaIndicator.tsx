/**
 * QuotaIndicator - Presentational component showing quota usage metrics
 * for the "general" model from the MiniMax Token Plan API.
 */

import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Inline type definitions (copied from quotaTypes.ts for client-side use)
// ---------------------------------------------------------------------------

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
}

interface QuotaBaseResp {
  status_code: number;
  status_msg: string;
}

interface QuotaSnapshot {
  ok: boolean;
  data: {
    model_remains: ModelRemains[];
    base_resp: QuotaBaseResp;
  } | null;
  fetchTimeMs: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSeverityColor(remainingPercent: number): string {
  if (remainingPercent > 25) return "#00ff88"; // green
  if (remainingPercent >= 10) return "#ffaa00"; // yellow
  return "#ff4444"; // red
}

function formatTime(ms: number): string {
  const date = new Date(ms);
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ProgressBarProps {
  label: string;
  current: number;
  total: number;
  remainingPercent: number;
}

function ProgressBar({ label, current, total, remainingPercent }: ProgressBarProps): ReactNode {
  const fillPercent = total > 0 ? Math.min((current / total) * 100, 100) : 0;
  const color = getSeverityColor(remainingPercent);

  return (
    <div style={{ marginBottom: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
        <span style={{ fontSize: "0.875rem", color: "#ccc" }}>{label}</span>
        <span style={{ fontSize: "0.875rem", color: "#888" }}>
          {current.toLocaleString()} / {total.toLocaleString()} ({remainingPercent.toFixed(1)}%)
        </span>
      </div>
      <div
        style={{
          width: "100%",
          height: "8px",
          backgroundColor: "#1a2a4a",
          borderRadius: "4px",
          overflow: "hidden",
        }}>
        <div
          style={{
            width: `${fillPercent}%`,
            height: "100%",
            backgroundColor: color,
            transition: "width 0.3s ease, background-color 0.3s ease",
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface QuotaIndicatorProps {
  snapshot: QuotaSnapshot | null;
  loading: boolean;
}

export default function QuotaIndicator({ snapshot, loading }: QuotaIndicatorProps): ReactNode {
  const cardStyle: React.CSSProperties = {
    backgroundColor: "#16213e",
    padding: "1.5rem",
    borderRadius: "8px",
  };

  const titleStyle: React.CSSProperties = {
    fontSize: "1rem",
    marginBottom: "1rem",
    color: "#888",
  };

  const footerStyle: React.CSSProperties = {
    color: "#888",
    fontSize: "0.875rem",
    marginTop: "1rem",
  };

  // Loading state
  if (loading) {
    return (
      <div style={cardStyle}>
        <h2 style={titleStyle}>Quota Usage</h2>
        <p style={{ color: "#888" }}>Loading...</p>
      </div>
    );
  }

  // Unavailable state
  if (snapshot === null) {
    return (
      <div style={cardStyle}>
        <h2 style={titleStyle}>Quota Usage</h2>
        <p style={{ color: "#888" }}>Unavailable</p>
      </div>
    );
  }

  // Find "general" model
  const generalModel = snapshot.data?.model_remains?.find(
    (m) => m.model_name.toLowerCase() === "general",
  );

  // No quota data
  if (!generalModel) {
    return (
      <div style={cardStyle}>
        <h2 style={titleStyle}>Quota Usage</h2>
        <p style={{ color: "#888" }}>No quota data</p>
        {snapshot.fetchTimeMs > 0 && (
          <p style={footerStyle}>Last updated: {formatTime(snapshot.fetchTimeMs)}</p>
        )}
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <h2 style={titleStyle}>Quota Usage</h2>

      <ProgressBar
        label="Interval Usage"
        current={generalModel.current_interval_usage_count}
        total={generalModel.current_interval_total_count}
        remainingPercent={generalModel.current_interval_remaining_percent}
      />

      <ProgressBar
        label="Weekly Usage"
        current={generalModel.current_weekly_usage_count}
        total={generalModel.current_weekly_total_count}
        remainingPercent={generalModel.current_weekly_remaining_percent}
      />

      <p style={footerStyle}>Last updated: {formatTime(snapshot.fetchTimeMs)}</p>
    </div>
  );
}
