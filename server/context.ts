import type { Circle, Member } from '../shared/types';
import type { Repository } from './ports/repository';
import type { AiClient, Clock, Logger, Mailer, TriggerVerifier } from './ports/services';
import type { ActionLinkSigner } from './security/actionLinks';
import type { SessionSigner } from './security/session';

/** Everything a service needs from the outside world, injected once at start-up. */
export interface Deps {
  repo: Repository;
  clock: Clock;
  mailer: Mailer;
  ai: AiClient;
  sessions: SessionSigner;
  links: ActionLinkSigner;
  verifyTrigger: TriggerVerifier;
  logger: Logger;
  appUrl: string;
  secureCookies: boolean;
}

/** The signed-in member and their circle, loaded fresh on every request. */
export interface Actor {
  circle: Circle;
  member: Member;
}
