import { describe, expect, it } from 'vitest';

import {
  assistantQuerySchema,
  complianceSchema,
  incidentSchema,
  measurementSchema,
  mineSchema,
  productionSchema,
  profileSchema,
  reportRequestSchema,
} from '@/lib/validation/schemas';

const mineInput = {
  code: 'MINE-01',
  name: 'Test mine',
  subsidiaryId: 'sub-01',
  region: 'Jharkhand',
  district: 'Dhanbad',
  state: 'Jharkhand',
  operationalStatus: 'operational' as const,
};

describe('mineSchema', () => {
  it('accepts a minimal mine with no capacity or coordinates', () => {
    const result = mineSchema.safeParse(mineInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.approvedCapacityTPA).toBeUndefined();
      expect(result.data.lat).toBeUndefined();
    }
  });

  it('treats a cleared numeric field as not supplied rather than zero', () => {
    const result = mineSchema.safeParse({ ...mineInput, approvedCapacityTPA: '' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.approvedCapacityTPA).toBeUndefined();
  });

  it('treats a cleared numeric input (NaN from valueAsNumber) as not supplied', () => {
    const result = mineSchema.safeParse({ ...mineInput, approvedCapacityTPA: Number.NaN });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.approvedCapacityTPA).toBeUndefined();
  });

  it('rejects a non-positive or fractional capacity', () => {
    expect(mineSchema.safeParse({ ...mineInput, approvedCapacityTPA: -1 }).success).toBe(false);
    expect(mineSchema.safeParse({ ...mineInput, approvedCapacityTPA: 0 }).success).toBe(false);
    expect(mineSchema.safeParse({ ...mineInput, approvedCapacityTPA: 10.5 }).success).toBe(false);
  });

  it('rejects coordinates outside the valid range', () => {
    expect(mineSchema.safeParse({ ...mineInput, lat: 95, lng: 20 }).success).toBe(false);
    expect(mineSchema.safeParse({ ...mineInput, lat: 20, lng: 200 }).success).toBe(false);
    expect(mineSchema.safeParse({ ...mineInput, lat: 23.7, lng: 86.4 }).success).toBe(true);
  });

  it('requires code, name and subsidiary', () => {
    const result = mineSchema.safeParse({ ...mineInput, code: '  ', name: '', subsidiaryId: '' });
    expect(result.success).toBe(false);
  });
});

describe('complianceSchema', () => {
  const base = {
    code: 'CMP-001',
    title: 'Quarterly return',
    description: 'Submit the configured quarterly return.',
    category: 'mine_safety' as const,
    applicableMineIds: ['mine-01'],
    priority: 'high' as const,
  };

  it('accepts a requirement with one applicable mine', () => {
    expect(complianceSchema.safeParse(base).success).toBe(true);
  });

  it('requires at least one applicable mine', () => {
    expect(complianceSchema.safeParse({ ...base, applicableMineIds: [] }).success).toBe(false);
  });

  it('rejects a due date in the wrong format', () => {
    expect(complianceSchema.safeParse({ ...base, dueDate: '31/03/2026' }).success).toBe(false);
    expect(complianceSchema.safeParse({ ...base, dueDate: '' }).success).toBe(true);
  });
});

describe('reportRequestSchema', () => {
  const base = {
    category: 'statutory_compliance' as const,
    title: 'Q1 compliance',
    mineIds: [],
    dateFrom: '2026-01-01',
    dateTo: '2026-03-31',
    format: 'csv' as const,
  };

  it('accepts a well-formed period', () => {
    expect(reportRequestSchema.safeParse(base).success).toBe(true);
  });

  it('rejects a reversed period and reports it on the start date', () => {
    const result = reportRequestSchema.safeParse({
      ...base,
      dateFrom: '2026-04-01',
      dateTo: '2026-03-31',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['dateFrom']);
    }
  });

  it('allows the same start and end date', () => {
    expect(
      reportRequestSchema.safeParse({ ...base, dateFrom: '2026-01-01', dateTo: '2026-01-01' })
        .success,
    ).toBe(true);
  });
});

