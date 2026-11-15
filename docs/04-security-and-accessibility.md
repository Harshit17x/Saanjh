# Security and accessibility

## Security

### Access
- [ ] Passcodes are 6 digits, hashed with scrypt and a per-member salt, compared in constant time.
- [ ] Five wrong attempts lock that member for 15 minutes.
- [ ] Circle codes are 8 random characters from an alphabet without look-alikes (no 0/O, 1/I).
- [ ] Sessions are signed tokens in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie with a 12-hour life.
- [ ] Login responses do not reveal whether the circle, the member or the passcode was wrong.

### Authorisation
- [ ] Every route checks role and permission on the server.
- [ ] The circle id always comes from the session, never from the request.
- [ ] Elder-only actions: settings, permissions, member removal, approving proposals.
- [ ] A view-only member cannot write anything.

### Request hardening
- [ ] Zod validation on every body, query and path parameter.
- [ ] JSON body limit 16 KB; 1.5 MB on the prescription-scan route only.
- [ ] Per-IP rate limits, tighter on auth and AI routes.
- [ ] Same-origin check on state-changing requests.
- [ ] Strict Content-Security-Policy with no inline script; HSTS; `nosniff`; frame denial; Referrer-Policy; Permissions-Policy.

### Secrets and data
- [ ] Secrets live only in Secret Manager and a git-ignored local `.env`. `.env.example` lists names only.
- [ ] Logs never contain passcodes, tokens, email bodies or medication details.
- [ ] Errors returned to the client are generic and carry a request id; details go to logs.
- [ ] Emails carry the minimum: medication name, dose and time.

### Special endpoints
- [ ] `/internal/tick` accepts only a verified Cloud Scheduler OIDC token.
- [ ] Email action links are HMAC-signed, tied to one dose and one action, expire in 12 hours and work once.

### AI
- [ ] User text is fenced and labelled untrusted in prompts.
- [ ] Model output is schema-validated and never executed, never rendered as HTML.
- [ ] The model cannot write data; a human confirms every change.

### Platform and supply chain
- [ ] Multi-stage container build, non-root user, production dependencies only.
- [ ] Runtime service account with only Firestore and secret-access roles.
- [ ] `npm audit` in CI, Dependabot, committed lockfile, `SECURITY.md`.

## Accessibility

Target: WCAG 2.2 AA everywhere; the elder's Today view goes further.

### Seeing
- [ ] Base text 18 px; a text-size control with three steps, remembered per device.
- [ ] Contrast at least 4.5:1 everywhere and 7:1 on Today.
- [ ] Nothing conveyed by colour alone: status has an icon and a word.
- [ ] Works at 200% zoom and 320 px width without horizontal scrolling.
- [ ] Light and dark themes following the system setting.

### Operating
- [ ] Touch targets at least 56 px on Today, 48 px elsewhere.
- [ ] Everything works by keyboard, in a logical order, with visible focus.
- [ ] Skip link to main content.
- [ ] No time limits on forms; undo for "Taken".
- [ ] Confirmation before destructive actions.
- [ ] `prefers-reduced-motion` respected.

### Understanding
- [ ] Plain words, short sentences, one main action per screen.
- [ ] English and Hindi; the `lang` attribute follows the choice.
- [ ] Visible labels on every input; errors named in text, tied to the field and announced.
- [ ] Consistent navigation and button placement.

### Assistive technology
- [ ] Landmarks (`header`, `nav`, `main`), one `h1` per page, ordered headings.
- [ ] `aria-live` announcements when a dose is confirmed or an error occurs.
- [ ] Focus moves to the page heading on navigation.
- [ ] Charts have an equivalent data table.
- [ ] "Read my day" speaks the schedule.

### Checks
- [ ] axe on every page in the test suite, zero violations.
- [ ] Lighthouse accessibility 100 on the deployed site.
- [ ] Manual keyboard-only pass and a screen-reader pass on Today.

## Visual direction

Warm dusk palette: deep indigo, amber and soft cream. **Atkinson Hyperlegible** (designed by the Braille Institute for low-vision readers) for body text, **Fraunces** for headings, Noto Sans Devanagari for Hindi, all self-hosted so the CSP stays strict. The Today screen's **sky arc** draws the day as the sun's path from dawn to dusk with each dose on it; the sky colour follows the real time of day. No decorative motion.
