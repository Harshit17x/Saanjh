// @vitest-environment jsdom
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, messageOf, onUnauthenticated } from '../../web/src/api/client';
import { Brand, LogoMark } from '../../web/src/components/Logo';
import { arcPoint, SkyArc, skyPhase } from '../../web/src/components/SkyArc';
import { Dialog, Toast } from '../../web/src/components/ui';
import { usePreferences } from '../../web/src/hooks/usePreferences';
import { useResource } from '../../web/src/hooks/useResource';
import {
  canManage,
  canRecordDoses,
  isElder,
  useActiveSession,
  useSession,
} from '../../web/src/hooks/useSession';
import { format, I18nProvider, useI18n } from '../../web/src/i18n';
import { en } from '../../web/src/i18n/en';
import { hi } from '../../web/src/i18n/hi';
import {
  dateParts,
  displayCode,
  formatDate,
  formatDateTime,
  formatShortDate,
  formatTime,
  formatWallTime,
  googleCalendarUrl,
  googleMapsUrl,
  initial,
} from '../../web/src/lib/format';
import { prepareImage } from '../../web/src/lib/image';
import { readStored, writeStored } from '../../web/src/lib/storage';
import {
  errorBody,
  installBrowserStubs,
  installStorage,
  mockFetch,
  Providers,
  session,
  todayResponse,
} from './harness';

// axe and lazy pages are slow under coverage instrumentation.
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
  installBrowserStubs();
});

describe('format helpers', () => {
  const instant = Date.UTC(2026, 10, 17, 5, 30); // 11:00 in Kolkata
  it('formats times, dates and codes in the circle time zone', () => {
    expect(formatTime(instant, 'Asia/Kolkata', 'en-IN')).toMatch(/^11:00\s?am$/i);
    expect(formatWallTime('20:30', 'en-IN')).toMatch(/^8:30\s?pm$/i);
    expect(formatDate(instant, 'Asia/Kolkata', 'en-IN')).toBe('Tuesday, 17 November');
    expect(formatDateTime(instant, 'Asia/Kolkata', 'en-IN')).toMatch(/Tue, 17 Nov/);
    expect(dateParts(instant, 'Asia/Kolkata', 'en-IN')).toEqual({ day: '17', month: 'Nov' });
    expect(formatShortDate('2026-11-15', 'en-IN')).toBe('Sun 15');
    expect(initial('  priya ')).toBe('P');
    expect(initial('   ')).toBe('?');
    expect(displayCode('QLJC8PSW')).toBe('QLJC-8PSW');
  });

  it('builds Google Calendar and Maps links', () => {
    const url = new URL(googleCalendarUrl('Dr. Mehta – Kamla', instant, 'Bring readings', 'Apollo'));
    expect(url.origin).toBe('https://calendar.google.com');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('dates')).toBe('20261117T053000Z/20261117T063000Z');
    expect(url.searchParams.get('location')).toBe('Apollo');
    expect(googleMapsUrl('Apollo Clinic, Bengaluru')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Apollo%20Clinic%2C%20Bengaluru',
    );
  });
});

describe('i18n', () => {
  it('fills placeholders and leaves unknown ones', () => {
    expect(format('Hello {name}, {count}', { name: 'Kamla', count: 3 })).toBe('Hello Kamla, 3');
    expect(format('Hello {missing}')).toBe('Hello {missing}');
  });

  it('has a Hindi string for every English key', () => {
    expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
    for (const value of Object.values(hi)) expect(value.length).toBeGreaterThan(0);
  });

  it('starts from the initial language when nothing is stored', () => {
    const { result } = renderHook(() => useI18n(), {
      wrapper: ({ children }) => <I18nProvider initial="hi">{children}</I18nProvider>,
    });
    expect(result.current.language).toBe('hi');
    expect(result.current.locale).toBe('hi-IN');
    expect(result.current.t('nav.today')).toBe('आज');
  });

  it('requires its provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useI18n())).toThrow('useI18n must be used inside I18nProvider');
    expect(() => renderHook(() => usePreferences())).toThrow(
      'usePreferences must be used inside PreferencesProvider',
    );
    expect(() => renderHook(() => useSession())).toThrow('useSession must be used inside SessionProvider');
  });
});

