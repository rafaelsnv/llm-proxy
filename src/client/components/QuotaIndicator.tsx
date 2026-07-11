/**
 * QuotaIndicator - Presentational component showing quota usage metrics
 * for the "general" model from the MiniMax Token Plan API.
 */

import { useState } from "react";
import type { ReactNode } from "react";
import { theme, createCardStyle } from "../theme/AppTheme";

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
  resetsIn?: string | null;
  weeklyResetsIn?: string | null;
}

interface QuotaBaseResp {
  status_code: number;
  status_msg: string;
}

interface QuotaSnapshot {
  ok: boolean;
  model_remains: ModelRemains[];
  base_resp: QuotaBaseResp;
  fetchTimeMs: number;
  lastUpdated?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSeverityColor(remainingPercent: number): string {
  if (remainingPercent > 25) return theme.colors.success;
  if (remainingPercent >= 10) return theme.colors.warning;
  return theme.colors.error;
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
  limitLabel: string;
  resetsIn: string | null | undefined;
  current: number;
  total: number;
  usedPercent: number;
  remainingPercent: number;
}

function ProgressBar({ limitLabel, resetsIn, current, total, usedPercent, remainingPercent }: ProgressBarProps): ReactNode {
  const fillPercent = Math.min(usedPercent, 100);
  const color = getSeverityColor(remainingPercent);

  return (
    <div style={{ marginBottom: "0.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.125rem" }}>
        <span style={{ ...theme.typography.label, color: theme.colors.textSecondary }}>{limitLabel}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        {/* NOTE: fontSize intentionally kept at 0.05rem — flagged in AppTheme.ts
            typography docs as a separate design decision to revisit. */}
        <span style={{ fontSize: "0.05rem", color: theme.colors.textMuted }}>
          Resets in {resetsIn ?? "—"}
        </span>
        <span style={{ ...theme.typography.caption, color: theme.colors.textSecondary }}>
          Used {Math.round(100 - remainingPercent)}%
        </span>
      </div>
      <div
        style={{
          width: "100%",
          height: "8px",
          backgroundColor: theme.colors.border,
          borderRadius: "4px",
          overflow: "hidden",
          marginTop: "0.375rem",
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
  const [isHovered, setIsHovered] = useState(false);

  const baseCardStyle: React.CSSProperties = {
    backgroundColor: theme.colors.bgCard,
    padding: theme.spacing.cardPadding,
    borderRadius: theme.radius.card,
    border: `1px solid ${theme.colors.border}`,
    transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
  };

  const hoverCardStyle: React.CSSProperties = {
    backgroundColor: theme.colors.bgCardHover,
    border: `1px solid ${theme.colors.borderAccent}`,
    boxShadow: "0 8px 30px rgba(251, 146, 60, 0.08)",
  };

  const cardStyle = { ...baseCardStyle, ...(isHovered ? hoverCardStyle : {}) };

  const titleStyle: React.CSSProperties = {
    ...theme.typography.sectionTitle,
    marginBottom: "0.75rem",
    color: theme.colors.textPrimary,
  };



  // Loading state
  if (loading) {
    return (
      <div
        style={cardStyle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <h2 style={titleStyle}>QUOTA USAGE</h2>
        <p style={{ color: theme.colors.textSecondary }}>Loading...</p>
      </div>
    );
  }

  // Unavailable state
  if (snapshot === null) {
    return (
      <div
        style={cardStyle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <h2 style={titleStyle}>QUOTA USAGE</h2>
        <p style={{ color: theme.colors.textSecondary }}>Unavailable</p>
      </div>
    );
  }

  // No quota data
  if (!snapshot.model_remains || snapshot.model_remains.length === 0) {
    return (
      <div
        style={cardStyle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <h2 style={titleStyle}>QUOTA USAGE</h2>
        <p style={{ color: theme.colors.textSecondary }}>No quota data</p>
      </div>
    );
  }

  return (
    <div
      style={cardStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <h2 style={titleStyle}>QUOTA USAGE</h2>

      {snapshot.model_remains.map((model) => {
        const usedIntervalPercent = 100 - model.current_interval_remaining_percent;
        const usedWeeklyPercent = 100 - model.current_weekly_remaining_percent;

        return (
          <div key={model.model_name} style={{ marginBottom: "1rem" }}>
            <h3
              style={{
                ...theme.typography.modelName,
                color: theme.colors.accent,
                marginBottom: "0.5rem",
                textTransform: "capitalize",
              }}>
              {model.model_name}
            </h3>

            <ProgressBar
              limitLabel="5h Limit"
              resetsIn={model.resetsIn}
              current={model.current_interval_usage_count}
              total={model.current_interval_total_count}
              usedPercent={usedIntervalPercent}
              remainingPercent={model.current_interval_remaining_percent}
            />

            <ProgressBar
              limitLabel="Weekly Limit"
              resetsIn={model.weeklyResetsIn}
              current={model.current_weekly_usage_count}
              total={model.current_weekly_total_count}
              usedPercent={usedWeeklyPercent}
              remainingPercent={model.current_weekly_remaining_percent}
            />
          </div>
        );
      })}
    </div>
  );
}
