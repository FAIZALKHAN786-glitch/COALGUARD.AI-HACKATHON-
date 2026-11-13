'use client';

import * as React from 'react';
import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/data-display/detail-list';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { Permission } from '@/lib/auth/permissions';

export interface TransitionOption<S extends string> {
  value: S;
  label: string;
  /** Permission required to perform this specific transition. */
  permission?: Permission;
  /** Extra explanation shown against the option. */
  description?: string;
}

export interface StatusTransitionPanelProps<S extends string> {
  title?: string;
  description?: string;
  /** The record's current status, used only for the "no transitions" message. */
  currentLabel: string;
  options: TransitionOption<S>[];
  onSubmit: (to: S, comment: string) => Promise<void>;
  pending?: boolean;
  /** Message shown when the record is in a terminal state. */
  terminalMessage?: string;
  className?: string;
}

/**
 * Renders the transitions the current user is permitted to perform.
 *
 * The allowed transition graph is passed in by the caller (from
 * `src/lib/auth/workflows.ts`), so the UI can never offer a transition the
 * workflow does not permit. The backend re-validates the transition.
 */
export function StatusTransitionPanel<S extends string>({
  title = 'Update status',
  description = 'Only transitions permitted from the current state are listed. Each change is written to the audit trail.',
  currentLabel,
  options,
  onSubmit,
  pending,
  terminalMessage,
  className,
}: StatusTransitionPanelProps<S>) {
  const [selected, setSelected] = React.useState<S | undefined>(options[0]?.value);
  const [comment, setComment] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();
  const { can } = useAuth();

  const permitted = options.filter((option) => (option.permission ? can(option.permission) : true));
  const permittedKey = permitted.map((option) => option.value).join('|');

  // Keep the selection valid when the permitted set changes.
  React.useEffect(() => {
    if (selected && permitted.some((option) => option.value === selected)) return;
    setSelected(permitted[0]?.value);
    // `permittedKey` captures the identity of the permitted set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permittedKey]);

  if (options.length === 0) {
    return (
      <SectionCard title={title} description={description} className={className}>
        <p className="text-sm text-muted-foreground">
          {terminalMessage ?? `No further transitions are available from "${currentLabel}".`}
        </p>
      </SectionCard>
    );
  }

  if (permitted.length === 0) {
    return (
      <SectionCard title={title} description={description} className={className}>
        <p className="text-sm text-muted-foreground">
          Your role cannot change this record from &ldquo;{currentLabel}&rdquo;. Contact the responsible
          officer if a transition is required.
        </p>
      </SectionCard>
    );
  }

  const active = permitted.find((option) => option.value === selected) ?? permitted[0]!;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!active) return;
    setError(undefined);
    try {
      await onSubmit(active.value, comment.trim());
      setComment('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The status could not be changed.');
    }
  };

  return (
    <SectionCard title={title} description={description} className={className}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Transition to</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {permitted.map((option) => {
              const id = `transition-${option.value}`;
              return (
                <label
                  key={option.value}
                  htmlFor={id}
                  className={cn(
                    'flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                    active?.value === option.value
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-border/80 hover:bg-accent/40',
                  )}
                >
                  <input
                    id={id}
                    type="radio"
                    name="transition"
                    value={option.value}
                    checked={active?.value === option.value}
                    onChange={() => setSelected(option.value)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">{option.label}</span>
                    {option.description && (
                      <span className="block text-xs text-muted-foreground">{option.description}</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <label htmlFor="transition-comment" className="text-sm font-medium">
            Comment <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <textarea
            id="transition-comment"
            rows={2}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            className="flex w-full rounded-md border border-input bg-white/80 px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Record why this transition is being made."
          />
        </div>

        {error && (
          <p className="text-xs font-medium text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" size="sm" loading={pending}>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          Move to {active?.label}
        </Button>
      </form>
    </SectionCard>
  );
}