describe('measurementSchema', () => {
  const base = {
    mineId: 'mine-01',
    indicator: 'air_quality_pm10' as const,
    value: 42,
    unit: 'µg/m³',
    measuredAt: '2026-04-01T09:00',
    source: 'manual' as const,
  };

  it('accepts a numeric reading', () => {
    expect(measurementSchema.safeParse(base).success).toBe(true);
  });

  it('never coerces an empty reading to zero', () => {
    const result = measurementSchema.safeParse({ ...base, value: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/numeric reading/i);
    }
  });

  it('reports a cleared number input (NaN) as a missing reading', () => {
    const result = measurementSchema.safeParse({ ...base, value: Number.NaN });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/numeric reading/i);
    }
  });

  it('accepts a genuine zero reading', () => {
    expect(measurementSchema.safeParse({ ...base, value: 0 }).success).toBe(true);
  });

  it('requires latitude and longitude to be supplied together', () => {
    expect(measurementSchema.safeParse({ ...base, lat: 23.7 }).success).toBe(false);
    expect(measurementSchema.safeParse({ ...base, lat: 23.7, lng: 86.4 }).success).toBe(true);
    expect(measurementSchema.safeParse(base).success).toBe(true);
  });
});

describe('productionSchema', () => {
  const base = {
    mineId: 'mine-01',
    date: '2026-04-01',
    shift: 'day' as const,
    productionTonnes: 1200,
    valueKind: 'reported' as const,
  };

  it('accepts reported tonnage', () => {
    expect(productionSchema.safeParse(base).success).toBe(true);
  });

  it('never coerces missing tonnage to zero', () => {
    const result = productionSchema.safeParse({ ...base, productionTonnes: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/tonnage/i);
    }
  });

  it('reports a cleared number input (NaN) as missing tonnage', () => {
    const result = productionSchema.safeParse({ ...base, productionTonnes: Number.NaN });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/tonnage/i);
    }
  });

  it('treats a cleared target as not supplied rather than zero', () => {
    const result = productionSchema.safeParse({ ...base, targetTonnes: '' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.targetTonnes).toBeUndefined();
  });

  it('requires a reason when the value is an estimate', () => {
    const result = productionSchema.safeParse({
      ...base,
      valueKind: 'estimated',
      estimateReason: '',
    });
    expect(result.success).toBe(false);
    expect(
      productionSchema.safeParse({ ...base, valueKind: 'estimated', estimateReason: 'Weighbridge offline' })
        .success,
    ).toBe(true);
  });
});

describe('incidentSchema', () => {
  const base = {
    mineId: 'mine-01',
    title: 'Roof fall',
    description: 'A small roof fall occurred in the return airway.',
    severity: 'high' as const,
    occurredAt: '2026-04-01T10:00',
    injuriesReported: 0,
  };

  it('accepts an incident with zero injuries reported', () => {
    expect(incidentSchema.safeParse(base).success).toBe(true);
  });

  it('treats a cleared downtime as not supplied rather than zero', () => {
    const result = incidentSchema.safeParse({ ...base, downtimeHours: '' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.downtimeHours).toBeUndefined();
  });

  it('rejects a negative injury count', () => {
    expect(incidentSchema.safeParse({ ...base, injuriesReported: -1 }).success).toBe(false);
  });
});

describe('profileSchema and assistantQuerySchema', () => {
  it('trims profile values', () => {
    const result = profileSchema.parse({ name: '  Anita Deshmukh ', title: ' Head of Compliance ' });
    expect(result).toEqual({ name: 'Anita Deshmukh', title: 'Head of Compliance' });
  });

  it('rejects a blank profile name', () => {
    expect(profileSchema.safeParse({ name: '   ', title: 'Officer' }).success).toBe(false);
  });

  it('rejects an empty assistant question', () => {
    expect(assistantQuerySchema.safeParse({ query: '   ' }).success).toBe(false);
  });

  it('bounds the assistant question length', () => {
    expect(assistantQuerySchema.safeParse({ query: 'a'.repeat(2001) }).success).toBe(false);
  });
});
