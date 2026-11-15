import type { Activity, Appointment, Circle, Dose, Medication, Member } from '../../shared/types';

/**
 * Persistence port. Services depend on this interface only; Firestore backs
 * it in production and an in-memory map backs it in tests and local runs.
 */
export interface Repository {
  createCircle(circle: Circle, elder: Member): Promise<void>;
  getCircle(id: string): Promise<Circle | null>;
  findCircleByCode(code: string): Promise<Circle | null>;
  updateCircle(id: string, patch: Partial<Circle>): Promise<void>;
  /** Circles whose dose documents run out before `date`. */
  listCirclesMaterialisedBefore(date: string): Promise<Circle[]>;
  listAllCircleIds(): Promise<string[]>;

  listMembers(circleId: string): Promise<Member[]>;
  getMember(circleId: string, memberId: string): Promise<Member | null>;
  createMember(member: Member): Promise<void>;
  updateMember(circleId: string, memberId: string, patch: Partial<Member>): Promise<void>;
  deleteMember(circleId: string, memberId: string): Promise<void>;

  listMedications(circleId: string): Promise<Medication[]>;
  getMedication(circleId: string, medId: string): Promise<Medication | null>;
  saveMedication(med: Medication): Promise<void>;
  deleteMedication(circleId: string, medId: string): Promise<void>;

  /** Creates doses that do not exist yet; existing doses keep their status. */
  createDosesIfAbsent(doses: Dose[]): Promise<void>;
  getDose(id: string): Promise<Dose | null>;
  updateDose(id: string, patch: Partial<Dose>): Promise<void>;
  listDosesForCircle(circleId: string, fromInstant: number, toInstant: number): Promise<Dose[]>;
  listDosesDueBetween(fromInstant: number, toInstant: number): Promise<Dose[]>;
  /** Deletes pending doses of a medication due after `afterInstant`. */
  deletePendingDosesAfter(medId: string, afterInstant: number): Promise<void>;

  listAppointments(circleId: string): Promise<Appointment[]>;
  getAppointment(circleId: string, apptId: string): Promise<Appointment | null>;
  saveAppointment(appt: Appointment): Promise<void>;
  deleteAppointment(circleId: string, apptId: string): Promise<void>;
  listAppointmentsBetween(fromInstant: number, toInstant: number): Promise<Appointment[]>;

  addActivity(entry: Activity): Promise<void>;
  listActivity(circleId: string, limit: number): Promise<Activity[]>;

  /**
   * Atomically records that something happened once (a reminder sent, a link
   * used). Returns false if the key was already claimed.
   */
  claimOnce(key: string): Promise<boolean>;
  releaseClaim(key: string): Promise<void>;

  getCached(key: string): Promise<unknown>;
  setCached(key: string, value: unknown): Promise<void>;
}
