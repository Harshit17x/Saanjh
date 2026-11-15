import type { Response } from 'express';
import type { SessionResponse } from '../../shared/api';
import type { Actor, Deps } from '../context';
import { toPublicMember } from '../services/access';
import { toPublicCircle } from '../services/circles';
import { sessionCookie } from '../security/session';

/** Issues the session cookie for an actor and returns what the client needs to render. */
export async function startSession(deps: Deps, res: Response, actor: Actor): Promise<SessionResponse> {
  const token = await deps.sessions.sign(
    { circleId: actor.circle.id, memberId: actor.member.id },
    deps.clock.now(),
  );
  res.setHeader('Set-Cookie', sessionCookie(token, deps.secureCookies));
  return sessionBody(actor);
}

export function sessionBody(actor: Actor): SessionResponse {
  return { circle: toPublicCircle(actor.circle), member: toPublicMember(actor.member) };
}
