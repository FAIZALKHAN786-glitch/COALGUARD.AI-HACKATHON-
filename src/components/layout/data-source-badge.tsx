'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FlaskConical, ShieldAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { appConfig, isDevelopmentData, usesDevelopmentIdentity } from '@/config/app';

/**
 * Makes the provenance of the data on screen explicit. Demonstration data is
 * never presented as live operational data.
 */
export function DataSourceBadge({ compact = false }: { compact?: boolean }) {
  if (!isDevelopmentData) {
    return (
      <Badge variant="success" className="gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
        Live data
      </Badge>
    );
  }
  if (compact) {
    return (
      <Badge variant="warning" className="gap-1" title="Demonstration dataset">
        Demo data
      </Badge>
    );
  }
  return (
    <Badge variant="warning" className="gap-1">
      <FlaskConical className="h-3 w-3" aria-hidden="true" />
      Demonstration dataset
    </Badge>
  );
}

export function IdentityModeBanner() {
  const router = useRouter();
  if (!usesDevelopmentIdentity) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <p>
        <span className="font-semibold">Development identity provider.</span>{' '}
        Identities below are demonstration accounts with pre-assigned roles. They are not production
        credentials and must not be treated as a security control.{' '}
        <button
          type="button"
          className="font-medium underline underline-offset-2"
          onClick={() => router.push('/login')}
        >
          Switch identity
        </button>
      </p>
    </div>
  );
}

export function DataSourceFooter() {
  if (!isDevelopmentData) return null;
  return (
    <p className="text-[11px] leading-relaxed text-muted-foreground">
      {appConfig.name} is currently running against the deterministic development adapter. All
      figures shown are demonstration records and must not be used for reporting or decisions.
    </p>
  );
}
