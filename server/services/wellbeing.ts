import { recipientsFor } from '../../shared/escalation';
import { localDate } from '../../shared/time';
import { CONCERNING_MOODS, type Activity, type CheckIn, type Mood } from '../../shared/types';
import type { Actor, Deps } from '../context';
import { forbidden } from '../errors';
import { helpEmail, moodEmail } from '../email/templates';
import type { Email } from '../ports/services';
import { isElder, toPublicMember } from './access';
import { recordActivity } from './activity';

/** A call for help stays visible on Today for this long. */
export const HELP_VISIBLE_MS = 24 * 60 * 60_000;

/**
 * Emails everyone in the circle except the sender. Each send is independent,
 * so one failed address never stops the others; returns how many were sent.
 */
async function notifyCircle(deps: Deps, actor: Actor, build: (to: string) => Email): Promise<number> {
  const members = (await deps.repo.listMembers(actor.circle.id)).map(toPublicMember);
  const recipients = recipientsFor('help', members).filter((m) => m.id !== actor.member.id && m.email);
  let sent = 0;
  for (const member of recipients) {
    try {
      if (member.email) await deps.mailer.send(build(member.email));
      sent += 1;
    } catch (error) {
      deps.logger.error('circle email failed', { error: String(error) });
    }
  }
  return sent;
}

/** "I need help": alerts family and caretakers immediately and records it for the whole circle. */
export async function requestHelp(deps: Deps, actor: Actor, note: string): Promise<number> {
  if (!isElder(actor.member) && actor.member.role !== 'caretaker') {
    throw forbidden('Only the elder or a caretaker can call for help');
  }
  await recordActivity(deps, actor, 'help.requested', actor.member.name, note);
  return notifyCircle(deps, actor, (to) => helpEmail(to, actor.circle, actor.member.name, note, deps.appUrl));
}

/**
 * The elder's daily wellbeing check-in. A low or unwell answer tells family
 * the same day, at most once per day, so they can call.
 */
export async function checkIn(deps: Deps, actor: Actor, mood: Mood, note: string): Promise<CheckIn> {
  if (!isElder(actor.member)) throw forbidden('Only the elder can check in');
  await recordActivity(deps, actor, 'wellbeing.checkin', mood, note);
  if (CONCERNING_MOODS.includes(mood)) {
    const day = localDate(deps.clock.now(), actor.circle.timezone);
    if (await deps.repo.claimOnce(`mood_${actor.circle.id}_${day}`)) {
      await notifyCircle(deps, actor, (to) => moodEmail(to, actor.circle, mood, note, deps.appUrl));
    }
  }
  return { mood, note, at: deps.clock.now(), byName: actor.member.name };
}

/** Today's latest check-in and any recent call for help, read from the activity log. */
export function wellbeingFrom(
  activity: Activity[],
  timeZone: string,
  now: number,
): { checkIn: CheckIn | null; helpRequest: { byName: string; at: number } | null } {
  const today = localDate(now, timeZone);
  const latestCheckIn = activity.find(
    (a) => a.action === 'wellbeing.checkin' && localDate(a.at, timeZone) === today,
  );
  const help = activity.find((a) => a.action === 'help.requested' && now - a.at < HELP_VISIBLE_MS);
  return {
    checkIn: latestCheckIn
      ? {
          mood: latestCheckIn.subject as Mood,
          note: latestCheckIn.detail ?? '',
          at: latestCheckIn.at,
          byName: latestCheckIn.actorName,
        }
      : null,
    helpRequest: help ? { byName: help.actorName, at: help.at } : null,
  };
}
