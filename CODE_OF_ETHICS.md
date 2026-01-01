# Code of Ethics

## Purpose

This document establishes the ethical principles and guidelines for this open-source crypto trading platform. All contributors, users, and community members are expected to uphold these standards.

## Core Principles

### 1. Honesty & Transparency

**We commit to:**
- Never making false claims about profitability
- Clearly communicating risks and uncertainties
- Providing full transparency into how decisions are made
- Never hiding losses, failures, or limitations

**We reject:**
- Marketing language that implies guaranteed returns
- "Get rich quick" narratives
- Hidden fees, costs, or risks
- Obfuscated decision-making

### 2. User Protection First

**We commit to:**
- Defaulting to the safest possible configuration
- Making safety features impossible to fully disable
- Preventing catastrophic losses through hard limits
- Educating users before enabling risky features

**We reject:**
- Designs that encourage excessive risk-taking
- Features that could lead to unexpected liquidations
- Complexity that obscures real risks
- Gamification that promotes addictive behavior

### 3. Inclusive Access

**We commit to:**
- Making the platform accessible to beginners
- Providing educational resources at every level
- Designing progressive learning paths
- Supporting users in all economic situations

**We reject:**
- Gatekeeping based on wealth or experience
- Elitist language or documentation
- Features only accessible to "whales"
- Discrimination of any kind

### 4. Open Source Integrity

**We commit to:**
- Keeping core safety systems open and auditable
- Accepting community scrutiny and feedback
- Crediting contributors fairly
- Maintaining backward compatibility responsibly

**We reject:**
- "Security through obscurity"
- Closed-source risk controls
- Ignoring community security concerns
- Taking credit for community contributions

### 5. Responsible Innovation

**We commit to:**
- Testing new features extensively before release
- Providing paper trading before live trading
- Rolling out risky features gradually
- Learning from failures publicly

**We reject:**
- Rushing untested code to production
- Hiding bugs or vulnerabilities
- Ignoring edge cases in trading logic
- Prioritizing features over safety

## Specific Guidelines

### For Contributors

1. **Risk Impact Assessment** — Every PR affecting trading logic must include a risk impact statement
2. **Safety Tests Required** — Changes to risk controls require comprehensive test coverage
3. **No Weakening Safety** — PRs that reduce safety protections will be rejected
4. **Clear Documentation** — All trading-related code must be documented for non-experts

### For Strategy Authors

1. **Honest Performance Claims** — Use realistic, audited backtests with clear caveats
2. **Risk Disclosure** — Clearly state maximum drawdown, volatility, and failure modes
3. **Regime Transparency** — Document when strategies work and when they don't
4. **No Overfitting** — Acknowledge limitations of historical testing

### For Community Members

1. **Responsible Sharing** — Don't share unrealistic expectations with newcomers
2. **Support Safely** — Encourage paper trading before live trading
3. **Report Issues** — Report bugs, especially safety-related ones
4. **Respect Privacy** — Don't share others' trading results without permission

## Enforcement

### Violations

Violations of this code may result in:
- Removal of contributed code
- Revocation of contributor access
- Public disclosure of the violation
- Removal from community spaces

### Reporting

To report violations:
- Open a private issue with the `ethics` label
- Email the maintainers directly
- Use the community reporting channels

### Review Process

All ethics reports will be:
1. Reviewed within 7 days
2. Investigated thoroughly
3. Resolved with transparency (when appropriate)
4. Used to improve guidelines

## Commitment

By contributing to or using this platform, you agree to:

1. Prioritize user safety over profit
2. Be honest about risks and limitations
3. Support the learning of newcomers
4. Respect the open-source community
5. Report safety issues responsibly

---

*This code is a living document. Suggest improvements via pull requests.*

---

**Remember:** We're building a tool that helps people learn and make informed decisions — not a machine that extracts money from users. If we ever forget this, we've failed.
