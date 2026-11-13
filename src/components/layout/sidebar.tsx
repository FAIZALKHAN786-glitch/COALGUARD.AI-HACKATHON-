'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, ShieldCheck } from 'lucide-react';

import { NAV_GROUPS, type NavItem } from '@/config/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { cn } from '@/lib/utils';
import { BrandMark } from './brand-mark';

const STORAGE_KEY = 'coalguard.sidebar.state.v1';

interface SidebarState {
  collapsed: boolean;
  expandedGroups: string[];
}

function readState(): SidebarState {
  if (typeof window === 'undefined') return { collapsed: false, expandedGroups: NAV_GROUPS.map((g) => g.label) };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SidebarState>;
      return {
        collapsed: Boolean(parsed.collapsed),
        expandedGroups: Array.isArray(parsed.expandedGroups) ? parsed.expandedGroups : NAV_GROUPS.map((g) => g.label),
      };
    }
  } catch {
    /* ignore malformed state */
  }
  return { collapsed: false, expandedGroups: NAV_GROUPS.map((g) => g.label) };
}

export function Sidebar({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const { can } = useAuth();
  const [state, setState] = React.useState<SidebarState>({ collapsed: false, expandedGroups: [] });

  React.useEffect(() => {
    setState(readState());
  }, []);

  const persist = React.useCallback((next: SidebarState) => {
    setState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — state remains in memory */
    }
  }, []);

  const toggleGroup = (label: string) => {
    const expanded = state.expandedGroups.includes(label)
      ? state.expandedGroups.filter((entry) => entry !== label)
      : [...state.expandedGroups, label];
    persist({ ...state, expandedGroups: expanded });
  };

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => can(item.permission)),
  })).filter((group) => group.items.length > 0);

  return (
    <nav
      aria-label="Primary navigation"
      className={cn(
        'relative isolate flex h-screen flex-col overflow-hidden bg-graphite-950 text-graphite-100',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-56 bg-[radial-gradient(60%_100%_at_20%_0%,hsl(var(--primary)/0.18),transparent_70%)]"
      />
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
      />

      <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-white/20 px-4">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="group flex min-w-0 items-center rounded-lg py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <BrandMark className="[&_span]:text-white [&_span_span]:text-graphite-200" />
        </Link>
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white/10 text-graphite-200 ring-1 ring-inset ring-white/10"
          aria-hidden="true"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
        </span>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-3 py-4">
        {visibleGroups.map((group, index) => {
          const expanded = state.expandedGroups.includes(group.label);
          const panelId = `nav-group-${group.label.replace(/\s+/g, '-').toLowerCase()}`;
          return (
            <div
              key={group.label}
              className={cn(index > 0 && 'mt-4 border-t border-white/10 pt-3')}
            >
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                aria-expanded={expanded}
                aria-controls={panelId}
                className="group mb-1 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-graphite-300 transition-colors hover:bg-white/10 hover:text-graphite-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
              >
                <span className="flex-1 truncate text-left">{group.label}</span>
                <span
                  className="rounded-full bg-white/10 px-1.5 py-px text-[10px] font-semibold tabular-nums text-graphite-400 transition-colors group-hover:bg-white/15 group-hover:text-graphite-200"
                  aria-hidden="true"
                >
                  {group.items.length}
                </span>
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 transition-transform duration-200',
                    expanded ? '' : '-rotate-90',
                  )}
                  aria-hidden="true"
                />
              </button>
              <ul id={panelId} className={cn('space-y-0.5', expanded ? '' : 'hidden')}>
                {group.items.map((item) => (
                  <li key={item.href}>
                    <SidebarLink item={item} pathname={pathname} onNavigate={onNavigate} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="shrink-0 border-t border-white/10 p-3">
        <div className="rounded-lg border border-white/10 bg-white/5 p-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-graphite-100">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            Backend-enforced access
          </p>
          <p className="mt-1 pl-[1.25rem] text-[10.5px] leading-relaxed text-graphite-300">
            Interface visibility is a usability aid only.
          </p>
        </div>
      </div>
    </nav>
  );
}

function SidebarLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
        active
          ? 'bg-copper/10 font-medium text-copper-700 shadow-[inset_0_0_0_1px_rgb(185_120_72/0.2)]'
          : 'text-graphite-200 hover:bg-white/10 hover:text-graphite-50',
      )}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-copper-500 shadow-[0_0_10px_hsl(var(--primary)/0.5)]"
        />
      )}
      <Icon
        className={cn(
          'h-4 w-4 shrink-0 transition-transform duration-150 group-hover:scale-105',
          active ? 'text-copper-700' : 'text-graphite-300 group-hover:text-graphite-100',
        )}
        aria-hidden="true"
      />
      <span className="truncate">{item.title}</span>
    </Link>
  );
}
