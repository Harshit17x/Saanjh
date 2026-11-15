# Saanjh · सांझ

**Shared care for the golden hours.**

Saanjh means *dusk* in Hindi, the golden hours of life. It also echoes *saanjha*, "shared". Saanjh is a care platform where an elderly person, their family and their caretakers share one healthcare profile: medications, adherence and doctor appointments. **The elder stays in charge.**

> Built solo for **PromptWars × Catalyst** (Google for Developers · Hack2Skill · MnM), 15 November 2026.
> Challenge: *Elderly Care & Medication Management Platform*.

**Try it:** open the deployed app and press **Try a demo circle**. You will be signed in as Kamla Devi, the elder, with two weeks of history. Use the banner at the top to see the same circle as Priya (family) or Ravi (caretaker).

---

## How Saanjh answers the problem statement

| The challenge asks for | Saanjh |
|---|---|
| Shared ecosystem for elder, caretakers and family | A **Care Circle** per elder. Members join with the circle code and choose a role. |
| Secure, passcode-based access | Each member has their **own 6-digit passcode**, hashed with scrypt, locked after 5 wrong tries. Sessions use HttpOnly, SameSite=Strict cookies. |
| View, add, edit, manage medication schedules | Times of day, days of week, start and end dates, with-food notes, stock count. Pause, restart, stop. |
| Track adherence | Every dose is taken, skipped or missed. 7- and 30-day adherence overall and per medicine, day streaks, a chart with a table alternative. |
| Monitor upcoming doctor appointments | Appointments with **Add to Google Calendar** and **Google Maps** links, plus reminders 24 h and 2 h ahead. |
| Proactive email reminders for missed meds, upcoming doses and appointments | Cloud Scheduler runs the reminder engine every 5 minutes. **Upcoming** goes to the elder, a **nudge** follows 20 minutes after the dose, and **missed** goes to family and caretakers at 60 minutes. |
| Beyond a basic reminder app | See below. |
| Elder at the centre of their own decisions | Changes by others are **proposals the elder approves**. The elder sets each member's access. Family is told only when a dose stays unconfirmed. |

## What makes it different

- **The elder approves changes.** When family or a caretaker adds, edits, pauses or stops a medicine, it waits on the elder's Today screen until they approve or decline it.
- **One tap from the email.** Reminder emails carry signed, single-use **I took it** and **Skip** links. The elder needs no password and no app.
- **Escalation with dignity.** The elder is reminded first. Family hears only if a dose is still unconfirmed an hour later.
- **Prescription scan (Gemini vision).** Photograph a prescription and Gemini drafts the medicines, reading shorthand like *BD*, *TDS* and *1-0-1*, for a person to check before saving.
- **Safety check (Gemini).** Gemini reviews the whole list for possible interactions, duplicates and timing issues. It phrases each one as a question to ask the doctor, never a diagnosis.
- **Weekly note and visit brief (Gemini).** Gemini writes a short, kind weekly summary in English or Hindi, and a printable one-page brief before each appointment. **Every number comes from tested code. The model only writes the words.**
- **Refill warnings.** Stock counts down with each dose taken, and a warning appears when less than 5 days remain.
- **Designed for older eyes.** Atkinson Hyperlegible type at an 18 px base, three text sizes, high contrast in light and dark, 56 px touch targets, an on-screen passcode keypad, Hindi, and **Read my day** aloud.
- **The sky arc.** The Today screen draws the day as the sun's path from dawn to dusk, with each dose on it. The sky's colour follows the real time of day.

## Architecture

```
Browser: React 19 + Vite (TypeScript)
   │  same-origin fetch, HttpOnly session cookie
   ▼
Cloud Run: one Express 5 service (API + static web app)
   ├─ routes      HTTP only: Zod validation, authorisation, responses
   ├─ services    circles · medications · doses · appointments · reminders · ai · demo
   ├─ ports       Repository · Mailer · AiClient · Clock · TriggerVerifier
   └─ adapters    Firestore · Gmail SMTP · Gemini · in-memory (tests and local)
        ▲                                  ▲
Cloud Scheduler ── OIDC ──► /api/internal/tick (every 5 min), /api/internal/digest (weekly)
Secret Manager ──► Gemini key, Gmail app password, session and link-signing secrets

shared/  pure, tested rules used by both sides: time zones, schedules,
         adherence, escalation, refill, input schemas
```

- **Rules are pure functions** in `shared/`, so they are fast to test exhaustively and the browser and server agree.
- **Adapters sit behind ports.** The whole API runs in tests with in-memory fakes: no network, emulator or API key.
- **Idempotent reminders.** Each email is claimed with a Firestore `create()` before sending and released if sending fails. Overlapping or retried runs never double-send.
- **Doses are materialised** a few days ahead with deterministic ids, and range queries keep each reminder run proportional to doses due now, not to the number of users.

