# Saanjh — overview

*Saanjh (सांझ): dusk, the golden hours. It also echoes "saanjha": shared.*

**Tagline:** Shared care for the golden hours.

Saanjh is a care platform where an elderly person, their family and their caretakers share one healthcare profile: medications, adherence and doctor appointments. The elder stays in charge of it.

## The challenge

PromptWars x Catalyst (Google for Developers, Hack2Skill, MnM). Solo, 15 November 2026.

**Problem statement: Elderly Care & Medication Management Platform.** The platform must:

1. Help elderly people manage daily medications, appointments and routines.
2. Give elder, caretakers and family a shared profile through **secure passcode-based access**.
3. Let authorised members **view, add, edit and manage medication schedules**, **track adherence** and **monitor upcoming appointments**.
4. **Proactively send email reminders** for missed medications, upcoming doses and appointments.
5. Go **beyond a basic reminder app**, and keep the **elder at the centre of their own healthcare decisions**.

## How it is judged

| Stage | What happens | What matters |
|---|---|---|
| Round 1 | Automated AI review of the GitHub repo; live leaderboard | Code Quality, Security, Efficiency, Testing, Accessibility, Problem Statement Alignment, effective use of Google services |
| Top 10 gate | Deployed link is checked | The Cloud Run link must be working, or the entry is disqualified |
| Round 2 | Jury reviews the live project (no pitch) | Idea uniqueness, relevance, UI, repo structure, code quality, scalability |

Rules that shape the build:
- At most **2 scored submissions**. **The last one counts, not the best one.**
- One retry is allowed only for a technical failure of the submission itself.
- Required at submission (4:30–5:00 pm): public GitHub repo link, deployed project link, short description, LinkedIn post link.

## Goals

- Score in the high 90s on the automated review.
- A live app that a jury member can understand and use in under a minute.
- Every line of the problem statement visibly covered by a working feature.
- Generative AI that does real work (reading, checking, explaining), with every number and decision coming from tested code.

## Non-goals

- Native mobile apps, SMS or WhatsApp reminders, payment, pharmacy ordering.
- Third-party sign-in. Access is by circle code and passcode, as the statement asks.
- Medical advice. AI output is always framed as questions to raise with a doctor.

## Document map

| File | Content |
|---|---|
| [01-product.md](01-product.md) | Roles, features, user flows |
| [02-architecture.md](02-architecture.md) | Layers, stack, Google services, data model, API |
| [03-reminders-and-ai.md](03-reminders-and-ai.md) | Reminder engine and Gemini design |
| [04-security-and-accessibility.md](04-security-and-accessibility.md) | Security and accessibility checklists |
| [05-testing-and-quality.md](05-testing-and-quality.md) | Test strategy, CI, conventions |
| [06-deploy-and-submission.md](06-deploy-and-submission.md) | Deploy runbook and submission checklist |
| [07-build-timeline.md](07-build-timeline.md) | Time-boxed schedule with cut lines |

## Research behind the plan

- A past PromptWars first-prize repo scored 97.27/100 on the automated review (Security, Efficiency, Accessibility and Alignment at 100; Testing 98; Code Quality 89). Its shape: strict TypeScript, pure tested domain logic, a scripted fake Gemini in tests, 93% coverage with floors enforced in CI, strict CSP, axe checks, and numbers that never come from the model. Source: [EcoPilot](https://github.com/chinmaymeshram1-wq/promptwar).
- Manual review penalises static or hard-coded behaviour and decorative use of GenAI. Source: [scoring explainer summary](https://youtubesummary.com/summary/9-forxKsm0E).
- Past challenge rules mention a repo under 10 MB with no exposed secrets. Source: [Challenge 5 write-up](https://saurabh-12.blogspot.com/2026/10/promptwars-challenge-5-celebration.html).
- Older adults need large fonts, clear buttons and high contrast, which popular medication apps often lack. Source: [usability study, NIH/PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC5694345).
