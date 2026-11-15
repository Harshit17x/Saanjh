import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SessionResponse } from '../../../shared/api';
import type { Member } from '../../../shared/types';
import { api, onUnauthenticated } from '../api/client';

export interface DemoInfo {
  code: string;
  passcode: string;
}

interface SessionValue {
  session: SessionResponse | null;
  loading: boolean;
  demo: DemoInfo | null;
  setSession: (session: SessionResponse, demo?: DemoInfo | null) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

/** Holds the signed-in member and circle, loaded once from `/api/me`. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<SessionResponse | null>(null);
  const [demo, setDemo] = useState<DemoInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setSessionState(await api.get<SessionResponse>('/me'));
    } catch {
      setSessionState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api
      .get<SessionResponse>('/me')
      .then(setSessionState, () => setSessionState(null))
      .finally(() => setLoading(false));
    return onUnauthenticated(() => setSessionState(null));
  }, []);

  const setSession = useCallback((next: SessionResponse, nextDemo?: DemoInfo | null) => {
    setSessionState(next);
    if (nextDemo !== undefined) setDemo(nextDemo);
  }, []);

  const signOut = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    setSessionState(null);
    setDemo(null);
  }, []);

  const value = useMemo(
    () => ({ session, loading, demo, setSession, refresh, signOut }),
    [session, loading, demo, setSession, refresh, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}

/** The signed-in session. Only for pages behind the sign-in guard. */
export function useActiveSession(): SessionResponse {
  const { session } = useSession();
  if (!session) throw new Error('No active session');
  return session;
}

export const isElder = (member: Pick<Member, 'role'>): boolean => member.role === 'elder';
export const canManage = (member: Pick<Member, 'role' | 'permission'>): boolean =>
  isElder(member) || member.permission === 'manage';
/** The elder and caretakers can raise a help alert; family receive it. */
export const canCallForHelp = (member: Pick<Member, 'role'>): boolean =>
  isElder(member) || member.role === 'caretaker';
export const canRecordDoses = (member: Pick<Member, 'role' | 'permission'>): boolean =>
  isElder(member) || (member.role === 'caretaker' && member.permission === 'manage');
