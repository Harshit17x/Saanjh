import { appointmentStage, doseStage, recipientsFor, REMINDER } from '../../shared/escalation';
import { daysOfSupply, needsRefill } from '../../shared/refill';
import { addDays, localDate } from '../../shared/time';
import type { Circle, Dose, PublicMember } from '../../shared/types';
import type { Deps } from '../context';
import {
  appointmentEmail,
  digestEmail,
  doseReminderEmail,
  lowStockEmail,
  missedDoseEmail,
} from '../email/templates';
import type { Email } from '../ports/services';
import { toPublicMember } from './access';
import { weeklyDigest } from './ai';
import { adherence } from './doses';
import { topUpCircle } from './medications';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DIGEST_DAYS = 7;

export interface RunReport {
  sent: number;
  failed: number;
  markedMissed: number;
  toppedUp: number;
}

interface CircleBundle {
  circle: Circle;
  members: PublicMember[];
}

/** Loads each circle and its members once per run. */
class CircleCache {
  private readonly bundles = new Map<string, Promise<CircleBundle | null>>();
  constructor(private readonly deps: Deps) {}

  get(circleId: string): Promise<CircleBundle | null> {
    let bundle = this.bundles.get(circleId);
    if (!bundle) {
      bundle = (async () => {
        const [circle, members] = await Promise.all([
          this.deps.repo.getCircle(circleId),
          this.deps.repo.listMembers(circleId),
        ]);
        return circle ? { circle, members: members.map(toPublicMember) } : null;
      })();
      this.bundles.set(circleId, bundle);
    }
    return bundle;
  }

  ids(): string[] {
    return [...this.bundles.keys()];
  }
}

/**
 * Sends one email per recipient, at most once. The claim is taken before
 * sending and released if sending fails, so the next run retries.
 */
async function deliver(
  deps: Deps,
  key: string,
  member: PublicMember,
  email: Email,
  report: RunReport,
): Promise<void> {
  const claim = `${key}_${member.id}`;
  if (!(await deps.repo.claimOnce(claim))) return;
  try {
    await deps.mailer.send(email);
    report.sent += 1;
  } catch (error) {
    await deps.repo.releaseClaim(claim);
    report.failed += 1;
    deps.logger.error('reminder email failed', { key, error: String(error) });
  }
}

async function remindDose(deps: Deps, dose: Dose, bundle: CircleBundle, report: RunReport): Promise<void> {
  const now = deps.clock.now();
  const stage = doseStage(dose, now);
  if (!stage) return;
  if (stage === 'missed') {
    await deps.repo.updateDose(dose.id, { status: 'missed' });
    report.markedMissed += 1;
  }
  for (const member of recipientsFor(stage, bundle.members)) {
    if (!member.email) continue;
    const email =
      stage === 'missed'
        ? missedDoseEmail(member.email, bundle.circle, dose, deps.appUrl)
        : doseReminderEmail(
            member.email,
            stage,
            dose,
            {
              take: `${deps.appUrl}/act#${deps.links.sign(dose.id, member.id, 'take', now)}`,
              skip: `${deps.appUrl}/act#${deps.links.sign(dose.id, member.id, 'skip', now)}`,
            },
            deps.appUrl,
          );
    await deliver(deps, `dose_${dose.id}_${stage}`, member, email, report);
  }
}

async function remindLowStock(deps: Deps, bundle: CircleBundle, report: RunReport): Promise<void> {
  const meds = await deps.repo.listMedications(bundle.circle.id);
  const week = Math.floor(deps.clock.now() / (7 * 24 * HOUR_MS));
  for (const med of meds.filter((m) => m.status === 'active' && needsRefill(m))) {
    const daysLeft = daysOfSupply(med) ?? 0;
    for (const member of recipientsFor('lowStock', bundle.members)) {
      if (!member.email) continue;
      const email = lowStockEmail(member.email, bundle.circle, med.name, daysLeft, deps.appUrl);
      await deliver(deps, `stock_${med.id}_${week}`, member, email, report);
    }
  }
}

function formatWhen(at: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(at);
}

/**
 * The reminder run, triggered by Cloud Scheduler every few minutes:
 * tops up dose documents, sends dose and appointment reminders, escalates
 * missed doses, and warns about low stock. Safe to run concurrently or repeatedly.
 */
export async function runReminders(deps: Deps): Promise<RunReport> {
  const now = deps.clock.now();
  const report: RunReport = { sent: 0, failed: 0, markedMissed: 0, toppedUp: 0 };
  const circles = new CircleCache(deps);

  const stale = await deps.repo.listCirclesMaterialisedBefore(addDays(localDate(now, 'UTC'), 2));
  for (const circle of stale) {
    await topUpCircle(deps, circle);
    report.toppedUp += 1;
  }

  const doses = await deps.repo.listDosesDueBetween(
    now - REMINDER.lookbackMin * MINUTE_MS,
    now + REMINDER.lookaheadMin * MINUTE_MS,
  );
  for (const dose of doses) {
    const bundle = await circles.get(dose.circleId);
    if (bundle && !bundle.circle.demo) await remindDose(deps, dose, bundle, report);
  }

  const appointments = await deps.repo.listAppointmentsBetween(
    now,
    now + REMINDER.appointmentLeadHours.early * HOUR_MS,
  );
  for (const appt of appointments) {
    const stage = appointmentStage(appt, now);
    const bundle = await circles.get(appt.circleId);
    if (!stage || !bundle || bundle.circle.demo) continue;
    const hours =
      stage === 'appt2h' ? REMINDER.appointmentLeadHours.late : REMINDER.appointmentLeadHours.early;
    for (const member of recipientsFor(stage, bundle.members)) {
      if (!member.email) continue;
      const email = appointmentEmail(
        member.email,
        bundle.circle,
        appt,
        formatWhen(appt.at, bundle.circle.timezone),
        hours,
        deps.appUrl,
      );
      await deliver(deps, `appt_${appt.id}_${stage}`, member, email, report);
    }
  }

  for (const circleId of circles.ids()) {
    const bundle = await circles.get(circleId);
    if (bundle && !bundle.circle.demo) await remindLowStock(deps, bundle, report);
  }

  deps.logger.info('reminder run complete', { ...report });
  return report;
}

/** Weekly run: emails each circle a plain-language summary of the past seven days. */
export async function runWeeklyDigest(deps: Deps): Promise<RunReport> {
  const report: RunReport = { sent: 0, failed: 0, markedMissed: 0, toppedUp: 0 };
  const circles = new CircleCache(deps);
  for (const circleId of await deps.repo.listAllCircleIds()) {
    const bundle = await circles.get(circleId);
    if (!bundle || bundle.circle.demo) continue;
    const recipients = recipientsFor('digest', bundle.members);
    if (recipients.length === 0) continue;
    const summary = await adherence(deps, bundle.circle, DIGEST_DAYS);
    const digest = await weeklyDigest(deps, bundle.circle, summary);
    const date = localDate(deps.clock.now(), bundle.circle.timezone);
    for (const member of recipients) {
      if (!member.email) continue;
      await deliver(
        deps,
        `digest_${circleId}_${date}`,
        member,
        digestEmail(member.email, bundle.circle, digest, deps.appUrl),
        report,
      );
    }
  }
  deps.logger.info('weekly digest complete', { ...report });
  return report;
}
