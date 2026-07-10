/**
 * AppTypography - Typography scale and type definitions
 * 
 * Named semantic type styles that bundle fontSize, fontWeight, lineHeight,
 * and (where relevant) letterSpacing / textTransform.
 * 
 * Values are in `px` (not `rem`) per project preference — keeps type sizes
 * predictable across user-agent base font-size settings.
 */

export const typography = {
  /** Page title — primary `h1` display heading. */
  pageTitle: {
    fontSize: "28px",
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: "-0.02em",
  },
  /** Subtitle / description under the page title. */
  subtitle: {
    fontSize: "14px",
    fontWeight: 400,
    lineHeight: 1.5,
  },
  /** Default body text. */
  body: {
    fontSize: "14px",
    fontWeight: 400,
    lineHeight: 1.5,
  },
  /** Inline label text (e.g. "5h Limit", "Weekly Limit"). */
  label: {
    fontSize: "14px",
    fontWeight: 400,
    lineHeight: 1.5,
  },
  /** Model name (`h3` inside QuotaIndicator). */
  modelName: {
    fontSize: "14px",
    fontWeight: 600,
    lineHeight: 1.4,
  },
  /** Endpoint group title (`h3` — "Anthropic", "OpenAI", etc.). */
  endpointTitle: {
    fontSize: "13px",
    fontWeight: 600,
    lineHeight: 1.4,
  },
  /** Monospace code paths and URLs. */
  code: {
    fontSize: "13px",
    fontWeight: 400,
    lineHeight: 1.4,
  },
  /** Section title — uppercase headings like "QUOTA USAGE", "Proxy Endpoints". */
  sectionTitle: {
    fontSize: "12px",
    fontWeight: 600,
    lineHeight: 1.4,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  /** Status badge text ("Online", "Offline", "Checking..."). */
  statusBadge: {
    fontSize: "12px",
    fontWeight: 500,
    lineHeight: 1.3,
  },
  /** Footer / muted descriptive text. */
  footer: {
    fontSize: "12px",
    fontWeight: 400,
    lineHeight: 1.4,
  },
  /** HTTP method badge text (GET, POST) — monospace, paired with `theme.fonts.code`. */
  methodBadge: {
    fontSize: "11px",
    fontWeight: 600,
    lineHeight: 1.2,
  },
  /** Caption / small metadata ("Used X%", "Last checked: …"). */
  caption: {
    fontSize: "11px",
    fontWeight: 400,
    lineHeight: 1.4,
  },

  // ---- Semantic aliases (helpers, not full type styles) ----
  /** Numeric font-weight scale. */
  weights: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  /** Numeric line-height scale. */
  lineHeights: {
    tight: 1.2,
    snug: 1.3,
    normal: 1.4,
    relaxed: 1.5,
    loose: 1.7,
  },
  /** Letter-spacing scale. */
  letterSpacing: {
    tight: "-0.02em",
    normal: "0",
    wide: "0.08em",
  },
} as const;

/**
 * Type representing a single semantic typography token (e.g. `pageTitle`,
 * `caption`). All tokens share this shape so they can be spread into
 * `React.CSSProperties` interchangeably.
 */
export type TypographyToken = {
  fontSize: string;
  fontWeight: number;
  lineHeight: number;
  letterSpacing?: string;
  textTransform?: "uppercase" | "lowercase" | "capitalize" | "none";
};
