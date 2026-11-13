import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusBadge } from '@/components/data-display/status-badge';

describe('StatusBadge', () => {
  it('renders a human-readable label for a known status', () => {
    render(<StatusBadge domain="compliance" value="overdue" />);
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('never relies on colour alone: the marker is decorative and hidden from assistive technology', () => {
    const { container } = render(<StatusBadge domain="compliance" value="compliant" />);
    expect(screen.getByText('Compliant')).toBeInTheDocument();
    const marker = container.querySelector('[aria-hidden="true"]');
    expect(marker).not.toBeNull();
  });

  it('can hide the marker while keeping the text label', () => {
    const { container } = render(
      <StatusBadge domain="compliance" value="compliant" showMarker={false} />,
    );
    expect(screen.getByText('Compliant')).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('humanises an unrecognised status instead of rendering a raw enum', () => {
    render(<StatusBadge domain="compliance" value="some_new_state" />);
    expect(screen.getByText('Some New State')).toBeInTheDocument();
  });

  it('renders across every supported status domain', () => {
    const cases: { domain: Parameters<typeof StatusBadge>[0]['domain']; value: string; label: string }[] = [
      { domain: 'inspection', value: 'in_progress', label: 'In progress' },
      { domain: 'safety', value: 'under_investigation', label: 'Under investigation' },
      { domain: 'corrective_action', value: 'submitted_for_verification', label: 'Submitted for verification' },
      { domain: 'risk', value: 'elevated', label: 'Elevated risk' },
      { domain: 'priority', value: 'critical', label: 'Critical' },
      { domain: 'document', value: 'needs_review', label: 'Needs review' },
      { domain: 'measurement', value: 'exceeds_limit', label: 'Exceeds configured limit' },
      { domain: 'attendance', value: 'present', label: 'Present' },
    ];
    for (const testCase of cases) {
      const { unmount } = render(
        <StatusBadge domain={testCase.domain} value={testCase.value} />,
      );
      expect(screen.getByText(testCase.label)).toBeInTheDocument();
      unmount();
    }
  });
});