describe('sky arc', () => {
  it('maps the local hour to a sky phase', () => {
    expect(skyPhase(6 * 60)).toBe('dawn');
    expect(skyPhase(12 * 60)).toBe('day');
    expect(skyPhase(17 * 60)).toBe('dusk');
    expect(skyPhase(21 * 60)).toBe('night');
    expect(skyPhase(2 * 60)).toBe('night');
  });

  it('places times on the arc, clamped to the waking day', () => {
    expect(arcPoint(6 * 60)).toEqual({ x: 40, y: 196 });
    const top = arcPoint(14 * 60);
    expect(top.x).toBeCloseTo(300);
    expect(top.y).toBeCloseTo(40);
    expect(arcPoint(3 * 60)).toEqual(arcPoint(6 * 60));
    expect(arcPoint(23 * 60).x).toBeCloseTo(560);
  });

  it('draws a moon at night and dose markers by status', () => {
    const { container, rerender } = render(
      <SkyArc doses={todayResponse().doses} nowMinutes={23 * 60} label="Sky" />,
    );
    expect(screen.getByRole('img', { name: 'Sky' })).toBeInTheDocument();
    expect(container.querySelectorAll('.sky-dose')).toHaveLength(4);
    expect(container.querySelector('.sky-dose-taken path')).not.toBeNull();
    expect(container.querySelector('.sky-dose-missed path')).not.toBeNull();
    rerender(<SkyArc doses={[]} nowMinutes={12 * 60} label="Sky" />);
    expect(container.querySelectorAll('.sky-dose')).toHaveLength(0);
  });

  it('renders the logo and brand link', () => {
    render(
      <>
        <LogoMark className="x" />
        <Brand to="/today" />
      </>,
    );
    expect(screen.getByRole('link', { name: 'Saanjh' })).toHaveAttribute('href', '/today');
  });
});

describe('storage', () => {
  it('reads and writes with a prefix', () => {
    writeStored('language', 'hi');
    expect(window.localStorage.getItem('saanjh.language')).toBe('hi');
    expect(readStored('language')).toBe('hi');
    expect(readStored('missing')).toBeNull();
  });

  it('keeps working when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    installStorage(broken);
    expect(readStored('language')).toBeNull();
    expect(() => writeStored('language', 'hi')).not.toThrow();
  });
});

describe('api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns JSON, handles 204 and sends bodies', async () => {
    const fetchMock = mockFetch({
      'GET /ok': { body: { a: 1 } },
      'DELETE /x': { status: 204 },
      'PUT /y': { body: {} },
      'PATCH /z': { body: {} },
    });
    expect(await api.get('/ok')).toEqual({ a: 1 });
    expect(await api.delete('/x')).toBeUndefined();
    await api.put('/y', { v: 1 });
    await api.patch('/z', { v: 2 });
    expect(fetchMock.calls.map((c) => [c.method, c.body])).toEqual([
      ['GET', undefined],
      ['DELETE', undefined],
      ['PUT', { v: 1 }],
      ['PATCH', { v: 2 }],
    ]);
  });

  it('maps API errors with fields, and unreadable error bodies', async () => {
    mockFetch({
      'POST /bad': { status: 400, body: errorBody('invalid_input', 'Fix it', { name: 'Required' }) },
    });
    const error = await api.post('/bad').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'invalid_input',
      message: 'Fix it',
      fields: { name: 'Required' },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('not json', { status: 502 }))),
    );
    await expect(api.get('/broken')).rejects.toMatchObject({
      status: 502,
      code: 'unknown',
      message: 'Something went wrong.',
      fields: {},
    });
  });

  it('reports a network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('offline'))),
    );
    await expect(api.get('/x')).rejects.toMatchObject({ status: 0, code: 'network' });
  });

  it('notifies listeners on 401 except for session and auth calls', async () => {
    const unauthorized = { status: 401, body: errorBody('unauthenticated', 'Please sign in') };
    mockFetch({ 'GET /today': unauthorized, 'GET /me': unauthorized, 'POST /auth/login': unauthorized });
    const listener = vi.fn();
    const stop = onUnauthenticated(listener);
    await api.get('/me').catch(() => undefined);
    await api.post('/auth/login').catch(() => undefined);
    expect(listener).not.toHaveBeenCalled();
    await api.get('/today').catch(() => undefined);
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    await api.get('/today').catch(() => undefined);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('turns anything into a message', () => {
    expect(messageOf(new Error('boom'))).toBe('boom');
    expect(messageOf('nope')).toBe('Something went wrong.');
  });
});

describe('useResource', () => {
  it('ignores a slow earlier response that resolves after a newer one', async () => {
    const resolvers: ((value: string) => void)[] = [];
    const load = vi.fn(() => new Promise<string>((resolve) => resolvers.push(resolve)));
    const { result } = renderHook(() => useResource(load, 'k'));
    expect(result.current.loading).toBe(true);
    let second!: Promise<void>;
    act(() => {
      second = result.current.reload();
    });
    await act(async () => {
      resolvers[1]?.('new');
      await second;
    });
    await act(async () => {
      resolvers[0]?.('old');
      await Promise.resolve();
    });
    expect(result.current.data).toBe('new');
    expect(result.current.loading).toBe(false);
    act(() => result.current.setData('manual'));
    expect(result.current.data).toBe('manual');
  });

  it('ignores a stale error and keeps the latest error', async () => {
    const rejecters: ((error: Error) => void)[] = [];
    const load = vi.fn(() => new Promise<string>((_resolve, reject) => rejecters.push(reject)));
    const { result } = renderHook(() => useResource(load, 'k'));
    let second!: Promise<void>;
    act(() => {
      second = result.current.reload();
    });
    await act(async () => {
      rejecters[1]?.(new Error('latest'));
      await second;
    });
    await act(async () => {
      rejecters[0]?.(new Error('stale'));
      await Promise.resolve();
    });
    expect(result.current.error).toBe('latest');
  });
});

