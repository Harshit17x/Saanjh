// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pickNextDose } from '../../web/src/pages/Today';
import {
  caretaker,
  elder,
  errorBody,
  expectNoAxeViolations,
  family,
  installBrowserStubs,
  medBase,
  mockFetch,
  renderApp,
  session,
  signedInRoutes,
  todayResponse,
} from './harness';

let stubs: ReturnType<typeof installBrowserStubs>;
// axe and lazy pages are slow under coverage instrumentation.
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
  stubs = installBrowserStubs();
});

describe('Today for the elder', () => {
  it('shows the greeting, sky arc, next dose and schedule without axe violations', async () => {
    mockFetch(signedInRoutes());
    renderApp('/today');
    expect(
      await screen.findByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening), Kamla$/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 of 4 medicines taken today/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /The day as the sun’s path/ })).toBeInTheDocument();
    const next = screen.getByRole('region', { name: 'Next medicine' });
    expect(within(next).getByText('Metformin')).toBeInTheDocument();
    expect(within(next).getByText('With food')).toBeInTheDocument();
    expect(screen.getByText('Atorvastatin: about 3 days left. Time to refill.')).toBeInTheDocument();
    expect(screen.getByText('by Ravi')).toBeInTheDocument();
    expect(screen.getByText('Dr. Anil Mehta')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Visit brief' })).toHaveAttribute(
      'href',
      '/appointments/appt-1/brief',
    );
    await expectNoAxeViolations();
  });

  it('records a dose as taken, offers undo, and skips', async () => {
    const fetchMock = mockFetch({
      ...signedInRoutes(),
      'POST /doses/d3/take': { body: {} },
      'POST /doses/d3/undo': { body: {} },
      'POST /doses/d3/skip': { body: {} },
      'POST /doses/d2/take': { body: {} },
      'POST /doses/d1/undo': { body: {} },
    });
    renderApp('/today');
    const next = await screen.findByRole('region', { name: 'Next medicine' });
    await userEvent.click(within(next).getByRole('button', { name: 'I took it' }));
    const toast = await screen.findByText('Metformin marked as taken');
    await userEvent.click(
      within(toast.closest<HTMLElement>('.toast')!).getByRole('button', { name: 'Undo' }),
    );
    await waitFor(() => expect(fetchMock.callsTo('POST', '/doses/d3/undo')).toHaveLength(1));
    expect(fetchMock.callsTo('POST', '/doses/d3/take')).toHaveLength(1);

    await userEvent.click(
      within(screen.getByRole('region', { name: 'Next medicine' })).getByRole('button', { name: 'Skip' }),
    );
    expect(await screen.findByText('Metformin skipped')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^I took it: Vitamin D3/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Undo: Amlodipine/ }));
    await waitFor(() => expect(fetchMock.callsTo('POST', '/doses/d1/undo')).toHaveLength(1));
    expect(fetchMock.callsTo('POST', '/doses/d2/take')).toHaveLength(1);
  });

  it('shows an error when recording fails', async () => {
    mockFetch({
      ...signedInRoutes(),
      'POST /doses/d3/take': { status: 409, body: errorBody('conflict', 'This dose is not due yet') },
    });
    renderApp('/today');
    const next = await screen.findByRole('region', { name: 'Next medicine' });
    await userEvent.click(within(next).getByRole('button', { name: 'I took it' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This dose is not due yet');
  });

  it('approves and declines proposals', async () => {
    const update = medBase({
      id: 'med-upd',
      name: 'Amlodipine',
      pending: {
        action: 'update',
        changes: { ...medBase(), times: ['09:00'], withFood: true, notes: '' },
        by: 'm-family',
        byName: 'Priya',
        at: 0,
      },
    });
    const fetchMock = mockFetch({
      ...signedInRoutes(elder, {
        'GET /today': { body: todayResponse({ proposals: [todayResponse().proposals[0]!, update] }) },
      }),
      'POST /medications/med-prop/approve': { body: { medication: null } },
      'POST /medications/med-upd/reject': {
        status: 500,
        body: errorBody('internal', 'Something went wrong. Please try again.'),
      },
    });
    renderApp('/today');
    expect(await screen.findByRole('heading', { name: 'Waiting for your approval' })).toBeInTheDocument();
    expect(screen.getByText('Priya suggests adding Calcium + D3')).toBeInTheDocument();
    expect(screen.getByText('Priya suggests changing Amlodipine')).toBeInTheDocument();
    const [first, second] = screen.getAllByRole('button', { name: 'Approve' });
    await userEvent.click(first!);
    await waitFor(() => expect(fetchMock.callsTo('POST', '/medications/med-prop/approve')).toHaveLength(1));
    expect(second).toBeDefined();
    await userEvent.click(screen.getAllByRole('button', { name: 'Decline' })[1]!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('reads the day aloud and stops', async () => {
    mockFetch(signedInRoutes());
    renderApp('/today');
    const button = await screen.findByRole('button', { name: 'Read my day' });
    await userEvent.click(button);
    expect(stubs.speak).toHaveBeenCalledTimes(1);
    const utterance = stubs.speak.mock.calls[0]?.[0] as { text: string; lang: string; onend: () => void };
    expect(utterance.text).toMatch(
      /You have 4 medicines today and have taken 1\. Next is Metformin 500 mg at 8:30\s?pm\. Take it with food\. Your next visit is with Dr\. Anil Mehta/i,
    );
    expect(utterance.lang).toBe('en-IN');
    const stop = screen.getByRole('button', { name: 'Stop reading' });
    expect(stop).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(stop);
    expect(stubs.cancel).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Read my day' })).toBeInTheDocument();
  });

  it('celebrates when everything is recorded and speaks that too', async () => {
    const done = todayResponse().doses.map((d) => ({ ...d, status: 'taken' as const }));
    mockFetch(
      signedInRoutes(elder, {
        'GET /today': {
          body: todayResponse({ doses: done, nextAppointment: null, proposals: [], lowStock: [] }),
        },
      }),
    );
    renderApp('/today');
    expect(await screen.findByRole('heading', { name: 'All done for today' })).toBeInTheDocument();
    expect(screen.getByText('No upcoming visits.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Read my day' }));
    const utterance = stubs.speak.mock.calls[0]?.[0] as { text: string; onend: () => void };
    expect(utterance.text).toContain('Everything for today is done.');
    utterance.onend();
  });

  it('handles a day with no medicines', async () => {
    mockFetch(
      signedInRoutes(elder, {
        'GET /today': { body: todayResponse({ doses: [], proposals: [], lowStock: [] }) },
      }),
    );
    renderApp('/today');
    expect(await screen.findAllByText(/No medicines scheduled today/)).toHaveLength(2);
    expect(screen.queryByRole('region', { name: 'Next medicine' })).not.toBeInTheDocument();
  });

  it('shows a load error with a retry', async () => {
    let calls = 0;
    mockFetch({
      ...signedInRoutes(),
      'GET /today': () => {
        calls += 1;
        return calls === 1
          ? { status: 500, body: errorBody('internal', 'Something went wrong. Please try again.') }
          : { body: todayResponse() };
      },
    });
    renderApp('/today');
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'Next medicine' })).toBeInTheDocument();
  });
});

