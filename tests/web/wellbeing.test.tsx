// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdherenceResponse, TodayResponse } from '../../shared/api';
import type { CheckIn } from '../../shared/types';
import { HelpButton, HOLD_MS } from '../../web/src/components/Wellbeing';
import {
  adherenceResponse,
  appointment,
  caretaker,
  elder,
  errorBody,
  expectNoAxeViolations,
  family,
  installBrowserStubs,
  mockFetch,
  NOW,
  Providers,
  renderApp,
  signedInRoutes,
  todayResponse,
} from './harness';

const HOUR = 3_600_000;
const signedOut = { 'GET /me': { status: 401, body: errorBody('unauthenticated', 'Please sign in') } };

// axe and lazy pages are slow under coverage instrumentation.
vi.setConfig({ testTimeout: 20_000 });

let storage: Storage;
beforeEach(() => {
  installBrowserStubs();
  storage = window.localStorage;
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('theme toggle', () => {
  it('switches between light and dark and remembers the choice', async () => {
    mockFetch(signedOut);
    renderApp('/');
    const toLight = () => screen.getByRole('button', { name: 'Switch to light mode' });
    await userEvent.click(await screen.findByRole('button', { name: 'Switch to dark mode' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(storage.getItem('saanjh.theme')).toBe('dark');
    await userEvent.click(toLight());
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(storage.getItem('saanjh.theme')).toBe('light');
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument();
  });

  it('starts from a saved choice', async () => {
    storage.setItem('saanjh.theme', 'dark');
    mockFetch(signedOut);
    renderApp('/');
    expect(await screen.findByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument();
  });

  it('follows a dark system setting until the person chooses', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('dark'), media: query }));
    mockFetch(signedOut);
    renderApp('/');
    expect(await screen.findByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument();
  });

  it('is offered on the signed-in header too', async () => {
    mockFetch(signedInRoutes());
    renderApp('/today');
    expect(await screen.findByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument();
  });
});

describe('HelpButton', () => {
  const renderButton = (onSent = vi.fn()) => {
    render(
      <Providers>
        <HelpButton onSent={onSent} />
      </Providers>,
    );
    return { onSent, button: screen.getByRole('button', { name: /I need help/ }) };
  };

  it('alerts the circle after a two-second keyboard hold', async () => {
    vi.useFakeTimers();
    const fetchMock = mockFetch({ ...signedOut, 'POST /help': { status: 201, body: { notified: 2 } } });
    const { onSent, button } = renderButton();
    expect(button).toHaveAccessibleDescription('Press and hold for 2 seconds to alert your family.');
    fireEvent.keyDown(button, { key: ' ' });
    expect(button).toHaveTextContent('Keep holding…');
    expect(button).toHaveAttribute('data-holding', 'true');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HOLD_MS);
    });
    expect(fetchMock.callsTo('POST', '/help')).toHaveLength(1);
    expect(screen.getByText('Help is on the way. 2 people were alerted.')).toBeInTheDocument();
    expect(onSent).toHaveBeenCalled();
    expect(button).toHaveTextContent('I need help');
  });

  it('does nothing when released early, on repeat keys, or on other keys', async () => {
    vi.useFakeTimers();
    const fetchMock = mockFetch({ ...signedOut, 'POST /help': { status: 201, body: { notified: 2 } } });
    const { button } = renderButton();
    fireEvent.keyDown(button, { key: 'Enter' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HOLD_MS - 500);
    });
    fireEvent.keyUp(button, { key: 'Enter' });
    fireEvent.keyDown(button, { key: ' ', repeat: true });
    fireEvent.keyDown(button, { key: 'a' });
    fireEvent.keyUp(button, { key: 'a' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HOLD_MS * 2);
    });
    expect(fetchMock.callsTo('POST', '/help')).toHaveLength(0);
    expect(button).toHaveTextContent('I need help');
  });

  it('works by pressing and holding with a finger or mouse, and cancels when the pointer leaves', async () => {
    vi.useFakeTimers();
    const fetchMock = mockFetch({ ...signedOut, 'POST /help': { status: 201, body: { notified: 0 } } });
    const { button } = renderButton();
    fireEvent.pointerDown(button);
    fireEvent.pointerLeave(button);
    fireEvent.pointerDown(button);
    fireEvent.pointerCancel(button);
    fireEvent.pointerDown(button);
    fireEvent.pointerUp(button);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HOLD_MS * 2);
    });
    expect(fetchMock.callsTo('POST', '/help')).toHaveLength(0);

    fireEvent.pointerDown(button);
    fireEvent.pointerDown(button);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HOLD_MS);
    });
    expect(fetchMock.callsTo('POST', '/help')).toHaveLength(1);
    expect(screen.getByText(/Your call for help is recorded/)).toBeInTheDocument();
    expect(fireEvent.contextMenu(button)).toBe(false);
  });

  it('shows an error if the alert cannot be sent', async () => {
    vi.useFakeTimers();
    mockFetch({
      ...signedOut,
      'POST /help': {
        status: 403,
        body: errorBody('forbidden', 'Only the elder or a caretaker can call for help'),
      },
    });
    const { onSent, button } = renderButton();
    fireEvent.keyDown(button, { key: ' ' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HOLD_MS);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Only the elder or a caretaker');
    expect(onSent).not.toHaveBeenCalled();
  });
});

