# Reminders and AI

## Reminder engine

Cloud Scheduler calls `POST /api/internal/tick` every 5 minutes with an OIDC token. The server verifies the token's audience and service account before doing anything.

### What a tick does

1. **Top up.** For circles whose doses are not materialised through tomorrow, create the missing dose documents.
2. **Load.** Pending doses with `dueAt` from 2 hours ago to 15 minutes ahead; appointments in the next 24 hours.
3. **Decide.** For each item, the pure function `escalation.decide(item, now, alreadySent)` returns the notifications that are due.
4. **Claim.** Create a `notifications` document whose id is `subjectId_kind`. If it already exists, skip: someone has sent it.
5. **Send** through the `Mailer` port. On failure, delete the claim so the next tick retries, and log the error.

Claims are per recipient (`dose_<id>_<stage>_<memberId>`), so a partial failure never re-sends to someone who already received the email. Demo circles are skipped.

### Escalation table

| Stage | When | To |
|---|---|---|
| Upcoming | 10 minutes before the dose | Elder |
| Nudge | 20 minutes after, still pending | Elder |
| Missed | 60 minutes after, still pending; status becomes `missed` | Family and caretakers with notifications on |
| Appointment | 24 hours and 2 hours before | Whole circle |
| Low stock | Under 5 days of supply, once per medication | Whole circle |
| Weekly digest | Separate weekly Scheduler job (`/internal/digest`, Sunday 18:00 IST) | Whole circle |

All thresholds are named constants in `shared/escalation.ts`.

### Properties

- **Idempotent.** Overlapping or retried ticks cannot double-send, because the claim is a create that fails if the document exists.
- **Catch-up safe.** If Scheduler is late, the 2-hour look-back still picks up the dose and sends the right stage.
- **Timezone-correct.** Due times are computed from local wall-clock times and the circle's timezone.
- **Testable.** `decide` is pure; the tick service takes a fake clock, an in-memory repository and a fake mailer.

### Email content

- Plain, large-type HTML with a text alternative.
- Only the medication name, dose and time. No medical history.
- Two buttons: **I took it** and **Skip**, each a signed link valid for 12 hours and usable once.
- A link to the app and a line on how to change notification settings.

## Gemini design

### Rules for every call

1. **Numbers and decisions come from code, never the model.** The model reads, drafts and explains.
2. **Structured output.** Each call supplies a JSON schema; the server validates the result again with Zod. One retry on invalid output, then a deterministic fallback.
3. **Untrusted text is fenced.** User-entered names and notes are wrapped in delimiters and described as data in the system instruction. Instructions inside them are ignored.
4. **A human confirms** anything that would change a schedule.
5. **Graceful failure.** An 12-second timeout. If Gemini is unavailable the feature still returns something useful and says so.
6. **Cost control.** Cached safety checks, downscaled images, token usage logged per call.
7. **Not medical advice.** Every AI surface says to confirm with a doctor or pharmacist.

### Features

| Feature | Input | Output | Fallback |
|---|---|---|---|
| Prescription scan | Image, at most 1 MB after downscale | `medications[]: { name, dose, form, times[], withFood, confidence }` | Manual entry form with a note |
| Safety check | Medication list | `cautions[]: { severity, medsInvolved[], explanation, questionForDoctor }` | Rule-based duplicate and timing checks |
| Weekly digest | Statistics computed by code | `{ headline, summary, encouragement }` in the circle's language | Template sentence built from the numbers |
| Visit brief | Medications, adherence, appointment | `{ overview, concerns[], questions[] }` | Table of medications and adherence only |

### Prompt structure

Each prompt has four parts, kept in `server/adapters/gemini/prompts.ts`:
- **System instruction:** role, limits (no diagnosis, no dosing changes), tone (plain, kind, short), language.
- **Task:** what to produce.
- **Data:** fenced, labelled untrusted.
- **Output schema.**

### Why GenAI here

| Step | Why a model, not rules |
|---|---|
| Reading a prescription | Handwriting, abbreviations and layouts vary without limit |
| Interaction review | Needs broad pharmacological knowledge across arbitrary combinations |
| Digest and brief | Turning numbers into language a worried family member reads easily, in two languages |

Scheduling, adherence, escalation and stock are arithmetic and stay in code.
