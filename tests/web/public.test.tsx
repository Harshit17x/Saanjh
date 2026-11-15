// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  elder,
  errorBody,
  expectNoAxeViolations,
  installBrowserStubs,
  members,
  mockFetch,
  renderApp,
  session,
  signedInRoutes,
} from './harness';

const signedOut = { 'GET /me': { status: 401, body: errorBody('unauthenticated', 'Please sign in') } };

// axe and lazy pages are slow under coverage instrumentation.
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
  installBrowserStubs();
});

describe('Landing', () => {
  it('renders the hero, features and has no axe violations', async () => {
    mockFetch(signedOut);
    renderApp('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: /care that keeps them in charge/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('The elder approves changes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start a care circle' })).toHaveAttribute('href', '/start');
    await expectNoAxeViolations();
  });

  it('starts a demo circle and lands on Today', async () => {
    mockFetch({
      ...signedOut,
      'POST /demo': {
        status: 201,
        body: { ...session(elder, { demo: true }), code: 'QLJC8PSW', passcode: '246810' },
      },
      ...Object.fromEntries(
        Object.entries(signedInRoutes(elder, {}, { demo: true })).filter(([k]) => k !== 'GET /me'),
      ),
    });
    renderApp('/');
    await userEvent.click((await screen.findAllByRole('button', { name: 'Try a demo circle' }))[0]!);
    expect(await screen.findByText(/medicines taken today/)).toBeInTheDocument();
    expect(await screen.findByText(/Code QLJC-8PSW · passcode 246810/)).toBeInTheDocument();
  });

  it('shows an error when the demo cannot start', async () => {
    mockFetch({
      ...signedOut,
      'POST /demo': {
        status: 429,
        body: errorBody('rate_limited', 'Too many requests. Please wait a moment.'),
      },
    });
    renderApp('/');
    await userEvent.click((await screen.findAllByRole('button', { name: 'Try a demo circle' }))[0]!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
    for (const button of screen.getAllByRole('button', { name: 'Try a demo circle' }))
      expect(button).toBeEnabled();
  });

  it('sends signed-in people from the landing page to Today', async () => {
    mockFetch(signedInRoutes());
    renderApp('/');
    expect(await screen.findByText(/medicines taken today/)).toBeInTheDocument();
  });

  it('redirects protected pages to sign in when there is no session', async () => {
    mockFetch(signedOut);
    renderApp('/medicines');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
  });

  it('renders the not-found page', async () => {
    mockFetch(signedOut);
    renderApp('/nowhere');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    await expectNoAxeViolations();
  });
});

describe('Start a circle', () => {
  it('shows field errors from the API tied to their inputs', async () => {
    mockFetch({
      ...signedOut,
      'POST /circles': {
        status: 400,
        body: errorBody('invalid_input', 'Some details need fixing', {
          elderName: 'Required',
          passcode: 'Passcode must be 6 digits',
        }),
      },
    });
    renderApp('/start');
    await screen.findByRole('heading', { level: 1, name: 'Start a care circle' });
    await expectNoAxeViolations();
    await userEvent.click(screen.getByRole('button', { name: 'Create circle' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Some details need fixing');
    const name = screen.getByLabelText('Elder’s name');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription('Required');
  });

  it('creates the circle and opens the circle page', async () => {
    const routes = {
      ...signedOut,
      ...Object.fromEntries(Object.entries(signedInRoutes()).filter(([k]) => k !== 'GET /me')),
    };
    const fetchMock = mockFetch({ ...routes, 'POST /circles': { status: 201, body: session() } });
    renderApp('/start');
    await userEvent.type(await screen.findByLabelText('Elder’s name'), 'Kamla Devi');
    await userEvent.type(screen.getByLabelText(/Elder’s email/), 'k@example.com');
    await userEvent.selectOptions(screen.getByLabelText('Preferred language'), 'hi');
    await userEvent.selectOptions(screen.getByLabelText('Time zone'), 'Europe/London');
    await userEvent.type(
      screen.getByLabelText('Choose a 6-digit passcode', { selector: 'input' }),
      '13a5790',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create circle' }));
    await screen.findByRole('heading', { level: 1, name: 'Care circle' }, { timeout: 5000 });
    expect(fetchMock.callsTo('POST', '/circles')[0]?.body).toMatchObject({
      elderName: 'Kamla Devi',
      email: 'k@example.com',
      language: 'hi',
      timezone: 'Europe/London',
      passcode: '135790',
    });
  }, 20_000);
});

describe('Join a circle', () => {
  it('prefills the code from the link and joins as a caretaker', async () => {
    const fetchMock = mockFetch({
      ...signedOut,
      ...Object.fromEntries(Object.entries(signedInRoutes(members[2])).filter(([k]) => k !== 'GET /me')),
      'POST /auth/join': { status: 201, body: session(members[2]) },
    });
    renderApp('/join?code=QLJC8PSW');
    expect(await screen.findByLabelText('Circle code')).toHaveValue('QLJC8PSW');
    await expectNoAxeViolations();
    await userEvent.type(screen.getByLabelText('Your name'), 'Ravi');
    await userEvent.click(screen.getByRole('radio', { name: 'Caretaker' }));
    for (const digit of ['2', '4', '6', '8', '1', '0'])
      await userEvent.click(screen.getByRole('button', { name: digit }));
    await userEvent.click(screen.getByRole('button', { name: 'Join circle' }));
    expect(await screen.findByText(/medicines taken today/)).toBeInTheDocument();
    expect(fetchMock.callsTo('POST', '/auth/join')[0]?.body).toMatchObject({
      code: 'QLJC8PSW',
      name: 'Ravi',
      role: 'caretaker',
      passcode: '246810',
    });
  });

  it('shows a general error that is not about a field', async () => {
    mockFetch({
      ...signedOut,
      'POST /auth/join': { status: 404, body: errorBody('not_found', 'Circle not found') },
    });
    renderApp('/join');
    await userEvent.type(await screen.findByLabelText('Circle code'), 'abcd');
    expect(screen.getByLabelText('Circle code')).toHaveValue('ABCD');
    await userEvent.click(screen.getByRole('button', { name: 'Join circle' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Circle not found');
  });
});

describe('Sign in', () => {
  const lookup = {
    elderName: 'Kamla Devi',
    members: members.map(({ id, name, role }) => ({ id, name, role })),
  };

  it('finds the circle, picks a member and signs in with the keypad', async () => {
    let attempts = 0;
    const fetchMock = mockFetch({
      ...signedOut,
      ...Object.fromEntries(Object.entries(signedInRoutes()).filter(([k]) => k !== 'GET /me')),
      'POST /auth/lookup': { body: lookup },
      'POST /auth/login': () => {
        attempts += 1;
        return attempts === 1
          ? {
              status: 401,
              body: errorBody('unauthenticated', 'That passcode did not match. Please try again.'),
            }
          : { body: session() };
      },
    });
    renderApp('/signin');
    await userEvent.type(await screen.findByLabelText('Circle code'), 'qljc-8psw');
    await userEvent.click(screen.getByRole('button', { name: 'Find circle' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Who is signing in to Kamla Devi’s circle?' }),
    ).toBeInTheDocument();
    await expectNoAxeViolations();
    await userEvent.click(screen.getByRole('button', { name: /Priya/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Not you? Choose again' }));
    await userEvent.click(screen.getByRole('button', { name: /Kamla Devi/ }));

    const input = screen.getByLabelText('Passcode for Kamla Devi', { selector: 'input' });
    const keypad = screen.getByRole('group', { name: 'Passcode for Kamla Devi' });
    for (const digit of ['1', '2', '3'])
      await userEvent.click(within(keypad).getByRole('button', { name: digit }));
    await userEvent.click(within(keypad).getByRole('button', { name: 'Delete last digit' }));
    expect(input).toHaveValue('12');
    await userEvent.click(within(keypad).getByRole('button', { name: 'Clear' }));
    expect(input).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    for (const digit of ['1', '3', '5', '7', '9', '0', '0'])
      await userEvent.click(within(keypad).getByRole('button', { name: digit }));
    expect(input).toHaveValue('135790');

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That passcode did not match');
    expect(input).toHaveValue('');

    await userEvent.type(input, '135790');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText(/medicines taken today/)).toBeInTheDocument();
    expect(fetchMock.callsTo('POST', '/auth/login')[1]?.body).toEqual({
      code: 'QLJC-8PSW',
      memberId: 'm-elder',
      passcode: '135790',
    });
  });

  it('reports an unknown circle code', async () => {
    mockFetch({
      ...signedOut,
      'POST /auth/lookup': { status: 404, body: errorBody('not_found', 'Circle not found') },
    });
    renderApp('/signin');
    await userEvent.type(await screen.findByLabelText('Circle code'), 'ZZZZ');
    await userEvent.click(screen.getByRole('button', { name: 'Find circle' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Circle not found'));
  });
});
