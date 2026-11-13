import * as React from 'react';
import { Info } from 'lucide-react';

import { cn } from '@/lib/utils';

export type ProvenanceTone = 'info' | 'warning' | 'neutral';

export interface ProvenanceNoteProps {
  children: React.ReactNode;
  tone?: ProvenanceTone;
  className?: string;
  /** Short label rendered in bold before the body text. */
  label?: string;
}

const TONE_CLASSES: Record<ProvenanceTone, string> = {
  info: 'border-info/40 bg-info/5 text-foreground',
  warning: 'border-warning/50 bg-warning/5 text-foreground',
  neutral: 'border-border/80 bg-muted/40 text-foreground',
};

/**
 * A short, explicit statement about where the information on screen came from.
 * Used for computed metrics, configured thresholds and development data.
 */
export function ProvenanceNote({
  children,
  tone = 'info',
  className,
  label = 'Source',
}: ProvenanceNoteProps) {
  return (
    <p
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-xs leading-relaxed',
        TONE_CLASSES[tone],
        className,
      )}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span>
        <span className="font-semibold">{label}: </span>
        {children}
      </span>
    </p>
  );
}