More detail is in [`docs/`](docs/00-overview.md).

## Google services used

| Service | Role |
|---|---|
| **Cloud Run** | Hosts the single container: health check, graceful shutdown, non-root user |
| **Cloud Build** | Builds the image from source on deploy |
| **Firestore** | All application data, with composite indexes in `firestore.indexes.json` |
| **Gemini API** (`@google/genai`) | Prescription scan (vision), safety check, weekly note, visit brief. Structured JSON output with schemas, low thinking, a 12 s timeout and model fallback |
| **Cloud Scheduler** | Calls the reminder engine every 5 minutes and the digest weekly, authenticated with OIDC |
| **Secret Manager** | Every secret, mounted as environment variables |
| **Cloud Logging** | Structured JSON logs with severity and request ids |
| **Gmail** | Sends reminder emails over SMTP with an app password |
| **Google Calendar and Maps** | Deep links from every appointment |

## Security

- Passcodes: scrypt (N=2¹⁵) with a per-member salt, constant-time comparison, and a 15-minute lockout after 5 failures.
- Sessions: HS256 JWT in an `HttpOnly; Secure; SameSite=Strict` cookie, 12-hour life. The member is reloaded on every request, so access changes apply at once.
- Authorisation on every route by role and permission. The circle id comes only from the session.
- Zod validation on every input, a 16 KB JSON limit (1.5 MB for the scan route only), and per-IP rate limits that are tighter on auth and AI.
- Strict CSP with no inline script or style, HSTS, `nosniff`, frame denial, Referrer-Policy, Permissions-Policy, and a same-origin check on writes.
- Email links are HMAC-signed, tied to one dose, one member and one action, expire in 12 hours and work once. The token travels in the URL fragment, so it never reaches server logs.
- The internal endpoints accept only a verified Cloud Scheduler OIDC token.
- AI: user text is fenced and labelled untrusted, output is schema-validated twice, and the model can never write data.
- Generic error messages with request ids. Logs never contain passcodes, tokens or health details.

See [SECURITY.md](SECURITY.md).

## Accessibility

WCAG 2.2 AA throughout, with the elder's Today view going further: semantic landmarks, a skip link, one `h1` per page that receives focus on navigation, labelled inputs with errors tied to fields, `aria-live` announcements, status shown by icon and word (never colour alone), charts with data tables, `prefers-reduced-motion` and `prefers-color-scheme` support, `lang` that follows the language choice, and axe checks in the test suite.

## Running locally

Requires Node 22+.

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npm run dev
```

Open http://localhost:5173 and press **Try a demo circle**. Without a Gemini key the AI features use their rule-based fallbacks. Without Gmail credentials, emails are logged instead of sent.

| Command | What it does |
|---|---|
| `npm run check` | Lint, type-check, tests with coverage floors, and build: the same as CI |
| `npm test` | Run the tests |
| `npm run build && npm start` | Production build served on port 8080 |
| `npm run smoke -- <url>` | End-to-end smoke test against a running server |

## Testing

Vitest, Testing Library, Supertest and axe-core. Tests cover the domain rules (time zones, DST, schedules, escalation boundaries, adherence), every API route against every role, the proposal flow, idempotent reminders with mail failures, one-tap links, the AI service with a scripted fake model (bad output, timeouts, prompt-injection text), security headers and limits, and every page of the UI. CI enforces coverage floors of 90% on `shared/` and `server/` and 80% on `web/`.

## Deploying to Cloud Run

See [docs/06-deploy-and-submission.md](docs/06-deploy-and-submission.md). In short:

```bash
gcloud run deploy saanjh --source . --region asia-south1 --allow-unauthenticated \
  --set-env-vars NODE_ENV=production,DATA_BACKEND=firestore,APP_URL=https://<service-url> \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest,GMAIL_USER=GMAIL_USER:latest,GMAIL_APP_PASSWORD=GMAIL_APP_PASSWORD:latest,SESSION_SECRET=SESSION_SECRET:latest,LINK_SECRET=LINK_SECRET:latest
```

## Project structure

```
shared/     domain rules and types (no I/O)
server/     Express app, services, ports, adapters, security
web/        React client (pages, components, i18n in English and Hindi)
tests/      shared/, server/ and web/ test suites
docs/       product, architecture, reminders and AI, security, testing, deploy
scripts/    smoke test
```

## Licence

MIT. Saanjh offers reminders and information only. It is not medical advice.