describe('daily check-in', () => {
  it('lets the elder choose a mood with a note, then shows it and allows a change', async () => {
    let checkIn: CheckIn | null = null;
    const fetchMock = mockFetch(
      signedInRoutes(elder, {
        'GET /today': () => ({ body: todayResponse({ checkIn }) }),
        'POST /checkin': (body) => {
          const { mood, note } = body as { mood: CheckIn['mood']; note: string };
          checkIn = { mood, note, at: NOW, byName: 'Kamla Devi' };
          return { status: 201, body: checkIn };
        },
      }),
    );
    renderApp('/today');
    const card = await screen.findByRole('region', { name: 'How are you feeling today?' });
    const moods = within(card).getByRole('group', { name: 'How are you feeling today?' });
    expect(within(moods).getAllByRole('button')).toHaveLength(5);
    await userEvent.type(within(card).getByLabelText(/Add a note/), 'Knee hurts');
    await userEvent.click(within(moods).getByRole('button', { name: /Low/ }));
    expect(fetchMock.callsTo('POST', '/checkin')[0]?.body).toEqual({ mood: 'low', note: 'Knee hurts' });
    expect(await within(card).findByText(/You said you feel low ·/)).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Change' }));
    expect(within(card).getByRole('group', { name: 'How are you feeling today?' })).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it('shows an error when the check-in fails', async () => {
    mockFetch(
      signedInRoutes(elder, {
        'POST /checkin': {
          status: 500,
          body: errorBody('internal', 'Something went wrong. Please try again.'),
        },
      }),
    );
    renderApp('/today');
    const card = await screen.findByRole('region', { name: 'How are you feeling today?' });
    await userEvent.click(within(card).getByRole('button', { name: /Great/ }));
    expect(await within(card).findByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('shows family how the elder feels, with their note', async () => {
    const checkIn: CheckIn = { mood: 'unwell', note: 'Headache', at: NOW, byName: 'Kamla Devi' };
    mockFetch(signedInRoutes(family, { 'GET /today': { body: todayResponse({ checkIn }) } }));
    renderApp('/today');
    const card = await screen.findByRole('region', { name: 'Kamla Devi today' });
    expect(within(card).getByText(/Kamla Devi feels unwell ·/)).toBeInTheDocument();
    expect(within(card).getByText('“Headache”')).toBeInTheDocument();
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
  });

  it('tells family when the elder has not checked in yet', async () => {
    mockFetch(signedInRoutes(family));
    renderApp('/today');
    expect(await screen.findByText('Kamla Devi has not checked in yet today.')).toBeInTheDocument();
  });
});

describe('Today dashboard', () => {
  const statValues = () => screen.getAllByRole('listitem').filter((li) => li.classList.contains('stat-tile'));

  it('shows the stat tiles, progress ring and the circle strip for the elder', async () => {
    mockFetch(signedInRoutes());
    renderApp('/today');
    expect(await screen.findByRole('img', { name: '1 of 4 medicines taken today' })).toBeInTheDocument();
    await waitFor(() => expect(statValues()[0]).toHaveTextContent('89%'));
    const [rate, streak, visit, refill] = statValues();
    expect(rate).toHaveAttribute('data-tone', 'ok');
    expect(streak).toHaveTextContent('4');
    expect(visit).toHaveTextContent('in 2 days');
    expect(refill).toHaveTextContent('1 running low');
    expect(refill).toHaveAttribute('data-tone', 'warn');
    const strip = await screen.findByRole('region', { name: 'Your care circle' });
    expect(within(strip).getByText('(You)')).toBeInTheDocument();
    expect(within(strip).getByText('Priya')).toBeInTheDocument();
    expect(within(strip).getByRole('link', { name: 'Manage' })).toHaveAttribute('href', '/circle');
    expect(screen.getByRole('button', { name: /I need help/ })).toBeInTheDocument();
  });

  it.each([
    [NOW + 30 * HOUR, 'tomorrow'],
    [NOW + 2 * HOUR, 'today'],
  ])('describes a visit at %s as %s', async (at, text) => {
    mockFetch(
      signedInRoutes(elder, {
        'GET /today': { body: todayResponse({ nextAppointment: appointment({ at }) }) },
      }),
    );
    renderApp('/today');
    await waitFor(() => expect(statValues()[2]).toHaveTextContent(text));
  });

  it('flags a low week, no visits and full stock', async () => {
    const low: AdherenceResponse = {
      ...adherenceResponse(7),
      overall: { taken: 1, skipped: 0, missed: 1, pending: 0, rate: 0.5 },
    };
    const today: TodayResponse = todayResponse({ nextAppointment: null, lowStock: [], doses: [] });
    mockFetch(
      signedInRoutes(elder, { 'GET /today': { body: today }, 'GET /adherence?days=7': { body: low } }),
    );
    renderApp('/today');
    await waitFor(() => expect(statValues()[0]).toHaveTextContent('50%'));
    const [rate, , visit, refill] = statValues();
    expect(rate).toHaveAttribute('data-tone', 'warn');
    expect(visit).toHaveTextContent('None booked');
    expect(refill).toHaveTextContent('All stocked');
    expect(screen.queryByRole('img', { name: /medicines taken today/ })).not.toBeInTheDocument();
  });

  it('shows a dash while the weekly rate has no data', async () => {
    mockFetch(
      signedInRoutes(elder, { 'GET /adherence?days=7': { status: 500, body: errorBody('internal', 'x') } }),
    );
    renderApp('/today');
    await screen.findByRole('img', { name: /medicines taken today/ });
    expect(statValues()[0]).toHaveTextContent('–');
    expect(statValues()[1]).toHaveTextContent('0');
  });

  it('shows a call for help to everyone in the circle', async () => {
    mockFetch(
      signedInRoutes(family, {
        'GET /today': { body: todayResponse({ helpRequest: { byName: 'Ravi', at: NOW } }) },
      }),
    );
    renderApp('/today');
    const banner = (await screen.findAllByRole('alert')).find((el) => el.classList.contains('help-banner'));
    expect(banner).toHaveTextContent(/Ravi asked for help at/);
  });

  it('puts the circle strip in place of the help button for family', async () => {
    mockFetch(signedInRoutes(family));
    renderApp('/today');
    expect(await screen.findByRole('region', { name: 'Your care circle' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /I need help/ })).not.toBeInTheDocument();
  });

  it('gives caretakers the help button and the circle strip', async () => {
    mockFetch(signedInRoutes(caretaker));
    renderApp('/today');
    expect(await screen.findByRole('button', { name: /I need help/ })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Your care circle' })).toBeInTheDocument();
  });
});

describe('Insights additions', () => {
  it('names the part of the day when doses are missed and draws a 30-day calendar', async () => {
    mockFetch(signedInRoutes());
    renderApp('/insights');
    const periods = await screen.findByRole('region', { name: 'Time of day' });
    expect(within(periods).getByText('67%')).toBeInTheDocument();
    expect(within(periods).getByText(/Evening doses are missed most often/)).toBeInTheDocument();
    const calendar = await screen.findByRole('region', { name: 'Last 30 days' });
    expect(within(calendar).getAllByRole('listitem')).toHaveLength(30);
    expect(within(calendar).getAllByText(/: \d+%$/).length).toBeGreaterThan(0);
    await expectNoAxeViolations();
  });

  it('says all is well when every period is on track, and handles days without doses', async () => {
    const good: AdherenceResponse = {
      ...adherenceResponse(7),
      byPeriod: [
        { period: 'morning', taken: 9, skipped: 0, missed: 0, pending: 0, rate: 1 },
        { period: 'afternoon', taken: 0, skipped: 0, missed: 0, pending: 0, rate: null },
        { period: 'evening', taken: 9, skipped: 0, missed: 1, pending: 0, rate: 0.9 },
        { period: 'night', taken: 0, skipped: 0, missed: 0, pending: 0, rate: null },
      ],
    };
    const month: AdherenceResponse = {
      ...adherenceResponse(30),
      byDay: adherenceResponse(30).byDay.map((d, i) =>
        i === 0
          ? { ...d, taken: 0, missed: 0, rate: null }
          : i === 1
            ? { ...d, rate: 0.6 }
            : i === 2
              ? { ...d, rate: 0.2 }
              : d,
      ),
    };
    mockFetch(
      signedInRoutes(elder, {
        'GET /adherence?days=7': { body: good },
        'GET /adherence?days=30': { body: month },
      }),
    );
    renderApp('/insights');
    expect(await screen.findByText('Doses are taken well at every time of day.')).toBeInTheDocument();
    const calendar = await screen.findByRole('region', { name: 'Last 30 days' });
    const cells = within(calendar).getAllByRole('listitem');
    expect(cells[0]).toHaveAttribute('data-level', '0');
    expect(within(calendar).getByText(/: no doses$/)).toBeInTheDocument();
    expect(cells[1]).toHaveAttribute('data-level', '2');
    expect(cells[2]).toHaveAttribute('data-level', '1');
  });
});

describe('Landing sections', () => {
  it('shows how it works, personas, the challenge checklist and the tech used', async () => {
    mockFetch(signedOut);
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Set up in two minutes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Start a circle' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'One circle, three ways to care' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'For family far away' })).toBeInTheDocument();
    const align = screen.getByRole('region', { name: 'Everything asked for, and more' });
    expect(within(align).getAllByRole('listitem')).toHaveLength(6);
    const built = screen.getByRole('region', { name: 'Built with' });
    expect(within(built).getByText('Gemini')).toBeInTheDocument();
    expect(screen.getByText('No passwords to remember')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Try a demo circle' })).toHaveLength(2);
    await expectNoAxeViolations();
  });
});

describe('Medicines supply bar', () => {
  it('shows a supply bar for medicines with a stock count', async () => {
    mockFetch(signedInRoutes());
    renderApp('/medicines');
    await screen.findByRole('heading', { name: /Amlodipine/ });
    // Amlodipine, Atorvastatin and the proposed Calcium + D3 track stock; paused Metformin does not.
    expect(screen.getAllByText('Supply')).toHaveLength(3);
  });
});
