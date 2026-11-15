import { z } from 'zod';
import { LANGUAGES, MED_FORMS, PERMISSIONS } from './types';
import { isValidTimeZone } from './time';

/** Input validation for every API request. Limits keep payloads and storage small. */

const LIMITS = { name: 60, dose: 40, text: 500, timesPerDay: 8 } as const;

const trimmed = (max: number) => z.string().trim().min(1).max(max);
const optionalText = z.string().trim().max(LIMITS.text).default('');

export const passcodeSchema = z.string().regex(/^\d{6}$/, 'Passcode must be 6 digits');
export const circleCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .transform((code) => code.replace(/^SAANJH-?/, '').replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^[A-HJ-NP-Z2-9]{8}$/, 'Circle code is 8 letters and numbers'));

export const dateSchema = z.iso.date();
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:MM');
export const timeZoneSchema = z.string().max(64).refine(isValidTimeZone, 'Unknown time zone');
const emailSchema = z.email().max(254).toLowerCase();
const optionalEmail = z
  .union([emailSchema, z.literal(''), z.null()])
  .optional()
  .transform((value) => (value === undefined || value === '' ? null : value));

export const createCircleSchema = z.object({
  elderName: trimmed(LIMITS.name),
  timezone: timeZoneSchema,
  language: z.enum(LANGUAGES).default('en'),
  email: optionalEmail,
  passcode: passcodeSchema,
});

export const lookupSchema = z.object({ code: circleCodeSchema });

export const loginSchema = z.object({
  code: circleCodeSchema,
  memberId: z.string().min(1).max(40),
  passcode: passcodeSchema,
});

export const joinSchema = z.object({
  code: circleCodeSchema,
  name: trimmed(LIMITS.name),
  role: z.enum(['family', 'caretaker']),
  email: optionalEmail,
  passcode: passcodeSchema,
});

export const circleSettingsSchema = z
  .object({
    elderName: trimmed(LIMITS.name),
    timezone: timeZoneSchema,
    language: z.enum(LANGUAGES),
    requireElderApproval: z.boolean(),
  })
  .partial();

export const memberAccessSchema = z.object({ permission: z.enum(PERMISSIONS) });

export const profileSchema = z
  .object({ name: trimmed(LIMITS.name), email: optionalEmail, notify: z.boolean() })
  .partial();

export const medicationSchema = z
  .object({
    name: trimmed(LIMITS.name),
    dose: z.string().trim().max(LIMITS.dose).default(''),
    form: z.enum(MED_FORMS).default('tablet'),
    times: z
      .array(timeSchema)
      .min(1, 'Add at least one time')
      .max(LIMITS.timesPerDay)
      .transform((times) => [...new Set(times)].sort()),
    daysOfWeek: z
      .array(z.number().int().min(0).max(6))
      .min(1, 'Choose at least one day')
      .max(7)
      .transform((days) => [...new Set(days)].sort()),
    withFood: z.boolean().default(false),
    startDate: dateSchema,
    endDate: dateSchema.nullable().default(null),
    stock: z.number().int().min(0).max(10_000).nullable().default(null),
    notes: optionalText,
  })
  .refine((m) => m.endDate === null || m.endDate >= m.startDate, {
    message: 'End date must be on or after the start date',
    path: ['endDate'],
  });

export const appointmentSchema = z.object({
  doctor: trimmed(LIMITS.name),
  speciality: z.string().trim().max(LIMITS.name).default(''),
  place: z.string().trim().max(120).default(''),
  date: dateSchema,
  time: timeSchema,
  notes: optionalText,
});

export const adherenceQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .pipe(z.union([z.literal(7), z.literal(30)]))
    .default(7),
});

export const idParamSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[\w-]+$/),
});

export const tokenSchema = z.object({ token: z.string().min(10).max(600) });

/** Base64 image of at most ~1 MB, as produced by the browser's downscaler. */
export const scanSchema = z.object({
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  data: z
    .string()
    .max(1_400_000)
    .regex(/^[A-Za-z0-9+/]+=*$/, 'Image must be base64'),
});

export type CreateCircleInput = z.infer<typeof createCircleSchema>;
export type JoinInput = z.infer<typeof joinSchema>;
export type MedicationInput = z.infer<typeof medicationSchema>;
export type AppointmentInput = z.infer<typeof appointmentSchema>;
export type CircleSettingsInput = z.infer<typeof circleSettingsSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
