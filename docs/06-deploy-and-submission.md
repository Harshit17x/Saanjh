# Deploy and submission

**Target:** Cloud Run, project `radiant-moon-484323-n9`, region `asia-south1`, service `saanjh`.

Docker is not needed locally: Cloud Build builds the image from source.

## Needed from the owner

| Item                           | How                                                             |
| ------------------------------ | --------------------------------------------------------------- |
| Billing enabled on the project | Check in the Cloud console                                      |
| Gemini API key                 | Google AI Studio → Get API key                                  |
| Gmail app password             | Google account → Security → 2-Step Verification → App passwords |
| LinkedIn post                  | Published from the owner's account                              |
| Platform submissions           | Made by the owner on Hack2Skill                                 |

## Runbook

1. **Project.** Confirm billing. Enable the Cloud Run, Cloud Build, Artifact Registry, Firestore, Secret Manager and Cloud Scheduler APIs.
2. **Firestore.** Create the default database in native mode in `asia-south1`, then create the two composite indexes from `firestore.indexes.json`:
   `gcloud firestore indexes composite create --collection-group=doses --field-config=field-path=circleId,order=ascending --field-config=field-path=dueAt,order=ascending` and the same for `appointments` with `at`.
3. **Secrets.** Create `GEMINI_API_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `SESSION_SECRET` and `LINK_SECRET`. The last two are generated random values.
4. **Service accounts.**
   - `saanjh-run`: Firestore user and secret accessor only.
   - `saanjh-scheduler`: Cloud Run invoker on the service only.
5. **Deploy.** `gcloud run deploy saanjh --source . --region asia-south1 --allow-unauthenticated --min-instances 1`, running as `saanjh-run`, with the secrets mounted as environment variables.
6. **Scheduler.** Two jobs with an OIDC token from `saanjh-scheduler` and audience `<APP_URL>/api/internal`:
   - `saanjh-tick`: every 5 minutes, POST `/api/internal/tick`.
   - `saanjh-digest`: `0 18 * * 0` (Asia/Kolkata), POST `/api/internal/digest`.
7. **Verify.** Run `npm run smoke -- <live URL>`. Use **Send me a test email** on the Circle page, then add a dose due in 12 minutes and use the one-tap link in the reminder.
8. **GitHub.** Create the public repo `saanjh`, push `main`, confirm CI is green.

Deploy a walking skeleton by about 1:00 pm so the link works from then on.

## Configuration

| Variable                           | Purpose                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `GEMINI_API_KEY`                   | Gemini access                                                              |
| `GEMINI_MODEL`                     | Model id (default in code)                                                 |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Email sending                                                              |
| `SESSION_SECRET`, `LINK_SECRET`    | Signing sessions and email links                                           |
| `APP_URL`                          | Public URL used in emails                                                  |
| `SCHEDULER_SA`                     | Service account allowed to call the internal endpoints                     |
| `DATA_BACKEND`                     | `firestore` in production, `memory` locally                                |
| `NODE_ENV`                         | `production` on Cloud Run (enables Secure cookies, HSTS, required secrets) |
| `GOOGLE_CLOUD_PROJECT`             | Firestore project (set by Cloud Run)                                       |

## Before each scored submission

- [ ] `npm run check` passes.
- [ ] CI is green on `main`.
- [ ] Smoke script passes on the live URL.
- [ ] The live app works in a private browser window on a phone-sized screen.
- [ ] No secrets in the repo or its history.
- [ ] README is current.

Only two scored submissions are allowed and **the last one counts**. Make the second only when the change is verified to be an improvement.

## Submission form (4:30–5:00 pm)

- [ ] GitHub repository link (public).
- [ ] Deployed Cloud Run link.
- [ ] Short description.
- [ ] LinkedIn post link.

### Short description (draft)

> Saanjh is a shared care platform for elderly people, their families and caretakers. Each elder has a Care Circle protected by passcodes, where authorised members manage medications and appointments and track adherence. Saanjh emails reminders before each dose, lets the elder confirm with one tap from the email, and tells family only when a dose is still unconfirmed. Changes made by others wait for the elder's approval, so the elder stays in charge. Gemini reads prescriptions into draft schedules, flags possible interactions as questions for the doctor, and writes a weekly summary in English or Hindi. Built with TypeScript, React and Express on Cloud Run, with Firestore, Cloud Scheduler, Secret Manager and the Gemini API.

### LinkedIn post (draft; adapt to the organisers' template and add the official MnM tags)

> I built **Saanjh** today at PromptWars x Catalyst.
>
> **The problem:** elderly people juggle several medicines and appointments, and their families worry from a distance. Most apps either nag the elder or hand control to someone else.
>
> **What I built:** a shared Care Circle for an elder, their family and caretakers.
>
> - Passcode access for each member, with permissions set by the elder
> - Medication schedules, adherence tracking and doctor appointments
> - Email reminders with one-tap "I took it"
> - Family is told only if a dose stays unconfirmed
> - Changes by others wait for the elder's approval
> - Gemini reads prescriptions, flags possible interactions and writes a weekly summary in English or Hindi
>
> **Tech:** TypeScript, React, Express, Cloud Run, Firestore, Cloud Scheduler, Secret Manager, Gemini API.
>
> **What makes it different:** the elder stays at the centre. Saanjh informs the family without taking decisions away from the person whose health it is.
>
> Repo: <link> · Live: <link>
>
> Thanks to Google for Developers, Hack2Skill and MnM.

## After judging

Set `--min-instances 0` and pause the Scheduler job to stop costs.
