'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

import { NAV_INDEX } from '@/config/navigation';
import { cn } from '@/lib/utils';

export interface Crumb {
  label: string;
  href?: string;
}

const LABEL_OVERRIDES: Record<string, string> = {
  compliance: 'Compliance',
  inspections: 'Inspections',
  'corrective-actions': 'Corrective actions',
  environment: 'Environment',
  production: 'Production',
  contractors: 'Contractors',
  workforce: 'Workforce',
  documents: 'Documents',
  analytics: 'AI analytics',
  notifications: 'Notifications',
  administrative: 'Administration',
};

export function Breadcrumbs({ items }: { items?: Crumb[] }) {
  const pathname = usePathname();

  const crumbs = React.useMemo<Crumb[]>(() => {
    if (items && items.length > 0) return items;
    const segments = pathname.split('/').filter(Boolean);
    const crumbs: Crumb[] = [{ label: 'Home', href: '/dashboard' }];
    let accumulated = '';
    segments.forEach((segment, index) => {
      accumulated += `/${segment}`;
      const navMatch = NAV_INDEX.find((item) => item.href === accumulated);
      const isLast = index === segments.length - 1;
      crumbs.push({
        label: navMatch?.title ?? LABEL_OVERRIDES[segment] ?? humanise(segment),
        href: navMatch?.href ?? (isLast ? undefined : accumulated),
      });
    });
    return crumbs;
  }, [items, pathname]);

  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
              {crumb.href && !isLast ? (
                <Link href={crumb.href} className="rounded hover:text-foreground hover:underline">
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current={isLast ? 'page' : undefined} className={cn(isLast && 'font-medium text-foreground')}>
                  {crumb.label}
                </span>
              )}
              {!isLast && <ChevronRight className="h-3 w-3" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function humanise(value: string): string {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
