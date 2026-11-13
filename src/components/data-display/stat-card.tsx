import * as React from 'react';
import { Info } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'destructive' | 'info';
  trend?: { value: string; direction: 'up' | 'down' | 'flat' };
  href?: string;
  onClick?: () => void;
  footer?: React.ReactNode;
  className?: string;
}

const TONE_CLASSES: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'bg-primary/10 text-primary',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/15 text-warning-strong',
  destructive: 'bg-destructive/12 text-destructive',
  info: 'bg-info/12 text-info',
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  trend,
  href,
  onClick,
  footer,
  className,
}: StatCardProps) {
  const interactive = Boolean(href || onClick);
  const content = (
    <div
      className={cn(
        'flex h-full flex-col justify-between gap-3 rounded-lg border border-border/80 bg-card p-4 shadow-sm transition-shadow',
        interactive && 'hover:border-primary/40 hover:shadow-glass focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {icon && (
          <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-md', TONE_CLASSES[tone])}>
            {icon}
          </span>
        )}
      </div>
      <div className="space-y-1">
        <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">{value}</p>
        <div className="flex flex-wrap items-center gap-2">
          {trend && (
            <span
              className={cn(
                'text-xs font-medium',
                trend.direction === 'up'
                  ? 'text-success'
                  : trend.direction === 'down'
                    ? 'text-destructive'
                    : 'text-muted-foreground',
              )}
            >
              {trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '■'} {trend.value}
            </span>
          )}
          {hint && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              {hint}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="rounded-full p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`About ${label}`}
                  >
                    <Info className="h-3 w-3" aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{hint}</TooltipContent>
              </Tooltip>
            </span>
          )}
        </div>
      </div>
      {footer}
    </div>
  );

  if (href) {
    return (
      <a
        href={href}
        className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {content}
      </a>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {content}
      </button>
    );
  }
  return content;
}
