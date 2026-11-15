# Build timeline

Event day: 15 November 2026. Build ends 4:30 pm. Submission window 4:30–5:00 pm.

| Time        | Work                                                                             | Done when                                                   | Cut line if late                 |
| ----------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------- |
| 11:20–11:40 | Plan docs, scaffold, tooling, CI, repo                                           | `npm run check` passes on an empty skeleton; repo is public | —                                |
| 11:40–12:40 | `shared/` rules and server core: auth, circles, medications, doses, appointments | Server tests green against in-memory fakes                  | —                                |
| 12:40–1:05  | Google Cloud setup, first Cloud Run deploy, Firestore                            | Live URL answers `/healthz`; a circle can be created        | —                                |
| 1:05–2:15   | Web app: join and sign in, Today, medications, appointments, adherence, settings | Full flow works in the browser on the live URL              | Drop the chart, keep the numbers |
| 2:15–2:50   | Reminder engine, email templates, one-tap links, Scheduler                       | A real reminder arrives and its link works                  | Drop low-stock and digest emails |
| 2:50–3:30   | Gemini: safety check, prescription scan, visit brief, digest                     | Each works live and falls back without a key                | Keep safety check and scan only  |
| 3:30–3:55   | Accessibility pass, Hindi, read aloud, coverage to floors, README                | axe clean; floors met; README complete                      | Drop Hindi                       |
| 3:55–4:00   | Final-candidate deploy and smoke test                                            | Smoke passes                                                | —                                |
| 4:00        | **Scored submission 1**                                                          | Score and feedback received                                 | —                                |
| 4:00–4:25   | Fix the lowest-scoring criterion; redeploy; smoke test                           | Change verified                                             | —                                |
| 4:25–4:30   | **Scored submission 2, only if the fix is verified**                             | —                                                           | Stay on submission 1             |
| 4:30–5:00   | Submission form                                                                  | All four items submitted                                    | —                                |

## Order of priority if time runs short

1. Working Cloud Run link (disqualification otherwise).
2. Every line of the problem statement covered: passcode access, medication management, adherence, appointments, email reminders.
3. Tests, security and accessibility at the planned level.
4. Elder approval and one-tap email links.
5. Gemini safety check and prescription scan.
6. Digest, visit brief, Hindi, read aloud.
7. Stretch: assistant, PWA.

## Needed from the owner, and when

| By    | Item                                                  |
| ----- | ----------------------------------------------------- |
| 12:40 | Gemini API key, Gmail app password, billing confirmed |
| 4:00  | First scored submission on the platform               |
| 4:30  | LinkedIn post published                               |
| 5:00  | Submission form completed                             |

## Rules to remember

- Two scored submissions; the last one counts.
- The deployed link must work at the Top 10 check.
- The repo must be public, with no secrets.
