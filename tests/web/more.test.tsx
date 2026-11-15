// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activityResponse,
  adherenceResponse,
  elder,
  errorBody,
  expectNoAxeViolations,
  family,
  installBrowserStubs,
  mockFetch,
  renderApp,
  session,
  signedInRoutes,
} from './harness';

let stubs: ReturnType<typeof installBrowserStubs>;
// axe and lazy pages are slow under coverage instrumentation.
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
  stubs = installBrowserStubs();
});

describe('Insights', () => {
  it('shows adherence, streak, daily table, per-medicine table and the weekly note', async () => {
    mockFetch(signedInRoutes());
    renderApp('/insights');
    expect(await screen.findByRole('img', { name: 'Doses taken: 89%' })).toBeInTheDocument();
    expect(screen.getByText('Day streak')).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Metformin' })).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getAllByText('–').length).toBeGreaterThan(0);
    expect(await screen.findByText('93% of doses taken this week')).toBeInTheDocument();
    expect(screen.getByText('Written with Gemini')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Show as a table'));
    expect(screen.getAllByRole('row').length).toBeGreaterThan(7);
    await expectNoAxeViolations();
  });

  it('switches to 30 days and refetches', async () => {
    const fetchMock = mockFetch(signedInRoutes());
    renderApp('/insights');
    await screen.findByRole('img', { name: /Doses taken/ });
    const range = screen.getByRole('group', { name: 'Period' });
    await userEvent.click(within(range).getByRole('button', { name: '30 days' }));
    // One request for the 30-day calendar on load, a second for the switched range.
    await waitFor(() => expect(fetchMock.callsTo('GET', '/adherence?days=30')).toHaveLength(2));
    expect(within(range).getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(range).getByRole('button', { name: '7 days' }));
    await waitFor(() => expect(fetchMock.callsTo('GET', '/adherence?days=7').length).toBeGreaterThan(1));
  });

  it('handles no data and a failed weekly note', async () => {
    const empty = {
      ...adherenceResponse(7),
      overall: { taken: 0, skipped: 0, missed: 0, pending: 0, rate: null },
      byMedication: [],
    };
    mockFetch(
      signedInRoutes(elder, {
        'GET /adherence?days=7': { body: empty },
        'GET /ai/digest': {
          status: 500,
          body: errorBody('internal', 'Something went wrong. Please try again.'),
        },
      }),
    );
    renderApp('/insights');
    expect(await screen.findAllByText('No doses recorded in this period yet.')).toHaveLength(2);
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });
});

describe('Circle', () => {
  it('shows the code, members and activity; copies the invite', async () => {
    mockFetch(signedInRoutes());
    renderApp('/circle');
    expect(await screen.findByText('QLJC-8PSW')).toBeInTheDocument();
    expect(await screen.findByRole('combobox', { name: 'Access for Priya' })).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(await screen.findByText(/suggested a change to Calcium \+ D3/)).toBeInTheDocument();
    await expectNoAxeViolations();
    await userEvent.click(screen.getByRole('button', { name: 'Copy invite' }));
    expect(stubs.writeText).toHaveBeenCalledWith(expect.stringContaining('/join?code=QLJC8PSW'));
    expect(window.alert).toHaveBeenCalledWith('Invite copied');
  });

  it('falls back to a prompt when the clipboard is unavailable', async () => {
    stubs.writeText.mockRejectedValueOnce(new Error('denied'));
    mockFetch(signedInRoutes());
    renderApp('/circle');
    await userEvent.click(await screen.findByRole('button', { name: 'Copy invite' }));
    await waitFor(() => expect(window.prompt).toHaveBeenCalled());
  });

  it('lets the elder change access, remove members and save settings', async () => {
    const fetchMock = mockFetch({
      ...signedInRoutes(),
      'PATCH /circle/members/m-family': { status: 204 },
      'DELETE /circle/members/m-care': { status: 204 },
      'PATCH /circle': (body) => ({ body: { circle: { ...session().circle, ...(body as object) } } }),
    });
    renderApp('/circle');
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Access for Priya' }), 'view');
    await waitFor(() =>
      expect(fetchMock.callsTo('PATCH', '/circle/members/m-family')[0]?.body).toEqual({ permission: 'view' }),
    );

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Ravi' }));
    expect(fetchMock.callsTo('DELETE', '/circle/members/m-care')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Ravi' }));
    await waitFor(() => expect(fetchMock.callsTo('DELETE', '/circle/members/m-care')).toHaveLength(1));

    const settings = screen.getByRole('region', { name: 'Circle settings' });
    await userEvent.click(
      within(settings).getByRole('checkbox', { name: 'Changes by others need my approval' }),
    );
    await userEvent.selectOptions(within(settings).getByLabelText('Preferred language'), 'hi');
    await userEvent.click(within(settings).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(fetchMock.callsTo('PATCH', '/circle')[0]?.body).toMatchObject({
        requireElderApproval: false,
        language: 'hi',
      }),
    );
  });

  it('reports errors from member and settings changes', async () => {
    const forbidden = { status: 403, body: errorBody('forbidden', 'Only the elder can do that') };
    mockFetch({
      ...signedInRoutes(),
      'PATCH /circle/members/m-family': forbidden,
      'DELETE /circle/members/m-care': forbidden,
      'PATCH /circle': forbidden,
    });
    renderApp('/circle');
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Access for Priya' }), 'view');
    expect(await screen.findByRole('alert')).toHaveTextContent('Only the elder can do that');
    await userEvent.click(screen.getByRole('button', { name: 'Remove Ravi' }));
    const settings = screen.getByRole('region', { name: 'Circle settings' });
    await userEvent.click(within(settings).getByRole('button', { name: 'Save' }));
    expect(await within(settings).findByRole('alert')).toHaveTextContent('Only the elder can do that');
  });

  it('saves the profile and sends a test email', async () => {
    const fetchMock = mockFetch({
      ...signedInRoutes(family),
      'PATCH /me': (body) => ({ body: session({ ...family, ...(body as object) }) }),
      'POST /me/test-email': { status: 202, body: { sent: true } },
    });
    renderApp('/circle');
    const profile = await screen.findByRole('region', { name: 'My details' });
    expect(screen.queryByRole('region', { name: 'Circle settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
    const name = within(profile).getByLabelText('Your name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Priya S');
    await userEvent.click(within(profile).getByRole('checkbox', { name: 'Send me email reminders' }));
    await userEvent.click(within(profile).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(fetchMock.callsTo('PATCH', '/me')[0]?.body).toEqual({
        name: 'Priya S',
        email: 'm-family@example.com',
        notify: false,
      }),
    );
    await userEvent.click(within(profile).getByRole('button', { name: 'Send me a test email' }));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Test email sent'));
  });

  it('shows profile errors and an empty activity log, and signs out', async () => {
    const fetchMock = mockFetch({
      ...signedInRoutes(elder, { 'GET /activity': { body: { items: [] } } }),
      'PATCH /me': {
        status: 400,
        body: errorBody('invalid_input', 'Some details need fixing', { email: 'Invalid email address' }),
      },
      'POST /me/test-email': {
        status: 429,
        body: errorBody('rate_limited', 'Too many requests. Please wait a moment.'),
      },
      'POST /auth/logout': { status: 204 },
    });
    renderApp('/circle');
    expect(await screen.findByText('No activity yet.')).toBeInTheDocument();
    const profile = screen.getByRole('region', { name: 'My details' });
    await userEvent.click(within(profile).getByRole('button', { name: 'Save' }));
    expect(await within(profile).findByText('Invalid email address')).toBeInTheDocument();
    await userEvent.click(within(profile).getByRole('button', { name: 'Send me a test email' }));
    expect(await within(profile).findByText('Too many requests. Please wait a moment.')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Sign out' }).at(-1)!);
    await waitFor(() => expect(fetchMock.callsTo('POST', '/auth/logout')).toHaveLength(1));
    expect(activityResponse.items).toHaveLength(2);
  });
});

describe('Act page', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('previews the email action and confirms it', async () => {
    window.location.hash = '#signed.token-value';
    const fetchMock = mockFetch({
      'GET /me': { status: 401, body: errorBody('unauthenticated', 'Please sign in') },
      'POST /act/preview': {
        body: {
          action: 'take',
          medName: 'Metformin',
          medDose: '500 mg',
          localDate: '2026-11-15',
          localTime: '20:30',
          status: 'pending',
        },
      },
      'POST /act': { body: {} },
    });
    renderApp('/act');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mark Metformin as taken?' }),
    ).toBeInTheDocument();
    await expectNoAxeViolations();
    await userEvent.click(screen.getByRole('button', { name: 'Yes, I took it' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Recorded. Thank you!' }),
    ).toBeInTheDocument();
    expect(fetchMock.callsTo('POST', '/act')[0]?.body).toEqual({ token: 'signed.token-value' });
  });

  it('handles a skip link that was already used', async () => {
    window.location.hash = '#signed.skip-token';
    mockFetch({
      'GET /me': { status: 401, body: errorBody('unauthenticated', 'Please sign in') },
      'POST /act/preview': {
        body: {
          action: 'skip',
          medName: 'Metformin',
          medDose: '500 mg',
          localDate: '2026-11-15',
          localTime: '20:30',
          status: 'pending',
        },
      },
      'POST /act': { status: 409, body: errorBody('conflict', 'This link has already been used.') },
    });
    renderApp('/act');
    await userEvent.click(await screen.findByRole('button', { name: 'Yes, skip it' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This link has already been used.');
  });

  it('confirms a skip', async () => {
    window.location.hash = '#signed.skip-ok';
    mockFetch({
      'GET /me': { status: 401, body: errorBody('unauthenticated', 'Please sign in') },
      'POST /act/preview': {
        body: {
          action: 'skip',
          medName: 'Metformin',
          medDose: '500 mg',
          localDate: '2026-11-15',
          localTime: '20:30',
          status: 'pending',
        },
      },
      'POST /act': { body: {} },
    });
    renderApp('/act');
    await userEvent.click(await screen.findByRole('button', { name: 'Yes, skip it' }));
    expect(await screen.findByRole('heading', { level: 1, name: /Skipped/ })).toBeInTheDocument();
  });

  it('explains an invalid or missing link', async () => {
    mockFetch({ 'GET /me': { status: 401, body: errorBody('unauthenticated', 'Please sign in') } });
    renderApp('/act');
    expect(await screen.findByRole('alert')).toHaveTextContent('This link is not valid.');
    expect(screen.getByRole('link', { name: 'Open Saanjh' })).toHaveAttribute('href', '/today');
  });
});
