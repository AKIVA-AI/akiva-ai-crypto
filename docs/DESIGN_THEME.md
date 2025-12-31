# AKIVA AI CRYPTO Design Theme - Supabase Dark with Purple Accents

> Last Updated: December 2025

A clean, professional design theme inspired by Supabase's classic dark UI with purple accents. Features neutral dark backgrounds with refined purple highlights, optimized for cryptocurrency trading and quantitative analysis.

## Theme Philosophy

- **Supabase-Inspired**: Clean neutral dark backgrounds (#0f0f10) with subtle structure
- **Purple Accents**: Refined purple (hsl 265 85% 58%) for primary actions and highlights
- **Cyan Data**: Clean cyan (hsl 185 75% 50%) for charts and data visualization
- **Minimalist Elegance**: Reduced glow effects, cleaner surfaces, professional aesthetic
- **Semantic Tokens**: All colors defined via CSS variables for easy theming

---

## Color Palette

### Dark Mode Colors (HSL Format)

```css
/* Backgrounds - Neutral dark (Supabase-style) */
--background: 240 6% 6%              /* Clean dark base */
--foreground: 240 5% 96%             /* Off-white text */

/* Cards - Subtle elevation */
--card: 240 6% 9%                    /* Slightly elevated surface */
--card-foreground: 240 5% 96%        /* Off-white text */

/* Primary - Refined Purple */
--primary: 265 85% 58%               /* Clean purple primary */
--primary-foreground: 0 0% 100%      /* White text on purple */

/* Secondary - Elevated surface */
--secondary: 240 6% 12%              /* Subtle surface */
--secondary-foreground: 240 5% 96%   /* Off-white text */

/* Muted - Neutral grays */
--muted: 240 5% 16%                  /* Dark gray */
--muted-foreground: 240 5% 55%       /* Medium gray text */

/* Accent - Soft Purple */
--accent: 265 60% 65%                /* Lighter purple accent */
--accent-foreground: 0 0% 100%       /* White text */

/* Data - Clean Cyan for charts */
--data: 185 75% 50%                  /* Professional cyan */
--data-foreground: 240 6% 6%         /* Dark text on cyan */

/* Semantic states */
--destructive: 0 72% 51%             /* Error red */
--destructive-foreground: 0 0% 100%  /* White text */

--success: 142 70% 45%               /* Success green */
--success-foreground: 0 0% 100%      /* White text */

--warning: 38 92% 50%                /* Warning amber */
--warning-foreground: 240 6% 6%      /* Dark text */

/* Borders and inputs - Clean subtle */
--border: 240 5% 18%                 /* Subtle border */
--input: 240 6% 12%                  /* Input background */
--ring: 265 85% 58%                  /* Purple focus ring */
```

### Trading-Specific Colors

```css
/* Trading positions */
--trading-long: 142 70% 45%          /* Green for long */
--trading-short: 0 72% 51%           /* Red for short */

/* Simplified aliases */
--long: 142 70% 45%                  /* Green */
--short: 0 72% 51%                   /* Red */
--neutral: 240 5% 55%                /* Gray for neutral */
```

### Gradients

```css
/* Primary - Subtle purple spectrum */
--gradient-primary: linear-gradient(135deg, hsl(265 85% 58%), hsl(280 80% 55%))
--gradient-accent: linear-gradient(135deg, hsl(265 60% 65%), hsl(280 55% 62%))
--gradient-data: linear-gradient(135deg, hsl(185 75% 50%), hsl(195 70% 52%))
--gradient-card: linear-gradient(180deg, hsl(240 6% 10%), hsl(240 6% 8%))
--gradient-surface: radial-gradient(ellipse 80% 50% at 50% -20%, hsl(265 85% 58% / 0.08), transparent)
```

### Shadows

```css
/* Glow effects - Purple-centric */
--shadow-glow: 0 0 20px hsl(265 95% 62% / 0.25), 0 0 40px hsl(265 95% 62% / 0.1)
--shadow-glow-accent: 0 0 20px hsl(275 80% 72% / 0.25), 0 0 40px hsl(275 80% 72% / 0.1)
--shadow-glow-data: 0 0 20px hsl(185 90% 48% / 0.25), 0 0 40px hsl(185 90% 48% / 0.1)
--shadow-glow-success: 0 0 20px hsl(155 80% 42% / 0.25), 0 0 40px hsl(155 80% 42% / 0.1)
--shadow-glow-destructive: 0 0 20px hsl(0 78% 55% / 0.25), 0 0 40px hsl(0 78% 55% / 0.1)
```

---

## Typography

### Font Stack

```css
--font-sans: 'Inter', system-ui, -apple-system, sans-serif
--font-mono: 'JetBrains Mono', 'Fira Code', 'Menlo', monospace
```

### Installation

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap">
```

---

## Utility Classes

### Glass Effects

```css
.glass-panel {
  background: hsl(var(--card) / 0.7);
  backdrop-filter: blur(16px);
  border: 1px solid hsl(var(--border) / 0.5);
  box-shadow: 0 4px 30px hsl(var(--primary) / 0.05);
}

.glass-strong {
  background: hsl(var(--card) / 0.9);
  backdrop-filter: blur(24px);
  border: 1px solid hsl(var(--border));
  box-shadow: 0 8px 40px hsl(var(--primary) / 0.08);
}
```

### Glow Effects

```css
.shadow-glow {
  box-shadow: 0 0 25px hsl(var(--glow-primary) / 0.35),
              0 0 50px hsl(var(--glow-primary) / 0.15),
              0 0 80px hsl(var(--glow-primary) / 0.08);
}

.shadow-glow-accent {
  box-shadow: 0 0 25px hsl(var(--glow-accent) / 0.35),
              0 0 50px hsl(var(--glow-accent) / 0.15),
              0 0 80px hsl(var(--glow-accent) / 0.08);
}

.shadow-glow-data {
  box-shadow: 0 0 25px hsl(var(--glow-data) / 0.35),
              0 0 50px hsl(var(--glow-data) / 0.15),
              0 0 80px hsl(var(--glow-data) / 0.08);
}
```

### Trading-Specific Styles

```css
/* Price change animations */
.price-up {
  color: hsl(var(--success));
  text-shadow: 0 0 10px hsl(var(--success) / 0.4);
  animation: flash-green 0.3s ease-out;
}

.price-down {
  color: hsl(var(--destructive));
  text-shadow: 0 0 10px hsl(var(--destructive) / 0.4);
  animation: flash-red 0.3s ease-out;
}

/* Order types */
.order-buy {
  background: hsl(var(--success) / 0.1);
  border: 1px solid hsl(var(--success) / 0.3);
  color: hsl(var(--success));
}

.order-sell {
  background: hsl(var(--destructive) / 0.1);
  border: 1px solid hsl(var(--destructive) / 0.3);
  color: hsl(var(--destructive));
}
```

### Status Indicators

```css
.status-online {
  background: hsl(var(--success));
  box-shadow: 0 0 10px hsl(var(--success) / 0.6);
  animation: pulse-glow-green 2s ease-in-out infinite;
}

.status-offline {
  background: hsl(var(--destructive));
  box-shadow: 0 0 10px hsl(var(--destructive) / 0.5);
}
```

---

## Animations

### Keyframes

```css
@keyframes glow-pulse {
  from {
    box-shadow: 0 0 10px hsl(var(--primary) / 0.2),
                0 0 20px hsl(var(--primary) / 0.1),
                0 0 40px hsl(var(--primary) / 0.05);
  }
  to {
    box-shadow: 0 0 20px hsl(var(--primary) / 0.4),
                0 0 40px hsl(var(--primary) / 0.2),
                0 0 80px hsl(var(--primary) / 0.1);
  }
}

@keyframes flash-green {
  0% { background-color: hsl(var(--success) / 0.3); }
  100% { background-color: transparent; }
}

@keyframes flash-red {
  0% { background-color: hsl(var(--destructive) / 0.3); }
  100% { background-color: transparent; }
}
```

### Animation Classes

```css
.animate-glow { animation: glow-pulse 2s ease-in-out infinite alternate }
.animate-pulse-slow { animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite }
.animate-shimmer { animation: shimmer 2s linear infinite }
```

---

## Component Patterns

### Cards

```tsx
<Card className="glass-panel rounded-xl p-4 transition-all duration-300 hover:border-primary/40">
  <CardHeader>
    <CardTitle className="text-foreground">Trading Dashboard</CardTitle>
  </CardHeader>
  <CardContent className="text-muted-foreground">
    Live market data and positions
  </CardContent>
</Card>
```

### Buttons

```tsx
// Primary (Purple)
<Button className="bg-primary text-primary-foreground hover:bg-primary/90">
  Execute Trade
</Button>

// Success (Green)
<Button className="bg-success text-success-foreground hover:bg-success/90">
  Buy Order
</Button>

// Destructive (Red)
<Button className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
  Sell Order
</Button>
```

### Charts and Metrics

```tsx
// Data visualization
<div className="metric-card-data">
  <div className="text-data">+2.45%</div>
  <div className="text-muted-foreground">24h Change</div>
</div>

// Trading positions
<div className="order-buy">Long Position</div>
<div className="order-sell">Short Position</div>
```

---

## Current State vs Future Vision

### Current: Kraken Purple Theme ✅
- **Deep purple-black backgrounds** for institutional feel
- **Vibrant purple primary** (Kraken Pro inspired)
- **Cyan accents** for data visualization
- **High contrast** optimized for trading interfaces
- **Trading-specific colors** for buy/sell positions

### Future: BIOS Look and Feel 🎯
- **Maintain purple color scheme** (user preference)
- **Adopt BIOS component patterns** and layouts
- **Enhanced glass effects** and depth
- **Unified spacing and typography**
- **BIOS-style navigation and cards**
- **Consistent interaction patterns**

### Migration Strategy
1. **Keep Colors**: Preserve Kraken purple theme as requested
2. **Adopt BIOS Components**: Gradually migrate to BIOS component library
3. **Update Layouts**: Align with BIOS design patterns
4. **Enhance Effects**: Add BIOS-style glassmorphism and depth
5. **Unify Navigation**: Standardize with BIOS navigation patterns

---

## Quick Start

1. Copy `src/index.css` and `tailwind.config.ts` to your project
2. Install fonts (see Typography section)
3. Install Tailwind plugins: `npm install tailwindcss-animate`
4. Use semantic tokens (never raw colors)

---

## Design Principles

1. **Institutional Grade**: Deep backgrounds, high contrast for long sessions
2. **Trading Optimized**: Clear buy/sell colors, real-time data emphasis
3. **Purple Dominance**: Kraken-inspired purple as primary brand color
4. **Cyan Data**: Bright cyan for charts and quantitative displays
5. **Semantic Tokens**: All colors defined via CSS variables

---

## Brand Voice Alignment

The Kraken Purple theme reflects the AKIVA AI CRYPTO brand voice:
- **Institutional**: Deep, professional backgrounds convey seriousness
- **Sophisticated**: Vibrant purples suggest premium, advanced technology
- **Data-Driven**: Cyan accents highlight quantitative and analytical focus
- **Trading-Focused**: High contrast and clear visual hierarchy for fast decision-making
