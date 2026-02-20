# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, **please do not open a public issue**.

Instead, please report it responsibly:

1. **Email**: Send details to the project maintainers (see repository contacts)
2. **Include**: Description of the vulnerability, steps to reproduce, and potential impact
3. **Response**: We aim to acknowledge reports within 48 hours

## Scope

Security issues we care about:

- **Authentication/authorization bypass** in edge functions or RLS policies
- **API key exposure** in code, logs, or error messages
- **Injection vulnerabilities** (SQL, XSS, command injection)
- **Risk control bypass** — any way to circumvent kill switch, position limits, or circuit breakers
- **Privilege escalation** — accessing admin/CIO functions without proper role

## Out of Scope

- Vulnerabilities in third-party exchange APIs
- Issues requiring physical access to infrastructure
- Social engineering attacks
- Denial of service (unless it bypasses rate limiting)

## Security Architecture

This platform implements defense-in-depth:

| Layer | Control |
|-------|---------|
| **Database** | Row-Level Security (RLS) with role-based policies |
| **Edge Functions** | JWT validation, rate limiting, input sanitization |
| **Trading** | Kill switch, circuit breakers, reduce-only mode |
| **Audit** | Full audit trail on all state changes |
| **Secrets** | Exchange keys encrypted with pgcrypto, never exposed to frontend |

## Responsible Disclosure

We follow a 90-day disclosure policy. After reporting:

1. We confirm the issue within 48 hours
2. We develop and test a fix
3. We release a patch and credit the reporter
4. After 90 days, the reporter may publicly disclose

## Secrets & API Keys

- **Never** commit real API keys to the repository
- All exchange credentials must be stored as Supabase secrets
- The `.env.example` files contain placeholder values only
- If you find a leaked key, report it immediately

Thank you for helping keep this project and its users safe.
