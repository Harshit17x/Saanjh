import type { Dose, Medication, PublicMember } from '../../shared/types';

export const med = (overrides: Partial<Medication> = {}): Medication => ({
  id: 'm1',
  circleId: 'c1',
  name: 'Amlodipine',
  dose: '5 mg',
  form: 'tablet',
  times: ['20:00', '08:00'],
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  withFood: false,
  startDate: '2026-11-01',
  endDate: null,
  stock: 10,
  notes: '',
  status: 'active',
  pending: null,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

export const dose = (overrides: Partial<Dose> = {}): Dose => ({
  id: 'd1',
  circleId: 'c1',
  medId: 'm1',
  medName: 'Amlodipine',
  medDose: '5 mg',
  withFood: false,
  dueAt: 0,
  localDate: '2026-11-15',
  localTime: '08:00',
  status: 'pending',
  actedBy: null,
  actedByName: null,
  actedAt: null,
  via: null,
  ...overrides,
});

export const member = (overrides: Partial<PublicMember> = {}): PublicMember => ({
  id: 'p1',
  circleId: 'c1',
  name: 'Kamla',
  role: 'elder',
  email: 'kamla@example.com',
  permission: 'manage',
  notify: true,
  createdAt: 0,
  ...overrides,
});