describe('Today for other members', () => {
  it('family sees no dose buttons and waits for the elder’s approval', async () => {
    mockFetch(signedInRoutes(family));
    renderApp('/today');
    expect(
      await screen.findByRole('heading', { name: 'Waiting for Kamla Devi’s approval' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Waiting for Kamla Devi’s approval').length).toBeGreaterThan(1);
    expect(screen.queryByRole('button', { name: 'I took it' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('a caretaker can record doses', async () => {
    mockFetch(signedInRoutes(caretaker));
    renderApp('/today');
    expect(await screen.findByRole('button', { name: 'I took it' })).toBeInTheDocument();
  });
});

describe('pickNextDose', () => {
  it('prefers the earliest due dose, then the earliest missed one', () => {
    const doses = todayResponse().doses;
    expect(pickNextDose(doses)?.id).toBe('d3');
    expect(pickNextDose(doses.filter((d) => d.status !== 'pending'))?.id).toBe('d2');
    expect(pickNextDose([])).toBeNull();
  });
});

describe('App shell', () => {
  it('changes text size, switches to Hindi and signs out', async () => {
    const fetchMock = mockFetch({ ...signedInRoutes(), 'POST /auth/logout': { status: 204 } });
    renderApp('/today');
    await screen.findByRole('region', { name: 'Next medicine' });
    const sizes = screen.getByRole('group', { name: 'Text size' });
    await userEvent.click(within(sizes).getByRole('button', { name: 'A++' }));
    expect(document.documentElement.dataset.textSize).toBe('2');
    expect(within(sizes).getByRole('button', { name: 'A++' })).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('saanjh.textSize')).toBe('2');

    await userEvent.click(
      within(screen.getAllByRole('group', { name: 'Language' })[0]!).getByRole('button', { name: 'हि' }),
    );
    expect(document.documentElement.lang).toBe('hi');
    expect(await screen.findByText('अगली दवा')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'मेरा दिन सुनाएँ' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'बाहर निकलें' }));
    await waitFor(() => expect(fetchMock.callsTo('POST', '/auth/logout')).toHaveLength(1));
  });

  it('remembers preferences from storage', async () => {
    window.localStorage.setItem('saanjh.textSize', '1');
    window.localStorage.setItem('saanjh.language', 'hi');
    mockFetch(signedInRoutes());
    renderApp('/today');
    expect(await screen.findByText('अगली दवा')).toBeInTheDocument();
    expect(document.documentElement.dataset.textSize).toBe('1');
  });

  it('shows the demo banner and switches members', async () => {
    const fetchMock = mockFetch({
      ...signedInRoutes(elder, {}, { demo: true }),
      'POST /demo/switch/m-family': { body: session(family, { demo: true }) },
      'POST /demo/switch/m-care': {
        status: 403,
        body: errorBody('forbidden', 'Only available in a demo circle'),
      },
    });
    renderApp('/today');
    expect(await screen.findByText(/Code QLJC-8PSW · passcode 246810/)).toBeInTheDocument();
    const group = screen.getByRole('group', { name: 'Viewing as' });
    await userEvent.click(await within(group).findByRole('button', { name: /^Priya/ }));
    await waitFor(() =>
      expect(within(group).getByRole('button', { name: /^Priya/ })).toHaveAttribute('aria-pressed', 'true'),
    );
    expect(fetchMock.callsTo('POST', '/demo/switch/m-family')).toHaveLength(1);
    await userEvent.click(within(group).getByRole('button', { name: /^Ravi/ }));
    expect(await screen.findByText('Only available in a demo circle')).toBeInTheDocument();
  });

  it('returns to sign in when the session expires mid-use', async () => {
    mockFetch({
      ...signedInRoutes(),
      'GET /today': { status: 401, body: errorBody('unauthenticated', 'Please sign in') },
    });
    renderApp('/today');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
  });
});
