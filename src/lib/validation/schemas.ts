/**
 * Zod validation schemas for every form in the platform.
 *
 * These schemas validate *shape and plausibility only*. They never encode a
 * statutory deadline, a legal threshold or a regulatory value — those come
 * from the configured reference registers exposed by the service layer.
 */

import { z } from 'zod';

import {
  COMPLIANCE_CATEGORIES,
  COMPLIANCE_STATUSES,
  CONTRACTOR_TYPES,
  DOCUMENT_TYPES,
  ENVIRONMENTAL_INDICATORS,
  INSIGHT_REVIEW_STATUSES,
  INSPECTION_TYPES,
  MEASUREMENT_SOURCES,
  PRIORITIES,
  PRODUCTION_VALUE_KINDS,
  REPORT_CATEGORIES,
  ROLES,
  SHIFTS,
} from '@/types';

const trimmed = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be ${max} characters or fewer.`);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer.`)
    .optional()
    .or(z.literal('').transform(() => undefined));

/**
 * Converts an intentionally-empty numeric field to `undefined`.
 *
 * `NumberInput` registers with `valueAsNumber`, so a cleared number input
 * reaches the schema as `NaN` rather than `''`. Both forms mean "not
 * supplied" and must not be coerced to `0` or rejected as a type error.
 */
const blankToUndefined = (value: unknown) =>
  value === '' ||
  value === null ||
  value === undefined ||
  (typeof value === 'number' && Number.isNaN(value))
    ? undefined
    : value;

/** A calendar date in `YYYY-MM-DD` form. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD.');

const optionalIsoDate = z
  .string()
  .trim()
  .refine(
    (value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value),
    'Use the format YYYY-MM-DD.',
  )
  .optional()
  .transform((value) => (value === '' ? undefined : value));

/** Latitude / longitude pair used by geo-tagged forms. */
export const coordinateSchema = z.object({
  lat: z.number().min(-90, 'Latitude must be between -90 and 90.').max(90, 'Latitude must be between -90 and 90.'),
  lng: z.number().min(-180, 'Longitude must be between -180 and 180.').max(180, 'Longitude must be between -180 and 180.'),
});

/* -------------------------------------------------------------------------- */
/* Organisation                                                                */
/* -------------------------------------------------------------------------- */

export const mineSchema = z.object({
  code: trimmed(24, 'Mine code'),
  name: trimmed(120, 'Mine name'),
  subsidiaryId: trimmed(40, 'Subsidiary'),
  region: trimmed(80, 'Region'),
  district: trimmed(80, 'District'),
  state: trimmed(80, 'State'),
  operationalStatus: z.enum(['operational', 'partial', 'suspended', 'decommissioned']),
  approvedCapacityTPA: z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ invalid_type_error: 'Approved capacity must be a number.' })
      .int('Approved capacity must be a whole number of tonnes.')
      .positive('Approved capacity must be greater than zero.')
      .optional(),
  ),
  commissionedOn: optionalIsoDate,
  mineManagerId: optionalText(40),
  safetyOfficerId: optionalText(40),
  complianceOfficerId: optionalText(40),
  environmentalOfficerId: optionalText(40),
  contactPhone: optionalText(40),
  note: optionalText(600),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export type MineFormValues = z.input<typeof mineSchema>;
export type MineFormOutput = z.output<typeof mineSchema>;

/* -------------------------------------------------------------------------- */
/* Compliance                                                                  */
/* -------------------------------------------------------------------------- */

export const complianceSchema = z.object({
  code: trimmed(32, 'Requirement code'),
  title: trimmed(160, 'Title'),
  description: trimmed(1200, 'Description'),
  category: z.enum(COMPLIANCE_CATEGORIES),
  applicableMineIds: z.array(z.string().min(1)).min(1, 'Select at least one applicable mine.'),
  responsibleOfficerId: optionalText(40),
  sourceReference: optionalText(160),
  effectiveFrom: optionalIsoDate,
  dueDate: optionalIsoDate,
  priority: z.enum(PRIORITIES),
  submissionFrequency: z
    .enum(['once', 'monthly', 'quarterly', 'annual', 'event_based'])
    .optional(),
  notes: optionalText(800),
});

export type ComplianceFormValues = z.input<typeof complianceSchema>;
export type ComplianceFormOutput = z.output<typeof complianceSchema>;

export const complianceTransitionSchema = z.object({
  to: z.enum(COMPLIANCE_STATUSES),
  comment: optionalText(600),
});

/* -------------------------------------------------------------------------- */
/* Inspections                                                                 */
/* -------------------------------------------------------------------------- */

