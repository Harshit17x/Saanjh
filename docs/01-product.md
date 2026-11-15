# Product

## Principles

1. **The elder decides.** Others help; they do not take over.
2. **Informed, not surveilled.** Family hears about a problem only after the elder has had the chance to act.
3. **One main action per screen.** Large type, plain words, big buttons.
4. **AI assists, code decides.** The model reads, drafts and explains. Schedules, statistics and alerts come from tested code.
5. **Nothing changes silently.** Every change is attributed and logged.

## Roles

| Role              | Can do                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Elder** (owner) | Everything. Sets what each member can see and do. Approves or rejects changes others make. Removes members.                 |
| **Family**        | Views the profile. Manages medications and appointments if the elder allows it. Receives escalations and the weekly digest. |
| **Caretaker**     | As family, and can mark a dose as given on the elder's behalf (recorded as given by the caretaker).                         |

Each member has a permission set by the elder: **view only** or **manage**.

## Core features

### 1. Care Circle and passcode access

- Creating a circle produces a circle code such as `SAANJH-7K2Q`.
- A member joins with the code, their name, role, email and their own 6-digit passcode.
- Signing in needs the circle code, the member and the passcode. No passwords and no third-party sign-in.

### 2. Today (the elder's home screen)

- The next dose in very large type with **Taken** and **Skip** buttons.
- The rest of the day as a simple timeline with status shown by icon and text.
- The next appointment.
- **Read my day** speaks the schedule aloud.
- Undo for a dose marked by mistake.

### 3. Medications

- Add, edit, pause, resume, delete.
- Fields: name, dose, form, times of day, days of week, with-food note, start and end dates, stock count.

### 4. Adherence

- Each dose is pending, taken, skipped or missed.
- 7-day and 30-day adherence, overall and per medication; current streak.
- A simple chart with an equivalent data table.

### 5. Appointments

- Doctor, speciality, place, date and time, notes.
- **Add to Google Calendar** and **Open in Google Maps** links.

### 6. Email reminders

- Upcoming dose, dose still not confirmed, missed dose (to family and caretakers), appointment at 24 hours and 2 hours, low stock, weekly digest.

### 7. Activity log

- Who did what and when, visible to the whole circle.

## Beyond a reminder app

| Feature                  | What it does                                                                                                                 | Why it matters                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Elder approval**       | Medication changes by family or caretakers are proposals until the elder approves. On by default; the elder can turn it off. | Keeps the elder at the centre of decisions                  |
| **One-tap from email**   | Reminder emails carry signed "I took it" and "Skip" links                                                                    | No login barrier for the person least comfortable with apps |
| **Escalation ladder**    | Elder first; family and caretakers only after a grace period                                                                 | Dignity before alarm                                        |
| **Prescription scan**    | Photo of a prescription or pill strip becomes a draft schedule to review                                                     | Removes the hardest data-entry step                         |
| **Safety check**         | Reviews the full list for possible interactions, duplicates and timing conflicts; outputs questions for the doctor           | Catches what a family member would not know to ask          |
| **Weekly digest**        | Code-computed adherence turned into a short, kind summary in English or Hindi                                                | Keeps distant family informed without a dashboard           |
| **Doctor-visit brief**   | Printable one-page summary with suggested questions before an appointment                                                    | Makes the visit more useful                                 |
| **"I need help"**        | Hold a big button for two seconds; every family member and caretaker is emailed at once, and the circle sees a banner        | A fast, accident-proof way to call for help                 |
| **Daily check-in**       | The elder taps how they feel; low or unwell tells family the same day                                                        | Wellbeing, not just pills; family know when to call         |
| **Time-of-day insights** | Adherence by morning, afternoon, evening and night, plus a 30-day calendar                                                   | Shows _when_ help is needed                                 |
| **Refill warning**       | Stock counts down with each taken dose; warning under 5 days                                                                 | Prevents running out                                        |
| **Hindi and read aloud** | Language toggle; speech for the daily schedule                                                                               | Reaches elders who do not read English comfortably          |

## Key flows

**Set up.** Elder (or a family member with them) creates a circle → gets the code → shares it → others join with their own passcodes → elder sets permissions.

**Daily.** Reminder email 10 minutes before a dose → elder taps "I took it" in the email or on Today → adherence updates. If nothing is confirmed, a nudge follows at 20 minutes, and family and caretakers are told at 60 minutes.

**Adding a medication.** Type it in or scan a prescription → review the draft → safety check runs → save. If a non-elder did this and approval is on, the elder sees a proposal on Today and approves or rejects it.

**Before an appointment.** Reminders at 24 hours and 2 hours → open the visit brief → print or show it to the doctor.

## Demo circle

**Try a demo circle** on the landing page creates a fully populated circle (Kamla Devi, her daughter Priya and caretaker Ravi, four medicines, two weeks of history, a pending proposal, a low-stock medicine and two appointments) and signs in as the elder. A banner shows the code and passcode and switches between members, so a reviewer sees every role in under a minute. Demo circles never send email.

## Stretch (only if ahead of schedule)

- **Ask Saanjh:** an assistant that answers questions about the profile using Gemini function calling over read-only tools.
- Installable PWA.
