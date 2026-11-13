'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Check,
  CheckCheck,
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { listQueryKey, useServices } from '@/lib/api/use-services';
import { formatRelative } from '@/lib/formatting/dates';
import { cn } from '@/lib/utils';
import type { AppNotification } from '@/types';

type SeverityMeta = {
  label: string;
  Icon: typeof Bell;
  tile: string;
  dot: string;
  accent: string;
};

const SEVERITY_META: Record<AppNotification['severity'], SeverityMeta> = {
  critical: {
    label: 'Critical',
    Icon: ShieldAlert,
    tile: 'bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/15',
    dot: 'bg-destructive',
    accent: 'bg-destructive',
  },
  warning: {
    label: 'Warning',
    Icon: AlertTriangle,
    tile: 'bg-warning/10 text-warning-strong ring-1 ring-inset ring-warning/20',
    dot: 'bg-warning',
    accent: 'bg-warning',
  },
  success: {
    label: 'Resolved',
    Icon: CheckCircle2,
    tile: 'bg-success/10 text-success ring-1 ring-inset ring-success/15',
    dot: 'bg-success',
    accent: 'bg-success',
  },
  info: {
    label: 'Information',
    Icon: Info,
    tile: 'bg-info/10 text-info ring-1 ring-inset ring-info/15',
    dot: 'bg-info',
    accent: 'bg-info',
  },
};

type Filter = 'all' | 'unread';

export function NotificationCenter() {
  const services = useServices();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [filter, setFilter] = React.useState<Filter>('all');

  const listQuery = useQuery({
    queryKey: listQueryKey('notifications', { pageSize: 25 }),
    queryFn: () => services.notifications.list({ pageSize: 25 }),
  });

  const unread = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => services.notifications.unreadCount(),
  });

  const markRead = useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) => services.notifications.markRead(id, read),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (error: unknown) => {
      toast.error('Could not update the notification', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => services.notifications.markAllRead(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('All notifications marked as read');
    },
    onError: (error: unknown) => {
      toast.error('Could not mark notifications as read', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    },
  });

  const items = listQuery.data?.items ?? [];
  const unreadCount = unread.data ?? 0;
  const visibleItems = filter === 'unread' ? items.filter((item) => !item.read) : items;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'relative text-muted-foreground hover:text-foreground',
            unreadCount > 0 && 'text-foreground',
          )}
          aria-label={`Notifications (${unreadCount} unread)`}
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          {unreadCount > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground ring-2 ring-background"
              aria-hidden="true"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-[min(26rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border-border/80 p-0 shadow-xl data-[state=open]:slide-in-from-top-2"
      >
        <div className="relative overflow-hidden border-b border-border/70 bg-gradient-to-br from-primary/[0.07] via-card to-card px-4 pb-3 pt-4">
          <div
            className="pointer-events-none absolute -right-10 -top-16 h-32 w-32 rounded-full bg-primary/10 blur-2xl"
            aria-hidden="true"
          />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
                <Bell className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="leading-tight">
                <DropdownMenuLabel className="p-0 text-sm font-semibold normal-case tracking-normal text-foreground">
                  Notifications
                </DropdownMenuLabel>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {unreadCount > 0 ? `${unreadCount} unread` : 'You are all caught up'}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending || unreadCount === 0}
            >
              {markAllRead.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCheck className="h-3 w-3" aria-hidden="true" />
              )}
              Mark all read
            </Button>
          </div>

          <div className="relative mt-3 flex items-center gap-1 rounded-lg bg-muted/70 p-1" role="group" aria-label="Filter notifications">
            {(['all', 'unread'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={cn(
                  'flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                  filter === value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {value === 'all' ? 'All' : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
              </button>
            ))}
          </div>
        </div>

        <ScrollArea className="max-h-[24rem] scrollbar-thin">
          {listQuery.isLoading ? (
            <div className="space-y-2 p-3" aria-live="polite">
              <span className="sr-only">Loading notifications</span>
              {[0, 1, 2].map((index) => (
                <div key={index} className="flex gap-3 rounded-lg p-2">
                  <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-muted" />
                  <div className="flex-1 space-y-1.5 pt-0.5">
                    <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                    <div className="h-2.5 w-full animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : listQuery.isError ? (
            <div className="p-3 text-sm text-destructive" role="alert">
              Notifications could not be loaded.
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-success/10 text-success ring-1 ring-inset ring-success/15">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="text-sm font-medium text-foreground">
                {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
              </p>
              <p className="max-w-[16rem] text-xs text-muted-foreground">
                {filter === 'unread'
                  ? 'Everything on your desk has been reviewed.'
                  : 'New alerts, deadlines and approvals will appear here.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {visibleItems.map((item) => {
                const meta = SEVERITY_META[item.severity] ?? SEVERITY_META.info;
                const Icon = meta.Icon;
                return (
                  <li
                    key={item.id}
                    className={cn(
                      'group relative flex gap-3 px-4 py-3 transition-colors hover:bg-muted/50',
                      !item.read && 'bg-primary/[0.035]',
                    )}
                  >
                    {!item.read && (
                      <span
                        className={cn('absolute inset-y-2 left-0 w-0.5 rounded-full', meta.accent)}
                        aria-hidden="true"
                      />
                    )}
                    <span className={cn('mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg', meta.tile)}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">{meta.label}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <p
                          className={cn(
                            'min-w-0 flex-1 text-sm leading-snug',
                            item.read ? 'font-medium text-foreground/80' : 'font-semibold text-foreground',
                          )}
                        >
                          {item.title}
                        </p>
                        {!item.read && (
                          <span
                            className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', meta.dot)}
                            aria-label="Unread"
                          />
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {item.message}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <time className="text-[11px] text-muted-foreground" dateTime={item.createdAt}>
                          {formatRelative(item.createdAt)}
                        </time>
                        {(item.relatedEntity?.href || item.actionHref) && (
                          <Link
                            href={item.relatedEntity?.href ?? item.actionHref ?? '#'}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                            onClick={() => setOpen(false)}
                          >
                            {item.actionLabel ?? 'Open record'}
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </Link>
                        )}
                        <button
                          type="button"
                          className="ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                          onClick={() => markRead.mutate({ id: item.id, read: !item.read })}
                          disabled={markRead.isPending}
                        >
                          {item.read ? (
                            <>
                              <Check className="h-3 w-3" aria-hidden="true" />
                              Read
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                              Mark read
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
        <DropdownMenuSeparator className="my-0" />
        <div className="bg-muted/30 p-2">
          <Button asChild variant="ghost" size="sm" className="group/footer w-full justify-between hover:bg-background">
            <Link href="/notifications" onClick={() => setOpen(false)}>
              Open notification centre
              <ArrowRight
                className="h-3.5 w-3.5 transition-transform group-hover/footer:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
