import type { AdherenceSummary } from './adherence';
import type { Activity, Appointment, Circle, Dose, Medication, PublicMember } from './types';

/** Response shapes of the HTTP API, shared so the client and server agree. */

export type PublicCircle = Omit<Circle, 'materialisedThrough'>;

export interface SessionResponse {
  circle: PublicCircle;
  member: PublicMember;
}

export interface LookupResponse {
  elderName: string;
  members: Pick<PublicMember, 'id' | 'name' | 'role'>[];
}

export interface CircleResponse {
  circle: PublicCircle;
  members: PublicMember[];
}

export interface TodayResponse {
  date: string;
  now: number;
  doses: Dose[];
  nextAppointment: Appointment | null;
  proposals: Medication[];
  lowStock: { medId: string; medName: string; daysLeft: number }[];
}

export interface DemoResponse extends SessionResponse {
  code: string;
  passcode: string;
}

export type AdherenceResponse = AdherenceSummary;

export interface ActivityResponse {
  items: Activity[];
}

export type CautionSeverity = 'info' | 'caution' | 'warning';

export interface Caution {
  severity: CautionSeverity;
  medsInvolved: string[];
  explanation: string;
  questionForDoctor: string;
}

/** Where an AI result came from: the model, or the rule-based fallback. */
export type AiSource = 'gemini' | 'rules';

export interface SafetyCheckResponse {
  source: AiSource;
  cautions: Caution[];
}

export interface DraftMedication {
  name: string;
  dose: string;
  form: string;
  times: string[];
  withFood: boolean;
  confidence: number;
}

export interface ScanResponse {
  source: AiSource;
  medications: DraftMedication[];
}

export interface DigestResponse {
  source: AiSource;
  headline: string;
  summary: string;
  encouragement: string;
}

export interface VisitBriefResponse {
  source: AiSource;
  appointment: Appointment;
  medications: Pick<Medication, 'name' | 'dose' | 'times' | 'withFood'>[];
  adherencePercent: number | null;
  overview: string;
  concerns: string[];
  questions: string[];
}

export interface ActPreviewResponse {
  action: 'take' | 'skip';
  medName: string;
  medDose: string;
  localDate: string;
  localTime: string;
  status: Dose['status'];
}

export interface ApiErrorBody {
  error: { code: string; message: string; requestId: string; fields?: Record<string, string> };
}
