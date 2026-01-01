# Open Source Crypto Trading Platform

## 🌍 Mission

Build the most **trusted, transparent, and accessible** open-source crypto trading system for everyone — from curious beginners to professional quants.

**This is not a "get rich quick" scheme.** This is a learning platform, a research tool, and a responsible trading system.

## ✨ Core Philosophy

### 🛡️ Safety Before Profit
- Capital preservation is more important than returns
- System defaults to **not trading** unless conditions are favorable
- All risk controls are **on by default** and cannot be bypassed
- No hidden leverage, no surprise liquidations

### 📖 Open Source First
- Core trading engine is fully open source
- No "black box" decision-making
- Every decision is explainable and auditable
- Community can extend safely with clear boundaries

### 🎓 Education Embedded
- Every action is explainable
- Users learn **why** something happened, not just see results
- Progressive modes from Observer → Paper → Guarded → Advanced

### 🚫 No False Promises
- We never claim guaranteed profits
- We emphasize **probability, uncertainty, and risk-adjusted outcomes**
- Past performance does not guarantee future results

---

## 🏗️ Architecture

```
├── core/                    # Safety-critical, tightly reviewed
│   ├── trading-gate/        # Single source of truth for trading state
│   ├── risk-engine/         # Hard limits that cannot be bypassed
│   └── execution/           # Cost-aware order execution
│
├── agents/                  # Multi-agent decision system
│   ├── meta-decision/       # VETO power - can halt everything
│   ├── capital-allocation/  # Risk budget distribution
│   ├── risk/               # Real-time risk monitoring
│   └── execution/          # Order routing (no autonomy)
│
├── strategies/             # Community-contributed strategies
│   ├── templates/          # Example strategies with documentation
│   └── community/          # User-submitted (reviewed) strategies
│
├── extensions/             # Safe extension points
│   ├── data-providers/     # Market data integrations
│   ├── venue-adapters/     # Exchange connections
│   └── analysis-tools/     # Visualization & analytics
│
└── docs/                   # Education-first documentation
    ├── getting-started/    # Beginner-friendly guides
    ├── concepts/           # Trading fundamentals
    └── architecture/       # System design docs
```

---

## 🚀 Progressive User Modes

### 👁️ Observer Mode
*Perfect for learning how markets and strategies work*
- Read-only dashboards
- See strategies, gates, regimes, and decisions
- Learn without risking money

### 📝 Paper Trading Mode
*Build confidence before risking real money*
- Full system behavior with real market data
- Zero capital risk
- Practice strategies safely

### 🛡️ Guarded Live Mode
*Real trading with training wheels - recommended for beginners*
- Very small default risk budgets (2% per trade, 10% total exposure)
- Aggressive safety rails always active
- Trade confirmation required
- Automatic stop-losses

### ⚡ Advanced Mode
*For experienced traders who understand the risks*
- More control over parameters
- Still bounded by hard risk limits
- Core safety cannot be disabled

---

## 🔒 Non-Negotiable Safety Guarantees

These protections exist in **all modes** and **cannot be disabled**:

1. **Kill Switch** — Emergency halt for all trading
2. **Daily Loss Limit** — Automatic trading pause after threshold
3. **Execution Cost Gate** — Blocks trades where cost > expected edge
4. **Data Quality Gate** — Refuses to trade on stale/simulated data
5. **Position Limits** — Hard caps on exposure
6. **Audit Trail** — Every decision is logged and replayable

---

## 📊 "Why Did This Happen?" — Full Transparency

For every trade or non-trade, the system explains:

- **Market Regime** — Is this a favorable environment?
- **Strategy Intent** — What was the signal?
- **Risk Checks** — What passed/failed?
- **Cost Analysis** — Edge vs. execution costs
- **Final Decision** — Approved or blocked, with reasons

This transparency is our **key differentiator**.

---

## 🤝 Contributing

### Ground Rules

1. **No PR can weaken risk controls**
2. **No strategy merged without clear risk disclosures**
3. **All code must pass CI tests for safety-critical paths**

### Testing Requirements

Every contribution must verify:
- [ ] Kill switch functionality
- [ ] Reduce-only mode
- [ ] Bad data handling (graceful degradation)
- [ ] Execution cost gating

### Community Extensions

Extensions can add:
- ✅ New strategies (with documented risks)
- ✅ New market data providers
- ✅ New analysis/visualization tools
- ✅ New exchange adapters

Extensions **cannot bypass**:
- ❌ Trading Gate
- ❌ Risk Agent
- ❌ Execution Cost Checks
- ❌ Kill Switch

---

## 📜 Language Guidelines

### ✅ Use This Language
- "Risk-managed"
- "Regime-aware"
- "Educational"
- "Transparent"
- "Open-source"
- "Community-driven"
- "Capital preservation focused"

### ❌ Never Use This Language
- "Guaranteed profits"
- "Always wins"
- "Passive income"
- "Set and forget"
- "Highest probability on every trade"
- "Get rich quick"

**Trust beats hype. Always.**

---

## ⚠️ Important Disclaimers

### Risk Warning
Cryptocurrency trading involves substantial risk of loss. This software is provided for educational and research purposes. Past performance does not guarantee future results.

### Not Financial Advice
This platform and its documentation do not constitute financial advice. Always do your own research and consider consulting a licensed financial advisor.

### No Guarantees
We make no guarantees about profitability. The system is designed to help manage risk and learn about trading, not to guarantee returns.

---

## 📞 Support & Community

- **Documentation** — [docs/](./docs/)
- **Issues** — GitHub Issues
- **Discussions** — GitHub Discussions

---

## 📄 License

MIT License — Free to use, modify, and distribute.

---

## 🙏 Acknowledgments

Built with respect for:
- Traders who've lost money to black-box systems
- Beginners who deserve to learn safely
- The open-source community that makes this possible

---

*"This is the first crypto system that actually respects me."* — The goal.
