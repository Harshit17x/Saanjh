import { Firestore, type CollectionReference, type DocumentData } from '@google-cloud/firestore';
import type { Activity, Appointment, Circle, Dose, Medication, Member } from '../../../shared/types';
import type { Repository } from '../../ports/repository';

/** Firestore error code for a create() on a document that already exists. */
const ALREADY_EXISTS = 6;
/** Firestore allows at most 500 writes per batch. */
const BATCH_LIMIT = 500;
const ACTIVITY_PAGE = 50;

/**
 * Firestore-backed repository.
 *
 * Layout: circles/{id} with members, medications and activity subcollections;
 * doses, appointments, claims and cache are top-level so the reminder run can
 * query across circles with a single range query.
 * Composite indexes: see firestore.indexes.json.
 */
export class FirestoreRepository implements Repository {
  private readonly db: Firestore;

  constructor(projectId?: string) {
    this.db = new Firestore({ projectId, ignoreUndefinedProperties: true });
  }

  private circles(): CollectionReference {
    return this.db.collection('circles');
  }
  private members(circleId: string): CollectionReference {
    return this.circles().doc(circleId).collection('members');
  }
  private medications(circleId: string): CollectionReference {
    return this.circles().doc(circleId).collection('medications');
  }
  private activity(circleId: string): CollectionReference {
    return this.circles().doc(circleId).collection('activity');
  }
  private doses(): CollectionReference {
    return this.db.collection('doses');
  }
  private appointments(): CollectionReference {
    return this.db.collection('appointments');
  }

  private static data<T>(snapshot: { data(): DocumentData | undefined }): T | null {
    const data = snapshot.data();
    return data ? (data as T) : null;
  }

  async createCircle(circle: Circle, elder: Member): Promise<void> {
    const batch = this.db.batch();
    batch.create(this.circles().doc(circle.id), circle);
    batch.create(this.members(circle.id).doc(elder.id), elder);
    await batch.commit();
  }

  async getCircle(id: string): Promise<Circle | null> {
    return FirestoreRepository.data<Circle>(await this.circles().doc(id).get());
  }

  async findCircleByCode(code: string): Promise<Circle | null> {
    const snap = await this.circles().where('code', '==', code).limit(1).get();
    const doc = snap.docs[0];
    return doc ? (doc.data() as Circle) : null;
  }

  async updateCircle(id: string, patch: Partial<Circle>): Promise<void> {
    await this.circles().doc(id).update(patch);
  }

  async listCirclesMaterialisedBefore(date: string): Promise<Circle[]> {
    const snap = await this.circles().where('materialisedThrough', '<', date).get();
    return snap.docs.map((d) => d.data() as Circle);
  }

  async listAllCircleIds(): Promise<string[]> {
    const snap = await this.circles().select().get();
    return snap.docs.map((d) => d.id);
  }

  async listMembers(circleId: string): Promise<Member[]> {
    const snap = await this.members(circleId).orderBy('createdAt').get();
    return snap.docs.map((d) => d.data() as Member);
  }

  async getMember(circleId: string, memberId: string): Promise<Member | null> {
    return FirestoreRepository.data<Member>(await this.members(circleId).doc(memberId).get());
  }

  async createMember(member: Member): Promise<void> {
    await this.members(member.circleId).doc(member.id).create(member);
  }

  async updateMember(circleId: string, memberId: string, patch: Partial<Member>): Promise<void> {
    await this.members(circleId).doc(memberId).update(patch);
  }

  async deleteMember(circleId: string, memberId: string): Promise<void> {
    await this.members(circleId).doc(memberId).delete();
  }

  async listMedications(circleId: string): Promise<Medication[]> {
    const snap = await this.medications(circleId).orderBy('name').get();
    return snap.docs.map((d) => d.data() as Medication);
  }

  async getMedication(circleId: string, medId: string): Promise<Medication | null> {
    return FirestoreRepository.data<Medication>(await this.medications(circleId).doc(medId).get());
  }

  async saveMedication(med: Medication): Promise<void> {
    await this.medications(med.circleId).doc(med.id).set(med);
  }

  async deleteMedication(circleId: string, medId: string): Promise<void> {
    await this.medications(circleId).doc(medId).delete();
  }

