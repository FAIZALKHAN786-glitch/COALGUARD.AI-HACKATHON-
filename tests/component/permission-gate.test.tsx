import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { canMock } = vi.hoisted(() => ({ canMock: vi.fn() }));

vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ can: canMock }),
}));

import { PermissionGate } from '@/components/shared/permission-gate';

beforeEach(() => {
  canMock.mockReset();
});

describe('PermissionGate', () => {
  it('renders the protected children when the permission is held', () => {
    canMock.mockReturnValue(true);
    render(
      <PermissionGate permission="admin.access">
        <button type="button">Open administration</button>
      </PermissionGate>,
    );
    expect(screen.getByRole('button', { name: 'Open administration' })).toBeInTheDocument();
    expect(canMock).toHaveBeenCalledWith('admin.access');
  });

  it('shows the standard explanation when the permission is missing', () => {
    canMock.mockReturnValue(false);
    render(
      <PermissionGate permission="admin.access">
        <button type="button">Open administration</button>
      </PermissionGate>,
    );
    expect(screen.queryByRole('button', { name: 'Open administration' })).toBeNull();
    expect(
      screen.getByText('Administration is restricted to system administrators.'),
    ).toBeInTheDocument();
  });

  it('renders a custom fallback when supplied', () => {
    canMock.mockReturnValue(false);
    render(
      <PermissionGate permission="audit.export" fallback={<span>Export unavailable</span>}>
        <span>Export trail</span>
      </PermissionGate>,
    );
    expect(screen.getByText('Export unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Export trail')).toBeNull();
  });

  it('can hide the protected content entirely', () => {
    canMock.mockReturnValue(false);
    const { container } = render(
      <PermissionGate permission="admin.users" showFallback={false}>
        <span>User administration</span>
      </PermissionGate>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