describe('session helpers', () => {
  it('derives permissions', () => {
    expect(isElder({ role: 'elder' })).toBe(true);
    expect(canManage({ role: 'family', permission: 'view' })).toBe(false);
    expect(canManage({ role: 'family', permission: 'manage' })).toBe(true);
    expect(canRecordDoses({ role: 'family', permission: 'manage' })).toBe(false);
    expect(canRecordDoses({ role: 'caretaker', permission: 'manage' })).toBe(true);
    expect(canRecordDoses({ role: 'elder', permission: 'view' })).toBe(true);
  });

  it('refreshes the session and throws without one', async () => {
    let signedIn = false;
    mockFetch({
      'GET /me': () =>
        signedIn
          ? { body: session() }
          : { status: 401, body: errorBody('unauthenticated', 'Please sign in') },
    });
    function Probe() {
      const { session: current, loading, refresh } = useSession();
      return (
        <div>
          <span>{loading ? 'loading' : current ? current.member.name : 'none'}</span>
          <button type="button" onClick={() => void refresh()}>
            refresh
          </button>
        </div>
      );
    }
    render(
      <Providers>
        <Probe />
      </Providers>,
    );
    expect(await screen.findByText('none')).toBeInTheDocument();
    signedIn = true;
    await userEvent.click(screen.getByRole('button', { name: 'refresh' }));
    expect(await screen.findByText('Kamla Devi')).toBeInTheDocument();
    signedIn = false;
    await userEvent.click(screen.getByRole('button', { name: 'refresh' }));
    expect(await screen.findByText('none')).toBeInTheDocument();
  });

  it('useActiveSession throws when nobody is signed in', () => {
    mockFetch({ 'GET /me': { status: 401, body: errorBody('unauthenticated', 'x') } });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() =>
      renderHook(() => useActiveSession(), { wrapper: ({ children }) => <Providers>{children}</Providers> }),
    ).toThrow('No active session');
  });
});

describe('ui primitives', () => {
  it('closes the dialog from the close button and keeps it shut when not open', async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <I18nProvider>
        <Dialog open title="Hello" onClose={onClose}>
          <p>Body</p>
        </Dialog>
      </I18nProvider>,
    );
    expect(screen.getByRole('dialog', { name: 'Hello' })).toHaveAttribute('open');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
    rerender(
      <I18nProvider>
        <Dialog open={false} title="Hello" onClose={onClose}>
          <p>Body</p>
        </Dialog>
      </I18nProvider>,
    );
    expect(screen.queryByText('Body')).not.toBeInTheDocument();
  });

  it('dismisses a toast after a few seconds', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<Toast message="Saved" onDone={onDone} />);
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('announces repeated messages through the live region', async () => {
    function Announce() {
      const { announce } = usePreferences();
      return (
        <button type="button" onClick={() => announce('Saved')}>
          go
        </button>
      );
    }
    mockFetch({ 'GET /me': { status: 401, body: errorBody('unauthenticated', 'x') } });
    render(
      <Providers>
        <Announce />
      </Providers>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'go' }));
    await userEvent.click(screen.getByRole('button', { name: 'go' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
  });
});

describe('prepareImage', () => {
  const originalImage = globalThis.Image;
  afterEach(() => {
    globalThis.Image = originalImage;
    vi.restoreAllMocks();
  });

  function fakeImage(width: number, height: number, fail = false) {
    class FakeImage {
      naturalWidth = width;
      naturalHeight = height;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => (fail ? this.onerror?.() : this.onload?.()));
      }
    }
    globalThis.Image = FakeImage as unknown as typeof Image;
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
  }

  const file = new File(['x'], 'rx.jpg', { type: 'image/jpeg' });

  it('downscales and returns base64 JPEG', async () => {
    fakeImage(3200, 1600);
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,QUJD');
    await expect(prepareImage(file)).resolves.toEqual({ mimeType: 'image/jpeg', data: 'QUJD' });
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 800);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
  });

  it('lowers quality until the image fits, then gives up', async () => {
    fakeImage(800, 600);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    const huge = `data:image/jpeg;base64,${'A'.repeat(1_400_000)}`;
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(huge);
    await expect(prepareImage(file)).rejects.toThrow('That photo is too large');
    expect(toDataURL.mock.calls.length).toBeGreaterThan(1);
  });

  it('rejects unreadable files and browsers without canvas', async () => {
    fakeImage(10, 10, true);
    await expect(prepareImage(file)).rejects.toThrow('That file is not an image we can read.');
    fakeImage(10, 10);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(prepareImage(file)).rejects.toThrow('This browser cannot prepare images.');
  });
});
