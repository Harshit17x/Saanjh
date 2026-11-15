import type { Activity, Appointment, Circle, Dose, Medication, Member } from '../../../shared/types';
import type { Repository } from '../../ports/repository';

const clone = <T>(value: T): T => structuredClone(value);
const memberKey = (circleId: string, id: string): string => `${circleId}/${id}`;

/**
 * In-memory repository with the same semantics as the Firestore adapter.
 * Used by tests and for local development without Google Cloud.
 */
export class MemoryRepository implements Repository {
  private readonly circles = new Map<string, Circle>();
  private readonly members = new Map<string, Member>();
  private readonly medications = new Map<string, Medication>();
  private readonly doses = new Map<string, Dose>();
  private readonly appointments = new Map<string, Appointment>();
  private readonly activity: Activity[] = [];
  private readonly claims = new Set<string>();
  private readonly cache = new Map<string, unknown>();

  createCircle(circle: Circle, elder: Member): Promise<void> {
    this.circles.set(circle.id, clone(circle));
    this.members.set(memberKey(circle.id, elder.id), clone(elder));
    return Promise.resolve();
  }

  getCircle(id: string): Promise<Circle | null> {
    const circle = this.circles.get(id);
    return Promise.resolve(circle ? clone(circle) : null);
  }

  findCircleByCode(code: string): Promise<Circle | null> {
    const circle = [...this.circles.values()].find((c) => c.code === code);
    return Promise.resolve(circle ? clone(circle) : null);
  }

  updateCircle(id: string, patch: Partial<Circle>): Promise<void> {
    const circle = this.circles.get(id);
    if (circle) this.circles.set(id, { ...circle, ...clone(patch) });
    return Promise.resolve();
  }

  listCirclesMaterialisedBefore(date: string): Promise<Circle[]> {
    return Promise.resolve([...this.circles.values()].filter((c) => c.materialisedThrough < date).map(clone));
  }

  listAllCircleIds(): Promise<string[]> {
    return Promise.resolve([...this.circles.keys()]);
  }

  listMembers(circleId: string): Promise<Member[]> {
    return Promise.resolve(
      [...this.members.values()]
        .filter((m) => m.circleId === circleId)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(clone),
    );
  }

  getMember(circleId: string, memberId: string): Promise<Member | null> {
    const member = this.members.get(memberKey(circleId, memberId));
    return Promise.resolve(member ? clone(member) : null);
  }

  createMember(member: Member): Promise<void> {
    this.members.set(memberKey(member.circleId, member.id), clone(member));
    return Promise.resolve();
  }

  updateMember(circleId: string, memberId: string, patch: Partial<Member>): Promise<void> {
    const key = memberKey(circleId, memberId);
    const member = this.members.get(key);
    if (member) this.members.set(key, { ...member, ...clone(patch) });
    return Promise.resolve();
  }

  deleteMember(circleId: string, memberId: string): Promise<void> {
    this.members.delete(memberKey(circleId, memberId));
    return Promise.resolve();
  }

  listMedications(circleId: string): Promise<Medication[]> {
    return Promise.resolve(
      [...this.medications.values()]
        .filter((m) => m.circleId === circleId)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(clone),
    );
  }

  getMedication(circleId: string, medId: string): Promise<Medication | null> {
    const med = this.medications.get(medId);
    return Promise.resolve(med?.circleId === circleId ? clone(med) : null);
  }

  saveMedication(med: Medication): Promise<void> {
    this.medications.set(med.id, clone(med));
    return Promise.resolve();
  }

  deleteMedication(circleId: string, medId: string): Promise<void> {
    if (this.medications.get(medId)?.circleId === circleId) this.medications.delete(medId);
    return Promise.resolve();
  }

  createDosesIfAbsent(doses: Dose[]): Promise<void> {
    for (const dose of doses) if (!this.doses.has(dose.id)) this.doses.set(dose.id, clone(dose));
    return Promise.resolve();
  }

  getDose(id: string): Promise<Dose | null> {
    const dose = this.doses.get(id);
    return Promise.resolve(dose ? clone(dose) : null);
  }

  updateDose(id: string, patch: Partial<Dose>): Promise<void> {
    const dose = this.doses.get(id);
    if (dose) this.doses.set(id, { ...dose, ...clone(patch) });
    return Promise.resolve();
  }

  listDosesForCircle(circleId: string, fromInstant: number, toInstant: number): Promise<Dose[]> {
    return Promise.resolve(
      [...this.doses.values()]
        .filter((d) => d.circleId === circleId && d.dueAt >= fromInstant && d.dueAt < toInstant)
        .sort((a, b) => a.dueAt - b.dueAt)
        .map(clone),
    );
  }

  listDosesDueBetween(fromInstant: number, toInstant: number): Promise<Dose[]> {
    return Promise.resolve(
      [...this.doses.values()].filter((d) => d.dueAt >= fromInstant && d.dueAt < toInstant).map(clone),
    );
  }

  deletePendingDosesAfter(medId: string, afterInstant: number): Promise<void> {
    for (const [id, dose] of this.doses) {
      if (dose.medId === medId && dose.status === 'pending' && dose.dueAt > afterInstant)
        this.doses.delete(id);
    }
    return Promise.resolve();
  }

  listAppointments(circleId: string): Promise<Appointment[]> {
    return Promise.resolve(
      [...this.appointments.values()]
        .filter((a) => a.circleId === circleId)
        .sort((a, b) => a.at - b.at)
        .map(clone),
    );
  }

  getAppointment(circleId: string, apptId: string): Promise<Appointment | null> {
    const appt = this.appointments.get(apptId);
    return Promise.resolve(appt?.circleId === circleId ? clone(appt) : null);
  }

  saveAppointment(appt: Appointment): Promise<void> {
    this.appointments.set(appt.id, clone(appt));
    return Promise.resolve();
  }

  deleteAppointment(circleId: string, apptId: string): Promise<void> {
    if (this.appointments.get(apptId)?.circleId === circleId) this.appointments.delete(apptId);
    return Promise.resolve();
  }

  listAppointmentsBetween(fromInstant: number, toInstant: number): Promise<Appointment[]> {
    return Promise.resolve(
      [...this.appointments.values()].filter((a) => a.at >= fromInstant && a.at < toInstant).map(clone),
    );
  }

  addActivity(entry: Activity): Promise<void> {
    this.activity.push(clone(entry));
    return Promise.resolve();
  }

  listActivity(circleId: string, limit: number): Promise<Activity[]> {
    return Promise.resolve(
      this.activity
        .filter((a) => a.circleId === circleId)
        .sort((a, b) => b.at - a.at)
        .slice(0, limit)
        .map(clone),
    );
  }

  claimOnce(key: string): Promise<boolean> {
    if (this.claims.has(key)) return Promise.resolve(false);
    this.claims.add(key);
    return Promise.resolve(true);
  }

  releaseClaim(key: string): Promise<void> {
    this.claims.delete(key);
    return Promise.resolve();
  }

  getCached(key: string): Promise<unknown> {
    return Promise.resolve(this.cache.has(key) ? clone(this.cache.get(key)) : null);
  }

  setCached(key: string, value: unknown): Promise<void> {
    this.cache.set(key, clone(value));
    return Promise.resolve();
  }
}
