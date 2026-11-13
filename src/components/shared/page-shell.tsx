'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ListPageProps {
  title: string;
  description?: string;
  headerActions?: React.ReactNode;
  headerMeta?: React.ReactNode;
  /** Filter / search toolbar rendered under the header. */
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** Standard scaffold for every list screen. */
export function ListPage({
  title,
  description,
  headerActions,
  headerMeta,
  toolbar,
  children,
  className,
}: ListPageProps) {
  return (
    <div className={cn('space-y-4', className)}>
      <PageHeader
        title={title}
        description={description}
        actions={headerActions}
        meta={headerMeta}
      />
      {toolbar}
      {children}
    </div>
  );
}

export interface DetailPageProps {
  title: string;
  description?: string;
  /** Route the back button returns to. */
  backHref: string;
  backLabel?: string;
  headerActions?: React.ReactNode;
  headerMeta?: React.ReactNode;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** Standard scaffold for every record screen. */
export function DetailPage({
  title,
  description,
  backHref,
  backLabel = 'Back to list',
  headerActions,
  headerMeta,
  toolbar,
  children,
  className,
}: DetailPageProps) {
  return (
    <div className={cn('space-y-4', className)}>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {backLabel}
          </Link>
        </Button>
      </div>
      <PageHeader
        title={title}
        description={description}
        actions={headerActions}
        meta={headerMeta}
      />
      {toolbar}
      {children}
    </div>
  );
}
