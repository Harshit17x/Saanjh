/**
 * Domain types shared by the server and the web client.
 * Instants are epoch milliseconds (UTC). Calendar dates are `YYYY-MM-DD` and
 * wall-clock times are `HH:MM`, both in the circle's own time zone.
 */

export const ROLES = ['elder', 'family', 'caretaker'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = ['view', 'manage'] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const LANGUAGES = ['en', 'hi'] as const;
export type Language = (typeof LANGUAGES)[number];

export const MED_FORMS = ['tablet', 'capsule', 'liquid', 'injection', 'drops', 'inhaler', 'other'] as const;
export type MedForm = (typeof MED_FORMS)[number];

export const MED_STATUSES = ['active', 'paused', 'proposed'] as const;
export type MedStatus = (typeof MED_STATUSES)[number];

export const DOSE_STATUSES = ['pending', 'taken', 'skipped', 'missed'] as const;
export type DoseStatus = (typeof DOSE_STATUSES)[number];

export interface Circle {
  id: string;
  code: string;
  elderName: string;
  timezone: string;
  language: Language;
  requireElderApproval: boolean;
  /** Last local date for which dose documents exist. */
  materialisedThrough: string;
  demo: boolean;
  createdAt: number;
}

export interface Member {
  id: string;
  circleId: string;
  name: string;
  role: Role;
  email: string | null;
  permission: Permission;
  notify: boolean;
  passcodeHash: string;
  failedAttempts: number;
  lockedUntil: number;
  createdAt: number;
}

/** A member as other members may see them: no credential fields. */
export type PublicMember = Omit<Member, 'passcodeHash' | 'failedAttempts' | 'lockedUntil'>;

/** The editable fields of a medication. */
export interface MedicationFields {
  name: string;
  dose: string;
  form: MedForm;
  times: string[];
  daysOfWeek: number[];
  withFood: boolean;
  startDate: string;
  endDate: string | null;
  stock: number | null;
  notes: string;
}

export const PROPOSAL_ACTIONS = ['create', 'update', 'pause', 'resume', 'delete'] as const;
export type ProposalAction = (typeof PROPOSAL_ACTIONS)[number];

/** A change suggested by a family member or caretaker, waiting for the elder. */
export interface Proposal {
  action: ProposalAction;
  changes: MedicationFields | null;
  by: string;
  byName: string;
  at: number;
}

export interface Medication extends MedicationFields {
  id: string;
  circleId: string;
  status: MedStatus;
  /** A change by someone other than the elder, waiting for the elder's decision. */
  pending: Proposal | null;
  createdAt: number;
  updatedAt: number;
}

export type DoseVia = 'app' | 'email';

export interface Dose {
  id: string;
  circleId: string;
  medId: string;
  medName: string;
  medDose: string;
  withFood: boolean;
  dueAt: number;
  localDate: string;
  localTime: string;
  status: DoseStatus;
  actedBy: string | null;
  actedByName: string | null;
  actedAt: number | null;
  via: DoseVia | null;
}

export interface Appointment {
  id: string;
  circleId: string;
  doctor: string;
  speciality: string;
  place: string;
  at: number;
  notes: string;
  createdBy: string;
  createdAt: number;
}

export const ACTIVITY_ACTIONS = [
  'circle.created',
  'member.joined',
  'member.updated',
  'member.removed',
  'settings.updated',
  'med.created',
  'med.updated',
  'med.paused',
  'med.resumed',
  'med.deleted',
  'med.proposed',
  'med.approved',
  'med.rejected',
  'dose.taken',
  'dose.skipped',
  'dose.undone',
  'appt.created',
  'appt.updated',
  'appt.deleted',
  'help.requested',
  'wellbeing.checkin',
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

/** How the elder says they feel in the daily check-in, best to worst. */
export const MOODS = ['great', 'good', 'okay', 'low', 'unwell'] as const;
export type Mood = (typeof MOODS)[number];

/** Check-ins that family should hear about the same day. */
export const CONCERNING_MOODS: readonly Mood[] = ['low', 'unwell'];

export interface CheckIn {
  mood: Mood;
  note: string;
  at: number;
  byName: string;
}

export interface Activity {
  id: string;
  circleId: string;
  actorId: string;
  actorName: string;
  action: ActivityAction;
  /** What the action was about, e.g. a medication name, or the mood of a check-in. */
  subject: string;
  /** Optional free text, such as the note on a check-in or a call for help. */
  detail?: string;
  at: number;
}
