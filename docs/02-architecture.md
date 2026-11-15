# Architecture

One Cloud Run service serves both the API and the built web app.

```
Browser (React + Vite, TypeScript)
   │  fetch /api/*  (same origin, HttpOnly session cookie)
   ▼
Cloud Run: Express server
   ├─ routes      HTTP only: parse, validate (Zod), authorise, respond
   ├─ services    use cases: circles, meds, doses, appointments, reminders, ai
   ├─ ports       interfaces: Repository, Mailer, AiClient, Clock
   └─ adapters    Firestore · Gmail SMTP · Gemini · system clock
   ▲                         ▲
   │ POST /api/internal/tick │ secrets
Cloud Scheduler (every 5 min, OIDC)   Secret Manager

shared/  pure domain logic used by server and web: schedule maths,
         adherence, escalation rules, Zod schemas, email-link tokens
```

## Why this shape

- **Rules are pure functions in `shared/`.** No I/O, so they are fast to test exhaustively and reused by both sides.
- **Adapters sit behind ports.** Tests run with in-memory fakes: no emulator, no network, no API key.
- **One service, one deploy.** Same origin for API and web removes CORS and simplifies the security policy.
- **Dependencies point inward.** Routes know services; services know ports; nothing in `shared/` knows about Express, Firestore or Gemini.

## Stack

| Area | Choice |
|---|---|
| Language | TypeScript, `strict` and `noUncheckedIndexedAccess` |
| Web | React 19, Vite, React Router, plain CSS with design tokens |
| Server | Node 22, Express 5, Zod, Helmet, `jose`, `nodemailer` |
| Data | `@google-cloud/firestore` |
| AI | `@google/genai` |
| Tooling | Vitest, Testing Library, `vitest-axe`, Supertest, type-aware ESLint, Prettier, GitHub Actions, Dependabot |

## Google services

| Service | Use |
|---|---|
| Cloud Run | Hosts the container; health check; minimum 1 instance during judging |
| Cloud Build | Builds the image from source on deploy |
| Firestore (native mode) | All application data |
| Gemini API | Prescription scan, safety check, weekly digest, visit brief |
| Cloud Scheduler | Triggers the reminder tick every 5 minutes |
| Secret Manager | Gemini key, Gmail app password, session and link-signing secrets |
| Cloud Logging | Structured JSON logs with request ids |
| Gmail SMTP | Sends reminder emails |
| Google Calendar and Maps | Deep links from appointments |

Gemini model: `gemini-3.1-flash-lite` by default with `gemini-flash-lite-latest` as fallback, both configurable.

## Repo layout

```
saanjh/
├─ shared/          schedule.ts adherence.ts escalation.ts refill.ts
│                   tokens.ts schemas.ts types.ts i18n/
├─ server/
│  ├─ app.ts        builds the Express app from injected ports
│  ├─ index.ts      entry: wires real adapters, graceful shutdown
│  ├─ routes/       auth circles medications doses appointments ai internal
│  ├─ services/     one file per use-case area
│  ├─ ports/        repository.ts mailer.ts ai.ts clock.ts
│  ├─ adapters/     firestore/ gmail/ gemini/ memory/
│  ├─ middleware/   session rateLimit sameOrigin errors requestId
│  └─ email/        templates (HTML and text)
├─ web/src/         pages/ components/ hooks/ api/ styles/ i18n/
├─ tests/           shared/ server/ web/
├─ scripts/         smoke.mjs seed-demo.mjs
├─ docs/
├─ .github/         workflows/ci.yml dependabot.yml
├─ Dockerfile  .dockerignore  .gcloudignore  .env.example
└─ README.md  SECURITY.md  LICENSE
```

## Data model (Firestore)

```
circles/{circleId}
  code, elderName, timezone, language, requireElderApproval, createdAt
  members/{memberId}      name, role, email, passcodeHash, permission,
                          failedAttempts, lockedUntil, notify
  medications/{medId}     name, dose, form, times[], daysOfWeek[], withFood,
                          startDate, endDate, stock,
                          status (active | paused | proposed), proposedBy, updatedAt
  appointments/{apptId}   doctor, speciality, place, at, notes
  activity/{id}           actorId, action, target, at

doses/{medId_yyyymmdd_hhmm}
  circleId, medId, dueAt, status (pending | taken | skipped | missed),
  actedBy, actedAt, via (app | email | caretaker)

appointments/{apptId}              top-level, with circleId, so reminders query across circles
claims/{key}                       created before each email (and each used link); makes sends idempotent
cache/{key}                        safety-check results keyed by a hash of the med list
```

The medication, member and activity collections live under `circles/{id}`. Doses, appointments, claims and cache are top-level.

Design notes:
- **Doses are materialised** for today and tomorrow when a medication is created or edited, and topped up by the tick. Deterministic ids make this safe to repeat.
- **`doses` and `appointments` are top-level** so the reminder run is a single range query on `dueAt` / `at` (automatic single-field indexes). The per-circle screens use two composite indexes, `(circleId, dueAt)` and `(circleId, at)`, defined in `firestore.indexes.json`.
- **Time:** instants are stored in UTC. Schedules are stored as local wall-clock times plus the circle's timezone.
- **Circle lookup by code** uses an equality query on `code`.

## API

All routes are under `/api`, exchange JSON, are validated with Zod, and need a session cookie unless marked public.

| Method and path | Purpose |
|---|---|
| `POST /circles` (public) | Create a circle and its elder member |
| `POST /auth/join` (public) | Join a circle with its code and a new passcode |
| `POST /auth/login` (public) | Circle code, member and passcode → session |
| `POST /auth/logout` · `GET /me` | Session |
| `GET /circle` · `PATCH /circle` | Circle and settings (settings: elder only) |
| `PATCH /circle/members/:id` · `DELETE /circle/members/:id` | Permissions and removal (elder only) |
| `GET /medications` · `POST /medications` | List; add (a proposal when approval applies) |
| `PATCH /medications/:id` · `DELETE /medications/:id` | Edit, pause, delete |
| `POST /medications/:id/approve` · `POST /medications/:id/reject` | Elder decision on a proposal |
| `GET /today` | Today's doses and next appointment |
| `POST /doses/:id/take` · `POST /doses/:id/skip` · `POST /doses/:id/undo` | Dose actions |
| `GET /adherence?days=7|30` | Computed statistics |
| `GET /appointments` · `POST` · `PATCH /:id` · `DELETE /:id` | Appointments |
| `GET /activity` | Audit trail |
| `POST /ai/scan-prescription` | Image → draft medications |
| `POST /ai/safety-check` | Current list → cautions |
| `GET /ai/visit-brief/:apptId` | Doctor-visit brief |
| `GET /act/:token` (public, signed) | One-tap take or skip from an email |
| `POST /internal/tick` (Scheduler only) | Run the reminder engine |
| `POST /internal/digest` (Scheduler only) | Email the weekly note to every circle |
| `POST /demo` (public) | Create a populated demo circle and sign in as its elder |
| `POST /demo/switch/:id` | In a demo circle only, view as another member |
| `POST /me/test-email` | Send the signed-in member a test reminder |
| `GET /healthz` (public) | Health check |

Errors use one shape: `{ error: { code, message, requestId } }`.

## Efficiency

- Tick cost is bounded by doses due in a 135-minute window, not by total users.
- Dose and notification writes are idempotent by id; no read-before-write.
- Safety-check results are cached by a hash of the medication list.
- Images are downscaled in the browser before upload.
- Web bundle: route-level code splitting, no UI kit, hashed assets with long cache lifetimes, compression on.
- Firestore reads are scoped to one circle per request; lists are limited and ordered.
