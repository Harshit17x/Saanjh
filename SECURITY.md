# Security policy

Saanjh stores personal health information for older adults, so security is a core requirement, not an afterthought.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's **Report a vulnerability** (private advisory) on this repository. You will get an acknowledgement within 72 hours.

## What is protected, and how

| Area | Control |
|---|---|
| Passcodes | scrypt (N=2¹⁵, r=8, p=1), 16-byte random salt, constant-time comparison; 5 failures lock the member for 15 minutes; per-IP rate limits on every auth route |
| Sessions | HS256 JWT with issuer and expiry checks; cookie is `HttpOnly`, `Secure`, `SameSite=Strict`; member reloaded on each request |
| Authorisation | Checked server-side on every route by role and permission; circle id taken only from the session |
| Cross-site requests | `SameSite=Strict` plus an Origin check on all state-changing requests |
| Input | Zod schemas on every body, query and path; JSON size limits; image size cap |
| Output | Strict Content-Security-Policy (no inline script or style), HSTS, `nosniff`, frame denial, Referrer-Policy, Permissions-Policy; API responses `no-store` |
| Email links | HMAC-SHA256 signed, bound to dose + member + action, 12-hour expiry, single use; token in URL fragment; confirmation required (scanner-safe) |
| Internal endpoints | Cloud Scheduler OIDC token verified for audience and service-account email |
| AI | User data fenced and marked untrusted; model output schema-validated; model cannot write data; human confirms every change |
| Secrets | Secret Manager only; never in the repository, images or logs |
| Logging | Structured logs without passcodes, tokens, email bodies or medication details |
| Runtime | Non-root container, production dependencies only, least-privilege service accounts |
| Supply chain | Committed lockfile, `npm audit` in CI, Dependabot |

## Known limits

- Rate limits are per Cloud Run instance (in memory). That is enough to blunt guessing at this scale. A shared store such as Memorystore would be needed at large scale.
- Demo circles use a published passcode and contain only sample data.
