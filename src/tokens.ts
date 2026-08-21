/**
 * Nymrel Warm Paper Design System Tokens
 * 
 * Signature palette:
 * - Warm Cream (#FAF8F2)
 * - Warm Paper / Soft Linen (#F4F0E6)
 * - Cedar Green (#2A332E)
 * - Terracotta (#A8541F)
 * - Stone Border (#E2DDD2)
 * 
 * Complies with the Nymrel Dual-Audience Rule:
 * Verifiable machine readability + exquisite human typography and warmth.
 */

export const warmPaperTokens = {
  colors: {
    // Canvas & Surface
    cream: '#FAF8F2',
    paper: '#F4F0E6',
    paperSoft: '#EFE9DC',
    paperElevated: '#FFFFFF',
    paperDarker: '#E7E1D3',

    // Primary Brand & Accents
    cedar: '#2A332E',
    cedarLight: '#3B4741',
    cedarMuted: '#4E5E55',
    cedarBg: '#E9EFEB',

    terracotta: '#A8541F',
    terracottaLight: '#C6692E',
    terracottaBg: '#FDF2EB',
    terracottaMuted: '#874217',

    // Borders & Dividers
    stoneBorder: '#E2DDD2',
    stoneBorderLight: '#ECE8DF',
    stoneBorderDark: '#C9C2B4',

    // Text & Ink
    ink: '#1C1917',
    inkMuted: '#57534E',
    inkSubtle: '#78716C',
    inkFaint: '#A8A29E',
    inkInverse: '#FAF8F2',

    // Semantic States
    sage: '#2E5A44',
    sageLight: '#4E7A62',
    sageBg: '#EBF3EE',
    sageBorder: '#C2DEC8',

    amber: '#D97706',
    amberLight: '#F59E0B',
    amberBg: '#FEF3C7',
    amberBorder: '#FDE68A',

    rust: '#991B1B',
    rustLight: '#B91C1C',
    rustBg: '#FEE2E2',
    rustBorder: '#FECACA',

    sky: '#0369A1',
    skyLight: '#0284C7',
    skyBg: '#E0F2FE',
    skyBorder: '#BAE6FD',
  },

  typography: {
    fonts: {
      serif: "'Newsreader', 'Fraunces', 'Georgia', 'Cambria', serif",
      sans: "'Inter', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      mono: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
    },
    sizes: {
      xs: '0.75rem',     // 12px
      sm: '0.875rem',    // 14px
      base: '1rem',      // 16px
      lg: '1.125rem',    // 18px
      xl: '1.25rem',     // 20px
      '2xl': '1.5rem',   // 24px
      '3xl': '1.875rem', // 30px
    },
    weights: {
      regular: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    },
    lineHeights: {
      tight: '1.25',
      normal: '1.5',
      relaxed: '1.65',
    },
  },

  shadows: {
    card: '0 4px 20px -2px rgba(42, 51, 46, 0.06), 0 2px 6px -1px rgba(42, 51, 46, 0.04)',
    hover: '0 8px 30px -4px rgba(42, 51, 46, 0.09), 0 4px 10px -2px rgba(42, 51, 46, 0.06)',
    elevated: '0 12px 40px -6px rgba(42, 51, 46, 0.12), 0 6px 16px -3px rgba(42, 51, 46, 0.08)',
    inner: 'inset 0 2px 4px 0 rgba(42, 51, 46, 0.04)',
    focus: '0 0 0 3px rgba(168, 84, 31, 0.22)',
    focusCedar: '0 0 0 3px rgba(42, 51, 46, 0.20)',
  },

  radii: {
    xs: '4px',
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    '2xl': '20px',
    pill: '9999px',
  },

  spacing: {
    1: '0.25rem',  // 4px
    2: '0.5rem',   // 8px
    3: '0.75rem',  // 12px
    4: '1rem',     // 16px
    5: '1.25rem',  // 20px
    6: '1.5rem',   // 24px
    8: '2rem',     // 32px
    10: '2.5rem',  // 40px
    12: '3rem',    // 48px
  },

  transitions: {
    fast: '150ms cubic-bezier(0.16, 1, 0.3, 1)',
    base: '250ms cubic-bezier(0.16, 1, 0.3, 1)',
    smooth: '350ms cubic-bezier(0.16, 1, 0.3, 1)',
  },
} as const;

export type WarmPaperTokens = typeof warmPaperTokens;
