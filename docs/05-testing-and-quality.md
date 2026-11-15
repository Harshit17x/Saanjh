# Testing and code quality

## Strategy

Tests need no network, emulator or API key. The server is built from ports, and tests inject an in-memory repository, a fake mailer, a fake clock and a scripted fake Gemini.

| Layer | Tool | What is covered |
|---|---|---|
| `shared/` | Vitest | Pure rules, exhaustively |
| `server/` | Vitest, Supertest | Routes and services against fakes |
| `web/` | Vitest, Testing Library, `vitest-axe` | Key flows and accessibility |
| Deployed app | `scripts/smoke.mjs` | Health, headers and one full flow |

## Cases

### Shared
- **Schedule:** times across timezones; doses near midnight; day-of-week filters; start and end dates; paused medications; daylight-saving transitions.
- **Adherence:** taken, skipped and missed mixes; zero doses; partial days; per-medication and overall; streaks.
- **Escalation:** each stage exactly at, just before and just after its threshold; already-sent stages; late ticks.
- **Refill:** days of supply; the warning threshold; zero and missing stock.
- **Tokens:** valid, expired, tampered, wrong purpose, reused.
- **Schemas:** every bound and every rejected shape.

### Server
- **Auth:** create, join, login, logout; wrong passcode; lockout and unlock; uniform failure responses.
- **Authorisation:** each route against each role and permission; cross-circle access refused.
- **Proposals:** non-elder change becomes a proposal; approve; reject; approval turned off.
- **Doses:** take, skip, undo; stock decrement; caretaker attribution; action by email token.
- **Tick:** correct stage per time; idempotent on repeat; mail failure then retry; rejected without a valid Scheduler token.
- **AI:** valid output; invalid output then retry; timeout then fallback; prompt-injection text in a medication name; cache hit.
- **Hardening:** oversized body; bad JSON; rate limit; cross-origin write; security headers present.

### Web
- Join and sign in; Today with take and undo; add a medication; approve a proposal; appointments; adherence; settings.
- axe on every page, in both themes.
- Text-size and language controls.

## Coverage floors (enforced in CI)

| Area | Lines |
|---|---|
| `shared/` | 90% |
| `server/` | 90% |
| `web/` | 80% |

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request:

1. Install from the lockfile.
2. Lint (type-aware).
3. Type-check.
4. Tests with coverage and floors.
5. Build web and server.
6. `npm audit` at high severity.

One command runs the same locally: `npm run check`.

## Conventions

- Small modules with one purpose; no file does HTTP and business rules together.
- No `any`; no non-null assertions; exhaustive switches on union types.
- Named constants in place of magic numbers.
- JSDoc on every exported function, saying what it does and why where the reason is not obvious.
- One error type with a code; one place that turns errors into responses.
- No dead code, no commented-out code, no unused dependencies.
- Conventional commit messages; small commits.

## Repository hygiene

- Public, single `main` branch, well under 10 MB.
- `README.md`: what it is, problem-statement mapping, features, architecture diagram, Google services, setup, tests, deployment, security, accessibility.
- `SECURITY.md`, `LICENSE`, `.env.example`, `.gitignore`, `.dockerignore`, `.gcloudignore`.
- No secrets, no build output, no `node_modules`.
