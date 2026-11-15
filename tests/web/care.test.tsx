// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  appointment,
  briefResponse,
  elder,
  errorBody,
  expectNoAxeViolations,
  family,
  installBrowserStubs,
  medBase,
  medications,
  mockFetch,
  renderApp,
  signedInRoutes,
} from './harness';

vi.mock('../../web/src/lib/image', () => ({
  prepareImage: vi.fn(() => Promise.resolve({ mimeType: 'image/jpeg', data: 'aGVsbG8=' })),
}));

// axe and lazy pages are slow under coverage instrumentation.
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
  installBrowserStubs();
});

const dialog = () => screen.getByRole('dialog');

describe('Medicines', () => {
  it('lists medicines with schedule details and no axe violations', async () => {
    mockFetch(signedInRoutes());
    renderApp('/medicines');
    expect(await screen.findByRole('heading', { level: 2, name: /Amlodipine/ })).toBeInTheDocument();
    expect(screen.getAllByText('24 days left').length).toBeGreaterThan(0);
    expect(screen.getByText('10 days left')).not.toHaveClass('badge-warn');
    expect(screen.getByText('Mon, Wed')).toBeInTheDocument();
    expect(screen.getAllByText('Paused').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Waiting for approval').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Restart Metformin' })).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it('adds a medicine through the dialog form', async () => {
    const fetchMock = mockFetch({
      ...signedInRoutes(),
      'POST /medications': { status: 201, body: medBase({ id: 'new', name: 'Aspirin' }) },
    });
    renderApp('/medicines');
    await userEvent.click(await screen.findByRole('button', { name: 'Add medicine' }));
    const form = dialog();
    expect(within(form).getByRole('heading', { name: 'Add a medicine' })).toBeInTheDocument();
    await expectNoAxeViolations(form);
    await userEvent.type(within(form).getByLabelText('Medicine name'), 'Aspirin');
    await userEvent.type(within(form).getByLabelText(/^Strength/), '75 mg');
    await userEvent.selectOptions(within(form).getByLabelText('Type'), 'capsule');
    await userEvent.click(within(form).getByRole('button', { name: 'Add a time' }));
    fireEvent.change(within(form).getByLabelText('Times of day 2'), { target: { value: '21:15' } });
    await userEvent.click(within(form).getByRole('button', { name: 'Add a time' }));
    await userEvent.click(within(form).getByRole('button', { name: 'Remove time 20:00' }));
    await userEvent.click(within(form).getByRole('checkbox', { name: 'Sun' }));
    await userEvent.click(within(form).getByRole('checkbox', { name: 'Sun' }));
    await userEvent.click(within(form).getByRole('checkbox', { name: 'Sat' }));
    await userEvent.click(within(form).getByRole('checkbox', { name: 'Take with food' }));
    fireEvent.change(within(form).getByLabelText(/^End date/), { target: { value: '2026-12-31' } });
    await userEvent.type(within(form).getByLabelText(/^Tablets or doses at home/), '30');
    await userEvent.type(within(form).getByLabelText(/^Notes/), 'After breakfast');
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fetchMock.callsTo('POST', '/medications')[0]?.body).toMatchObject({
      name: 'Aspirin',
      dose: '75 mg',
      form: 'capsule',
      times: ['09:00', '21:15'],
      daysOfWeek: [0, 1, 2, 3, 4, 5],
      withFood: true,
      endDate: '2026-12-31',
      stock: 30,
      notes: 'After breakfast',
    });
  });

  it('shows field errors from the server inside the form and cancels', async () => {
    mockFetch({
      ...signedInRoutes(),
      'POST /medications': {
        status: 400,
        body: errorBody('invalid_input', 'Some details need fixing', {
          name: 'Required',
          times: 'Add at least one time',
          daysOfWeek: 'Choose at least one day',
        }),
      },
    });
    renderApp('/medicines');
    await userEvent.click(await screen.findByRole('button', { name: 'Add medicine' }));
    const form = dialog();
    const end = within(form).getByLabelText(/^End date/);
    fireEvent.change(end, { target: { value: '2026-12-31' } });
    fireEvent.change(end, { target: { value: '' } });
    const stock = within(form).getByLabelText(/^Tablets or doses at home/);
    await userEvent.type(stock, '5');
    await userEvent.clear(stock);
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('Some details need fixing');
    expect(within(form).getByText('Add at least one time')).toBeInTheDocument();
    expect(within(form).getByText('Choose at least one day')).toBeInTheDocument();
    expect(within(form).getByLabelText('Medicine name')).toHaveAttribute('aria-invalid', 'true');
    await userEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('edits, pauses, restarts and deletes', async () => {
    const fetchMock = mockFetch({
      ...signedInRoutes(),
      'PUT /medications/med-1': { body: medBase({ dose: '10 mg' }) },
      'POST /medications/med-1/pause': { body: medBase({ status: 'paused' }) },
      'POST /medications/med-3/resume': { body: medBase({ id: 'med-3' }) },
      'DELETE /medications/med-2': { status: 204 },
      'DELETE /medications/med-1': {
        status: 409,
        body: errorBody('conflict', 'Approve this medication first'),
      },
    });
    renderApp('/medicines');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Amlodipine' }));
    const form = dialog();
    expect(within(form).getByRole('heading', { name: 'Edit Amlodipine' })).toBeInTheDocument();
    const dose = within(form).getByLabelText(/^Strength/);
    await userEvent.clear(dose);
    await userEvent.type(dose, '10 mg');
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(fetchMock.callsTo('PUT', '/medications/med-1')).toHaveLength(1));
    expect(fetchMock.callsTo('PUT', '/medications/med-1')[0]?.body).toMatchObject({
      dose: '10 mg',
      name: 'Amlodipine',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Pause Amlodipine' }));
    await userEvent.click(screen.getByRole('button', { name: 'Restart Metformin' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete Atorvastatin' }));
    await waitFor(() => expect(fetchMock.callsTo('DELETE', '/medications/med-2')).toHaveLength(1));
    expect(window.confirm).toHaveBeenCalledWith(
      'Stop tracking Atorvastatin? Past doses stay in the history.',
    );
    expect(fetchMock.callsTo('POST', '/medications/med-1/pause')).toHaveLength(1);
    expect(fetchMock.callsTo('POST', '/medications/med-3/resume')).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Delete Amlodipine' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Approve this medication first');

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Amlodipine' }));
    expect(fetchMock.callsTo('DELETE', '/medications/med-1')).toHaveLength(1);
  });

  it('runs the safety check and shows cautions with the AI note', async () => {
    const fetchMock = mockFetch(signedInRoutes());
    renderApp('/medicines');
    await userEvent.click(await screen.findByRole('button', { name: 'Check my medicines' }));
    expect(await screen.findByText('Warfarin + Aspirin')).toBeInTheDocument();
    expect(screen.getByText('Important')).toBeInTheDocument();
    expect(screen.getByText('Worth asking')).toBeInTheDocument();
    expect(screen.getByText('Tip')).toBeInTheDocument();
    expect(screen.getByText(/Ask the doctor: Is this safe together\?/)).toBeInTheDocument();
    expect(screen.getByText('Written with Gemini')).toBeInTheDocument();
    expect(screen.getAllByText(/Not medical advice/).length).toBeGreaterThan(0);
    expect(fetchMock.callsTo('POST', '/ai/safety-check')).toHaveLength(1);
  });

  it('says when nothing stood out, or reports a failure', async () => {
    let call = 0;
    mockFetch({
      ...signedInRoutes(),
      'POST /ai/safety-check': () => {
        call += 1;
        return call === 1
          ? { body: { source: 'rules', cautions: [] } }
          : { status: 429, body: errorBody('rate_limited', 'Too many requests. Please wait a moment.') };
      },
    });
    renderApp('/medicines');
    const run = await screen.findByRole('button', { name: 'Check my medicines' });
    await userEvent.click(run);
    expect(await screen.findByText(/Nothing stood out/)).toBeInTheDocument();
    expect(screen.getByText('Basic check (AI unavailable)')).toBeInTheDocument();
    await userEvent.click(run);
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
  });

  it('scans a prescription and prefills the form from a draft', async () => {
    const fetchMock = mockFetch({
      ...signedInRoutes(),
      'POST /ai/scan-prescription': {
        body: {
          source: 'gemini',
          medications: [
            {
              name: 'Pantoprazole',
              dose: '40 mg',
              form: 'capsule',
              times: ['07:30'],
              withFood: false,
              confidence: 0.86,
            },
            { name: 'Mystery', dose: '', form: 'weird', times: ['09:00'], withFood: true, confidence: 0.3 },
          ],
        },
      },
    });
    const { container } = renderApp('/medicines');
    await userEvent.click(await screen.findByRole('button', { name: 'Scan prescription' }));
    expect(within(dialog()).getByRole('heading', { name: 'Scan a prescription' })).toBeInTheDocument();
    const input = container.ownerDocument.querySelector<HTMLInputElement>('input[type="file"]');
    await userEvent.upload(input!, new File(['img'], 'rx.jpg', { type: 'image/jpeg' }));
    expect(await screen.findByText('Found 2. Check each one before adding.')).toBeInTheDocument();
    expect(screen.getByText(/86% sure/)).toBeInTheDocument();
    expect(fetchMock.callsTo('POST', '/ai/scan-prescription')[0]?.body).toEqual({
      mimeType: 'image/jpeg',
      data: 'aGVsbG8=',
    });
    await userEvent.click(screen.getAllByRole('button', { name: 'Check and add' })[1]!);
    const form = dialog();
    expect(within(form).getByLabelText('Medicine name')).toHaveValue('Mystery');
    expect(within(form).getByLabelText('Type')).toHaveValue('other');
    await userEvent.click(within(form).getByRole('button', { name: 'Close' }));
  });

  it('reports a scan with nothing readable, and a scan failure', async () => {
    let call = 0;
    mockFetch({
      ...signedInRoutes(),
      'POST /ai/scan-prescription': () => {
        call += 1;
        return call === 1
          ? { body: { source: 'rules', medications: [] } }
          : { status: 413, body: errorBody('payload_too_large', 'That is too large to upload') };
      },
    });
    const { container } = renderApp('/medicines');
    await userEvent.click(await screen.findByRole('button', { name: 'Scan prescription' }));
    const input = container.ownerDocument.querySelector<HTMLInputElement>('input[type="file"]')!;
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Take or choose a photo' }));
    await userEvent.upload(input, new File(['img'], 'rx.jpg', { type: 'image/jpeg' }));
    expect(await screen.findByText(/Could not read any medicines/)).toBeInTheDocument();
    await userEvent.upload(input, new File(['img'], 'rx.jpg', { type: 'image/jpeg' }));
    expect(await screen.findByText('That is too large to upload')).toBeInTheDocument();
    fireEvent.change(input, { target: { files: [] } });
  });

  it('family changes are sent for approval; view-only members see a notice', async () => {
    const fetchMock = mockFetch({
      ...signedInRoutes(family),
      'POST /medications/med-1/pause': {
        body: medBase({
          pending: { action: 'pause', changes: null, by: 'm-family', byName: 'Priya', at: 0 },
        }),
      },
    });
    renderApp('/medicines');
    expect(
      await screen.findByText('Changes you make will wait for Kamla Devi’s approval.'),
    ).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Pause Amlodipine' }));
    await waitFor(() =>
      expect(screen.getByRole('status', { hidden: true })).toHaveTextContent(
        'Sent to Kamla Devi for approval',
      ),
    );
    expect(fetchMock.callsTo('POST', '/medications/med-1/pause')).toHaveLength(1);
  });

  it('view-only members cannot change anything', async () => {
    mockFetch(
      signedInRoutes({ ...family, permission: 'view' }, { 'GET /medications': { body: { items: [] } } }),
    );
    renderApp('/medicines');
    expect(
      await screen.findByText('You can view medicines. Ask Kamla Devi for permission to make changes.'),
    ).toBeInTheDocument();
    expect(await screen.findByText('No medicines yet. Add one, or scan a prescription.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add medicine' })).not.toBeInTheDocument();
  });

  it('shows a load error', async () => {
    mockFetch({
      ...signedInRoutes(),
      'GET /medications': {
        status: 500,
        body: errorBody('internal', 'Something went wrong. Please try again.'),
      },
    });
    renderApp('/medicines');
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });
});

describe('Appointments', () => {
  it('lists upcoming and past visits with Google links', async () => {
    mockFetch(signedInRoutes());
    renderApp('/appointments');
    const upcoming = await screen.findByRole('region', { name: 'Upcoming' });
    expect(within(upcoming).getByRole('heading', { name: 'Dr. Anil Mehta' })).toBeInTheDocument();
    const calendar = within(upcoming).getByRole('link', { name: 'Add to Google Calendar' });
    expect(calendar.getAttribute('href')).toMatch(
      /^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE/,
    );
    expect(within(upcoming).getByRole('link', { name: 'Directions' })).toHaveAttribute(
      'href',
      expect.stringContaining('google.com/maps/search'),
    );
    const past = screen.getByRole('region', { name: 'Past' });
    expect(within(past).getByRole('heading', { name: 'Dr. Old' })).toBeInTheDocument();
    expect(within(past).queryByRole('link', { name: 'Directions' })).not.toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it('adds, edits and deletes a visit', async () => {
    const fetchMock = mockFetch({
      ...signedInRoutes(),
      'POST /appointments': { status: 201, body: appointment({ id: 'new' }) },
      'PUT /appointments/appt-1': { body: appointment() },
      'DELETE /appointments/appt-old': { status: 204 },
    });
    renderApp('/appointments');
    await userEvent.click(await screen.findByRole('button', { name: 'Add visit' }));
    let form = dialog();
    await userEvent.type(within(form).getByLabelText('Doctor'), 'Dr. Rao');
    await userEvent.type(within(form).getByLabelText(/^Speciality/), 'General');
    await userEvent.type(within(form).getByLabelText(/^Place/), 'Manipal');
    fireEvent.change(within(form).getByLabelText('Date'), { target: { value: '2026-12-01' } });
    fireEvent.change(within(form).getByLabelText('Time'), { target: { value: '17:30' } });
    await userEvent.type(within(form).getByLabelText(/^Notes/), 'Fasting');
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(fetchMock.callsTo('POST', '/appointments')).toHaveLength(1));
    expect(fetchMock.callsTo('POST', '/appointments')[0]?.body).toEqual({
      doctor: 'Dr. Rao',
      speciality: 'General',
      place: 'Manipal',
      date: '2026-12-01',
      time: '17:30',
      notes: 'Fasting',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Edit Dr. Anil Mehta' }));
    form = dialog();
    expect(within(form).getByLabelText('Doctor')).toHaveValue('Dr. Anil Mehta');
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(fetchMock.callsTo('PUT', '/appointments/appt-1')).toHaveLength(1));

    await userEvent.click(screen.getByRole('button', { name: 'Delete Dr. Old' }));
    await waitFor(() => expect(fetchMock.callsTo('DELETE', '/appointments/appt-old')).toHaveLength(1));
  });

  it('shows save errors in the form and delete errors on the page', async () => {
    mockFetch({
      ...signedInRoutes(),
      'POST /appointments': {
        status: 400,
        body: errorBody('invalid_input', 'Some details need fixing', { doctor: 'Required' }),
      },
      'DELETE /appointments/appt-1': {
        status: 403,
        body: errorBody('forbidden', 'Ask the elder for permission to make changes'),
      },
    });
    renderApp('/appointments');
    await userEvent.click(await screen.findByRole('button', { name: 'Add visit' }));
    const form = dialog();
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('Some details need fixing');
    expect(within(form).getByLabelText('Doctor')).toHaveAccessibleDescription('Required');
    await userEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Dr. Anil Mehta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete Dr. Anil Mehta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ask the elder for permission');
  });

  it('shows an empty state, and hides editing for view-only members', async () => {
    mockFetch(
      signedInRoutes({ ...family, permission: 'view' }, { 'GET /appointments': { body: { items: [] } } }),
    );
    renderApp('/appointments');
    expect(await screen.findByText('No visits yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add visit' })).not.toBeInTheDocument();
  });
});

describe('Visit brief', () => {
  it('renders every section and prints', async () => {
    mockFetch(signedInRoutes());
    renderApp('/appointments/appt-1/brief');
    expect(await screen.findByText('Kamla takes 1 medicine.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Visit brief · Kamla Devi' })).toBeInTheDocument();
    expect(screen.getByText(/For the visit with Dr\. Anil Mehta/)).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Amlodipine' })).toBeInTheDocument();
    expect(screen.getByText(/With food/)).toBeInTheDocument();
    expect(screen.getByText('92%', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Metformin was taken 75% of the time.')).toBeInTheDocument();
    expect(screen.getByText('Are all of these still needed?')).toBeInTheDocument();
    await expectNoAxeViolations();
    await userEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(window.print).toHaveBeenCalled();
  });

  it('handles no concerns, no adherence, and errors', async () => {
    mockFetch(
      signedInRoutes(elder, {
        'GET /ai/visit-brief/appt-1': {
          body: {
            ...briefResponse,
            source: 'gemini',
            concerns: [],
            adherencePercent: null,
            appointment: appointment({ speciality: '' }),
          },
        },
        'GET /ai/visit-brief/missing': { status: 404, body: errorBody('not_found', 'Appointment not found') },
      }),
    );
    renderApp('/appointments/appt-1/brief');
    expect(await screen.findByText('Nothing in particular.')).toBeInTheDocument();
    expect(screen.queryByText(/Doses taken in the last 30 days/)).not.toBeInTheDocument();
  });

  it('shows an error for a missing visit', async () => {
    mockFetch(
      signedInRoutes(elder, {
        'GET /ai/visit-brief/missing': { status: 404, body: errorBody('not_found', 'Appointment not found') },
      }),
    );
    renderApp('/appointments/missing/brief');
    expect(await screen.findByRole('alert')).toHaveTextContent('Appointment not found');
    expect(medications.length).toBeGreaterThan(0);
  });
});