export const inspectionSchema = z.object({
  mineId: trimmed(40, 'Mine'),
  type: z.enum(INSPECTION_TYPES),
  inspectorId: trimmed(40, 'Inspector'),
  scheduledDate: isoDateSchema,
  scope: optionalText(800),
  complianceRecordIds: z.array(z.string()).optional(),
});

export type InspectionFormValues = z.input<typeof inspectionSchema>;
export type InspectionFormOutput = z.output<typeof inspectionSchema>;

export const findingSchema = z.object({
  description: trimmed(1200, 'Finding description'),
  category: z.enum(COMPLIANCE_CATEGORIES),
  severity: z.enum(PRIORITIES),
  isViolation: z.boolean(),
  complianceRecordIds: z.array(z.string()).optional(),
});

export type FindingFormValues = z.input<typeof findingSchema>;

/* -------------------------------------------------------------------------- */
/* Safety                                                                      */
/* -------------------------------------------------------------------------- */

export const safetyRecordSchema = z.object({
  type: z.enum(['observation', 'hazard', 'near_miss', 'incident']),
  mineId: trimmed(40, 'Mine'),
  title: trimmed(160, 'Title'),
  description: trimmed(1500, 'Description'),
  severity: z.enum(PRIORITIES),
  locationDescription: optionalText(240),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  accuracyM: z.number().nonnegative().optional(),
  assignedTo: optionalText(40),
  relatedInspectionId: optionalText(40),
});

export type SafetyRecordFormValues = z.input<typeof safetyRecordSchema>;
export type SafetyRecordFormOutput = z.output<typeof safetyRecordSchema>;

export const incidentSchema = z.object({
  mineId: trimmed(40, 'Mine'),
  title: trimmed(160, 'Title'),
  description: trimmed(1500, 'Description'),
  severity: z.enum(PRIORITIES),
  occurredAt: z.string().trim().min(1, 'The occurrence date and time is required.'),
  injuriesReported: z.coerce
    .number({ invalid_type_error: 'Enter the number of injuries reported.' })
    .int('Enter a whole number.')
    .min(0, 'Cannot be negative.'),
  downtimeHours: z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ invalid_type_error: 'Enter the downtime in hours.' })
      .nonnegative('Cannot be negative.')
      .optional(),
  ),
  locationDescription: optionalText(240),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  accuracyM: z.number().nonnegative().optional(),
  assignedTo: optionalText(40),
  relatedInspectionId: optionalText(40),
});

export type IncidentFormValues = z.input<typeof incidentSchema>;
export type IncidentFormOutput = z.output<typeof incidentSchema>;

/* -------------------------------------------------------------------------- */
/* Environment                                                                 */
/* -------------------------------------------------------------------------- */

export const measurementSchema = z
  .object({
    mineId: trimmed(40, 'Mine'),
    indicator: z.enum(ENVIRONMENTAL_INDICATORS),
    value: z.preprocess(
      blankToUndefined,
      z.coerce
        .number({
          required_error: 'Enter a numeric reading.',
          invalid_type_error: 'Enter a numeric reading.',
        })
        .finite('Enter a numeric reading.'),
    ),
    unit: trimmed(24, 'Unit'),
    measuredAt: z.string().trim().min(1, 'The measurement time is required.'),
    source: z.enum(MEASUREMENT_SOURCES),
    thresholdId: optionalText(60),
    locationDescription: optionalText(240),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    accuracyM: z.number().nonnegative().optional(),
    sampleId: optionalText(60),
    inspectionId: optionalText(40),
  })
  .refine((value) => (value.lat === undefined) === (value.lng === undefined), {
    message: 'Provide both latitude and longitude, or neither.',
    path: ['lat'],
  });

export type MeasurementFormValues = z.input<typeof measurementSchema>;
export type MeasurementFormOutput = z.output<typeof measurementSchema>;

/* -------------------------------------------------------------------------- */
/* Production                                                                  */
/* -------------------------------------------------------------------------- */

export const productionSchema = z
  .object({
    mineId: trimmed(40, 'Mine'),
    date: isoDateSchema,
    shift: z.enum(SHIFTS),
    productionTonnes: z.preprocess(
      blankToUndefined,
      z.coerce
        .number({ required_error: 'Enter the tonnage.', invalid_type_error: 'Enter the tonnage.' })
        .nonnegative('Tonnage cannot be negative.'),
    ),
    targetTonnes: z.preprocess(
      blankToUndefined,
      z.coerce.number().nonnegative('Target cannot be negative.').optional(),
    ),
    valueKind: z.enum(PRODUCTION_VALUE_KINDS),
    estimateReason: optionalText(300),
    shiftSupervisorId: optionalText(40),
    notes: optionalText(600),
  })
  .refine(
    (value) => value.valueKind !== 'estimated' || Boolean(value.estimateReason),
    {
      message: 'An estimate requires a written reason.',
      path: ['estimateReason'],
    },
  );

