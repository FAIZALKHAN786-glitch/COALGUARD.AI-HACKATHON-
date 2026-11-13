import { describe, expect, it } from 'vitest';

import {
  canTransition,
  COMPLIANCE_TRANSITIONS,
  CORRECTIVE_ACTION_TRANSITIONS,
  deriveComplianceStatus,
  INSPECTION_TRANSITIONS,
  riskLevelFromPriority,
  SAFETY_TRANSITIONS,
  TERMINAL_CORRECTIVE_ACTION_STATUSES,
  TERMINAL_INSPECTION_STATUSES,
} from '@/lib/auth/workflows';

describe('workflow transitions', () => {
  it('allows a documented compliance transition', () => {
    expect(canTransition(COMPLIANCE_TRANSITIONS, 'draft', 'pending_submission').allowed).toBe(true);
    expect(canTransition(COMPLIANCE_TRANSITIONS, 'under_review', 'compliant').allowed).toBe(true);
  });

  it('rejects a compliance transition that skips review', () => {
    const result = canTransition(COMPLIANCE_TRANSITIONS, 'draft', 'compliant');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('cannot move');
  });

  it('rejects a transition to the same status', () => {
    const result = canTransition(INSPECTION_TRANSITIONS, 'in_progress', 'in_progress');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('already');
  });

  it('treats completed inspections and cancelled work as terminal', () => {
    expect(canTransition(INSPECTION_TRANSITIONS, 'completed', 'in_progress').allowed).toBe(false);
    expect(canTransition(INSPECTION_TRANSITIONS, 'cancelled', 'scheduled').allowed).toBe(false);
    expect(TERMINAL_INSPECTION_STATUSES).toEqual(['completed', 'cancelled']);
  });

  it('requires verification before a corrective action can be closed', () => {
    expect(canTransition(CORRECTIVE_ACTION_TRANSITIONS, 'in_progress', 'closed').allowed).toBe(false);
    expect(
      canTransition(CORRECTIVE_ACTION_TRANSITIONS, 'submitted_for_verification', 'verified').allowed,
    ).toBe(true);
    expect(canTransition(CORRECTIVE_ACTION_TRANSITIONS, 'verified', 'closed').allowed).toBe(true);
    expect(TERMINAL_CORRECTIVE_ACTION_STATUSES).toEqual(['closed']);
  });

  it('allows a rejected corrective action to be reassigned', () => {
    expect(canTransition(CORRECTIVE_ACTION_TRANSITIONS, 'rejected', 'assigned').allowed).toBe(true);
  });

  it('re-opens a resolved safety observation only through action assignment', () => {
    expect(canTransition(SAFETY_TRANSITIONS, 'resolved', 'closed').allowed).toBe(true);
    expect(canTransition(SAFETY_TRANSITIONS, 'resolved', 'open').allowed).toBe(false);
  });

  it('derives overdue only for statuses that are still in flight', () => {
    expect(deriveComplianceStatus('pending_submission', true)).toBe('overdue');
    expect(deriveComplianceStatus('submitted', true)).toBe('overdue');
    expect(deriveComplianceStatus('compliant', true)).toBe('compliant');
    expect(deriveComplianceStatus('non_compliant', true)).toBe('non_compliant');
    expect(deriveComplianceStatus('draft', true)).toBe('draft');
    expect(deriveComplianceStatus('submitted', false)).toBe('submitted');
  });

  it('maps priority to a risk level without inventing a legislative scale', () => {
    expect(riskLevelFromPriority('critical')).toBe('critical');
    expect(riskLevelFromPriority('high')).toBe('high');
    expect(riskLevelFromPriority('medium')).toBe('elevated');
    expect(riskLevelFromPriority('low')).toBe('low');
  });
});
