'use client';

import * as React from 'react';

import { useAuth } from '@/lib/auth/AuthProvider';
import { permissionDeniedReason, type Permission } from '@/lib/auth/permissions';

export interface RequirePermissionProps {
  permission: Permission;
  children: React.ReactNode;
  /**
   * Rendered instead of the children when the permission is missing.
   * Defaults to a small inline explanation.
   */
  fallback?: React.ReactNode;
  /** When false the children are hidden entirely instead of showing a fallback. */
  showFallback?: boolean;
}

/**
 * Renders `children` only when the signed-in user holds the required
 * permission. This is a *presentation* control — the backend enforces the
 * same permissions independently.
 */
export function PermissionGate({
  permission,
  children,
  fallback,
  showFallback = true,
}: RequirePermissionProps) {
  const { can } = useAuth();
  if (can(permission)) return <>{children}</>;
  if (!showFallback) return null;
  return (
    <>
      {fallback ?? (
        <p className="text-xs text-muted-foreground">{permissionDeniedReason(permission)}</p>
      )}
    </>
  );
}

/**
 * Alias kept for call sites that read better as an explicit requirement.
 * Prefer `PermissionGate` in new code.
 */
export const RequirePermission = PermissionGate;

/**
 * Inverse helper used for actions that must be hidden entirely rather than
 * disabled (for example destructive controls).
 */
export function usePermission(permission: Permission): boolean {
  const { can } = useAuth();
  return can(permission);
}