  async createDosesIfAbsent(doses: Dose[]): Promise<void> {
    if (doses.length === 0) return;
    const refs = doses.map((d) => this.doses().doc(d.id));
    const existing = new Set((await this.db.getAll(...refs)).filter((s) => s.exists).map((s) => s.id));
    const missing = doses.filter((d) => !existing.has(d.id));
    for (let i = 0; i < missing.length; i += BATCH_LIMIT) {
      const batch = this.db.batch();
      for (const dose of missing.slice(i, i + BATCH_LIMIT)) batch.set(this.doses().doc(dose.id), dose);
      await batch.commit();
    }
  }

  async getDose(id: string): Promise<Dose | null> {
    return FirestoreRepository.data<Dose>(await this.doses().doc(id).get());
  }

  async updateDose(id: string, patch: Partial<Dose>): Promise<void> {
    await this.doses().doc(id).update(patch);
  }

  async listDosesForCircle(circleId: string, fromInstant: number, toInstant: number): Promise<Dose[]> {
    const snap = await this.doses()
      .where('circleId', '==', circleId)
      .where('dueAt', '>=', fromInstant)
      .where('dueAt', '<', toInstant)
      .orderBy('dueAt')
      .get();
    return snap.docs.map((d) => d.data() as Dose);
  }

  async listDosesDueBetween(fromInstant: number, toInstant: number): Promise<Dose[]> {
    const snap = await this.doses().where('dueAt', '>=', fromInstant).where('dueAt', '<', toInstant).get();
    return snap.docs.map((d) => d.data() as Dose);
  }

  async deletePendingDosesAfter(medId: string, afterInstant: number): Promise<void> {
    const snap = await this.doses().where('medId', '==', medId).get();
    const stale = snap.docs.filter((d) => {
      const dose = d.data() as Dose;
      return dose.status === 'pending' && dose.dueAt > afterInstant;
    });
    for (let i = 0; i < stale.length; i += BATCH_LIMIT) {
      const batch = this.db.batch();
      for (const doc of stale.slice(i, i + BATCH_LIMIT)) batch.delete(doc.ref);
      await batch.commit();
    }
  }

  async listAppointments(circleId: string): Promise<Appointment[]> {
    const snap = await this.appointments().where('circleId', '==', circleId).orderBy('at').get();
    return snap.docs.map((d) => d.data() as Appointment);
  }

  async getAppointment(circleId: string, apptId: string): Promise<Appointment | null> {
    const appt = FirestoreRepository.data<Appointment>(await this.appointments().doc(apptId).get());
    return appt?.circleId === circleId ? appt : null;
  }

  async saveAppointment(appt: Appointment): Promise<void> {
    await this.appointments().doc(appt.id).set(appt);
  }

  async deleteAppointment(circleId: string, apptId: string): Promise<void> {
    const appt = await this.getAppointment(circleId, apptId);
    if (appt) await this.appointments().doc(apptId).delete();
  }

  async listAppointmentsBetween(fromInstant: number, toInstant: number): Promise<Appointment[]> {
    const snap = await this.appointments().where('at', '>=', fromInstant).where('at', '<', toInstant).get();
    return snap.docs.map((d) => d.data() as Appointment);
  }

  async addActivity(entry: Activity): Promise<void> {
    await this.activity(entry.circleId).doc(entry.id).set(entry);
  }

  async listActivity(circleId: string, limit: number): Promise<Activity[]> {
    const snap = await this.activity(circleId)
      .orderBy('at', 'desc')
      .limit(Math.min(limit, ACTIVITY_PAGE))
      .get();
    return snap.docs.map((d) => d.data() as Activity);
  }

  async claimOnce(key: string): Promise<boolean> {
    try {
      await this.db.collection('claims').doc(key).create({ at: Date.now() });
      return true;
    } catch (error) {
      if ((error as { code?: number }).code === ALREADY_EXISTS) return false;
      throw error;
    }
  }

  async releaseClaim(key: string): Promise<void> {
    await this.db.collection('claims').doc(key).delete();
  }

  async getCached(key: string): Promise<unknown> {
    const data = FirestoreRepository.data<{ value: unknown }>(
      await this.db.collection('cache').doc(key).get(),
    );
    return data?.value ?? null;
  }

  async setCached(key: string, value: unknown): Promise<void> {
    await this.db.collection('cache').doc(key).set({ value, at: Date.now() });
  }
}
