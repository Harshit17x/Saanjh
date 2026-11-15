import type { ActivityAction } from '../../shared/types';
import type { Actor, Deps } from '../context';
import { newId } from '../security/ids';

/** Activity entries returned per request. */
export const ACTIVITY_LIMIT = 50;

/** Appends an entry to the circle's activity log. */
export async function recordActivity(
  deps: Deps,
  actor: Actor,
  action: ActivityAction,
  subject: string,
  detail?: string,
): Promise<void> {
  await deps.repo.addActivity({
    id: newId(),
    circleId: actor.circle.id,
    actorId: actor.member.id,
    actorName: actor.member.name,
    action,
    subject,
    ...(detail ? { detail } : {}),
    at: deps.clock.now(),
  });
}
