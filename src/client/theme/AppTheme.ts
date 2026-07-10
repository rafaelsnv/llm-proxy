/**
 * AppTheme - Design tokens and shared styles for client components
 */

import type { ReactNode } from "react";
import { typography, type TypographyToken } from "./AppTypography";

// Re-export typography and type for convenience
export { typography };
export type { TypographyToken };

// ---------------------------------------------------------------------------
// Design tokens (theme)
// ---------------------------------------------------------------------------

export const theme = {
  colors: {
    bgPrimary: "#0e0c0a",
    bgCard: "#1a1714",
    bgCardHover: "#221d18",
    accent: "#fb923c",
    accentDim: "#c9731a",
    success: "#4ade80",
    warning: "#fbbf24",
    error: "#f87171",
    textPrimary: "#fafaf9",
    textSecondary: "#a8a29e",
    textMuted: "#57534e",
    border: "#2a2520",
    borderAccent: "rgba(251, 146, 60, 0.2)"
  },
  fonts: {
    body: '"Inter", system-ui, -apple-system, sans-serif',
    code: '"JetBrains Mono", "Fira Code", "Consolas", monospace'
  },
  typography,
  spacing: {
    cardPadding: "1rem",
    cardGap: "0.75rem",
    sectionGap: "1rem"
  },
  radius: {
    card: "12px",
    inner: "6px"
  }
} as const;

// ---------------------------------------------------------------------------
// Styles factory
// ---------------------------------------------------------------------------

export function createCardStyle(isHovered?: boolean): React.CSSProperties {
  return {
    backgroundColor: isHovered ? theme.colors.bgCardHover : theme.colors.bgCard,
    padding: theme.spacing.cardPadding,
    borderRadius: theme.radius.card,
    border: `1px solid ${isHovered ? theme.colors.borderAccent : theme.colors.border}`,
    transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
    transform: isHovered ? "translateY(-2px)" : "translateY(0)",
    boxShadow: isHovered
      ? "0 8px 30px rgba(251, 146, 60, 0.08)"
      : "0 4px 12px rgba(0, 0, 0, 0.3)"
  };
}

// ---------------------------------------------------------------------------
// Global styles (inject via style tag in StatusPage)
// ---------------------------------------------------------------------------

export const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

  @keyframes statusPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.6; transform: scale(0.9); }
  }

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    font-family: ${theme.fonts.body};
    font-size: 16px;
    line-height: 1.5;
    color: ${theme.colors.textPrimary};
    background-color: ${theme.colors.bgPrimary};
  }

  code {
    font-family: ${theme.fonts.code};
  }

  ::selection {
    backgroundColor: rgba(251, 146, 60, 0.3);
  }

  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    background: ${theme.colors.bgPrimary};
  }

  ::-webkit-scrollbar-thumb {
    background: ${theme.colors.border};
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: ${theme.colors.textMuted};
  }
`;