export type ProductionFormValues = z.input<typeof productionSchema>;
export type ProductionFormOutput = z.output<typeof productionSchema>;

/* -------------------------------------------------------------------------- */
/* Contractors                                                                  */
/* -------------------------------------------------------------------------- */

export const contractorSchema = z.object({
  code: trimmed(24, 'Contractor code'),
  name: trimmed(160, 'Contractor name'),
  type: z.enum(CONTRACTOR_TYPES),
  contactPerson: trimmed(120, 'Contact person'),
  contactEmail: z
    .string()
    .trim()
    .email('Enter a valid email address.')
    .max(160),
  contactPhone: trimmed(40, 'Contact phone'),
  registeredAddress: trimmed(400, 'Registered address'),
  mineIds: z.array(z.string().min(1)).min(1, 'Associate at least one mine.'),
  registeredOn: isoDateSchema,
  panNumber: optionalText(20),
  gstNumber: optionalText(20),
});

export type ContractorFormValues = z.input<typeof contractorSchema>;
export type ContractorFormOutput = z.output<typeof contractorSchema>;

/* -------------------------------------------------------------------------- */
/* Workforce                                                                   */
/* -------------------------------------------------------------------------- */

export const attendanceCorrectionSchema = z.object({
  correctedStatus: z.enum(['present', 'absent', 'leave', 'half_day', 'not_recorded']),
  reason: trimmed(400, 'Reason'),
});

export type AttendanceCorrectionFormValues = z.input<typeof attendanceCorrectionSchema>;

/* -------------------------------------------------------------------------- */
/* Corrective actions                                                          */
/* -------------------------------------------------------------------------- */

export const correctiveActionSchema = z.object({
  sourceType: z.enum(['inspection', 'incident', 'violation', 'observation']),
  sourceId: trimmed(60, 'Source record'),
  mineId: trimmed(40, 'Mine'),
  description: trimmed(1500, 'Description'),
  assignedTo: optionalText(40),
  priority: z.enum(PRIORITIES),
  dueDate: optionalIsoDate,
});

export type CorrectiveActionFormValues = z.input<typeof correctiveActionSchema>;
export type CorrectiveActionFormOutput = z.output<typeof correctiveActionSchema>;

/* -------------------------------------------------------------------------- */
/* Documents                                                                   */
/* -------------------------------------------------------------------------- */

export const documentUploadSchema = z.object({
  name: trimmed(200, 'File name'),
  type: z.enum(DOCUMENT_TYPES),
  mineId: optionalText(40),
  sizeBytes: z.number().int().positive('The selected file is empty.'),
});

export type DocumentUploadFormValues = z.input<typeof documentUploadSchema>;

/* -------------------------------------------------------------------------- */
/* Reporting                                                                   */
/* -------------------------------------------------------------------------- */

export const insightReviewSchema = z.object({
  reviewStatus: z.enum(INSIGHT_REVIEW_STATUSES),
  note: optionalText(800),
});

export type InsightReviewFormValues = z.input<typeof insightReviewSchema>;

export const reportRequestSchema = z
  .object({
    category: z.enum(REPORT_CATEGORIES),
    title: trimmed(160, 'Report title'),
    mineIds: z.array(z.string()),
    dateFrom: isoDateSchema,
    dateTo: isoDateSchema,
    format: z.enum(['csv', 'pdf', 'xlsx']),
    groupBy: z.enum(['mine', 'subsidiary', 'category', 'month', 'none']).optional(),
  })
  .refine((value) => value.dateFrom <= value.dateTo, {
    message: 'The start date must be on or before the end date.',
    path: ['dateFrom'],
  });

export type ReportRequestFormValues = z.input<typeof reportRequestSchema>;
export type ReportRequestFormOutput = z.output<typeof reportRequestSchema>;

/* -------------------------------------------------------------------------- */
/* Administration & profile                                                    */
/* -------------------------------------------------------------------------- */

export const userRoleSchema = z.object({
  role: z.enum(ROLES),
});

export type UserRoleFormValues = z.input<typeof userRoleSchema>;

export const profileSchema = z.object({
  name: trimmed(120, 'Name'),
  title: trimmed(120, 'Job title'),
});

export type ProfileFormValues = z.input<typeof profileSchema>;

/* -------------------------------------------------------------------------- */
/* Assistant                                                                   */
/* -------------------------------------------------------------------------- */

export const assistantQuerySchema = z.object({
  query: trimmed(2000, 'Question'),
});

export type AssistantQueryFormValues = z.input<typeof assistantQuerySchema>;

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                              */
/* -------------------------------------------------------------------------- */

/** Flattens a Zod error into a `{ field: message }` map for form display. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_root';
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}
