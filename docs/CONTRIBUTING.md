# Contributing

Welcome! We're excited you want to contribute to the most trusted open-source crypto trading platform.

## Before You Start

Please read these documents:
- [CODE_OF_ETHICS.md](../CODE_OF_ETHICS.md) — Our ethical principles
- [ARCHITECTURE.md](./ARCHITECTURE.md) — How the system works
- [WHY_WE_DONT_ALWAYS_TRADE.md](./WHY_WE_DONT_ALWAYS_TRADE.md) — Our philosophy

## Core Principles for Contributors

### 1. Safety First

Every contribution must consider:
- **Can this weaken risk controls?** If yes, it will be rejected.
- **Can this cause unexpected losses?** If possible, add safeguards.
- **Is this transparent?** Users should understand what's happening.

### 2. No Black Boxes

All trading logic must be:
- Explainable to a non-technical user
- Auditable by the community
- Logged with decision traces

### 3. Test Everything

Required for all PRs:
```bash
# Run tests
pytest backend/tests/

# Check safety tests specifically
pytest backend/tests/test_risk_engine.py
pytest backend/tests/test_trading_gate.py
```

## Types of Contributions

### 🟢 Encouraged

- **Bug fixes** — Especially safety-related
- **Documentation** — Improve clarity and education
- **Test coverage** — More tests = more trust
- **Analytics/Visualization** — Help users understand
- **Strategy templates** — Educational, well-documented strategies
- **Accessibility** — Make the platform usable by everyone
- **Localization** — Translations for global access

### 🟡 Requires Discussion

- **New strategies** — Must include risk disclosure
- **New venues** — Must follow adapter pattern
- **Performance optimizations** — Must not weaken safety
- **UI changes** — Must follow design system

### 🔴 Not Accepted

- **Weakening risk controls** — Never
- **Bypassing gates** — Never
- **Hidden leverage** — Never
- **Fake backtests** — Never
- **Gambling UX** — Never

## Contribution Workflow

### 1. Open an Issue First

Before coding, discuss your idea:
```markdown
## What problem are you solving?
[Description]

## Proposed solution
[Approach]

## Safety impact
[How this affects risk controls]

## Education value
[How this helps users learn]
```

### 2. Fork and Branch

```bash
git clone https://github.com/YOUR_USERNAME/crypto-ops-dashboard.git
cd crypto-ops-dashboard
git checkout -b feature/your-feature-name
```

### 3. Make Changes

Follow these guidelines:
- Use TypeScript for frontend
- Use Python for backend
- Follow existing code style
- Add tests for new functionality
- Update documentation

### 4. Test Thoroughly

```bash
# Frontend
npm run lint
npm run type-check
npm run test

# Backend
cd backend
pytest
```

### 5. Write a Good PR Description

```markdown
## Summary
[What does this PR do?]

## Changes
- [Change 1]
- [Change 2]

## Safety Checklist
- [ ] Does not weaken risk controls
- [ ] Does not bypass any gates
- [ ] Includes decision trace logging
- [ ] Has appropriate test coverage

## Screenshots (if UI)
[Add screenshots]

## Risk Disclosure (if strategy)
- Maximum drawdown: X%
- Failure conditions: [list]
- Regimes where it works/fails: [list]
```

## Code Style

### TypeScript (Frontend)

```typescript
// Use semantic tokens, not raw colors
// ✅ Good
<div className="bg-primary text-primary-foreground">

// ❌ Bad
<div className="bg-blue-500 text-white">

// Use descriptive function names
// ✅ Good
function calculateExecutionCost(edge: number, spread: number): number

// ❌ Bad
function calc(e: number, s: number): number
```

### Python (Backend)

```python
# Use type hints
# ✅ Good
def execute_intent(intent: TradeIntent, venue_id: str) -> ExecutionResult:

# ❌ Bad
def execute_intent(intent, venue_id):

# Document complex logic
# ✅ Good
def validate_trade(self, intent: TradeIntent) -> ValidationResult:
    """
    Validates a trade intent against all risk limits.
    
    Checks:
    1. Kill switch status
    2. Position limits
    3. Exposure limits
    4. Daily loss limits
    
    Returns:
        ValidationResult with approval status and reasons
    """
```

## Adding a Strategy

Strategies are educational modules. They must:

1. **Declare assumptions clearly**
```python
class TrendFollowing(BaseStrategy):
    """
    Trend Following Strategy
    
    ASSUMPTIONS:
    - Works best in trending markets
    - Struggles in sideways/choppy conditions
    - Requires minimum 4h timeframe
    
    RISK PROFILE:
    - Maximum drawdown: 15%
    - Win rate: ~35%
    - Risk/reward: 1:2.5
    
    FAILURE CONDITIONS:
    - High volatility regimes
    - Low liquidity environments
    - Correlation > 0.8 with existing positions
    """
```

2. **Include backtests with caveats**
```markdown
## Backtest Results

**Period:** 2020-2024
**Instruments:** BTC, ETH

**Results:**
- Sharpe: 1.2
- Max DD: 12%
- Win Rate: 38%

**IMPORTANT CAVEATS:**
- Past performance does not guarantee future results
- Backtest does not include slippage/execution costs
- Results may vary significantly in live trading
```

3. **Never bypass risk controls**

## Adding Documentation

Good documentation:
- Explains the "why," not just the "what"
- Includes examples
- Is accessible to beginners
- Links to related concepts

## Review Process

1. **Automated checks** — CI runs tests and linting
2. **Safety review** — Core team reviews risk impact
3. **Community feedback** — 48 hours for comments
4. **Merge** — Squash and merge with clear commit message

## Recognition

Contributors are recognized in:
- CONTRIBUTORS.md
- Release notes
- Project documentation

We believe in giving credit where it's due.

## Questions?

- Open an issue with the `question` label
- Join our Discord community
- Read existing issues for context

---

*Thank you for contributing to a safer, more transparent crypto ecosystem.*
