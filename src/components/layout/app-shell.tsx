'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, ShieldAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { NAV_INDEX, ORGANISATION_LINKS } from '@/config/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { permissionDeniedReason, type Permission } from '@/lib/auth/permissions';
import { DesktopSidebar, MobileNav, SearchTrigger } from './app-sidebar';
import { Breadcrumbs } from './breadcrumbs';
import { DataSourceBadge, IdentityModeBanner } from './data-source-badge';
import { GlobalSearch } from './global-search';
import { NotificationCenter } from './notification-center';
import { UserMenu } from './user-menu';
const COLLAPSE_KEY = 'coalguard.sidebar.collapsed.v1';

/**
 * Every navigable route with the permission it requires. Detail routes inherit
 * the permission of their parent list route (longest prefix match).
 */
const GUARDED_ROUTES: { href: string; permission: Permission; title: string }[] = [
  ...NAV_INDEX,
  ...ORGANISATION_LINKS,
]
  .map((item) => ({ href: item.href, permission: item.permission, title: item.title }))
  .sort((left, right) => right.href.length - left.href.length);

function routePermission(pathname: string) {
  return GUARDED_ROUTES.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);

  React.useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === 'true');
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    if (status === 'anonymous') {
      const target = pathname === '/login' ? pathname : `/login?next=${encodeURIComponent(pathname)}`;
      router.replace(target);
    }
  }, [pathname, router, status]);

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.getAttribute('role') === 'combobox');
      if (event.key === '/' && !isTyping) {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((previous) => {
      const next = !previous;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Loading your workspace...
        </p>
      </div>
    );
  }

  if (status === 'anonymous') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-sm text-center">
          <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-warning-strong" aria-hidden="true" />
          <p className="text-sm font-medium">Redirecting to sign in...</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/login">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Go to sign in
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const requiredRoute = routePermission(pathname);
  if (requiredRoute && !can(requiredRoute.permission)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md space-y-3 text-center">
          <ShieldAlert className="mx-auto h-9 w-9 text-destructive" aria-hidden="true" />
          <h1 className="text-lg font-semibold">Access denied</h1>
          <p className="text-sm text-muted-foreground">
            Your role cannot open {requiredRoute.title}.{' '}
            {permissionDeniedReason(requiredRoute.permission)}
          </p>
          <p className="text-xs text-muted-foreground">
            This is a presentation control. The backend enforces the same policy independently.
          </p>
          <div className="flex justify-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to dashboard
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/profile">View my permissions</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <DesktopSidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass-surface sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 px-3 sm:px-5">
          <MobileNav />
          <div className="hidden min-w-0 flex-1 md:block">
            <Breadcrumbs />
          </div>
          <div className="flex flex-1 items-center justify-end gap-1 md:flex-none">
            <div className="hidden lg:block">
              <DataSourceBadge />
            </div>
            <SearchTrigger onClick={() => setSearchOpen(true)} />
            <NotificationCenter />
            <UserMenu />
          </div>
        </header>

        <main id="main-content" className="flex-1 overflow-x-hidden overflow-y-auto px-3 py-5 sm:px-5 lg:px-7 lg:py-6">
          <div className="mx-auto w-full max-w-[1600px] space-y-6 animate-enter">
            <IdentityModeBanner />
            {children}
          </div>
        </main>

        <footer className="border-t border-border/70 px-4 py-4 text-center text-[11px] text-muted-foreground sm:px-6">
          CoalGuard.AI - Smart governance &amp; compliance monitoring for the coal mining sector.
          Records shown depend on the active data source.
        </footer>
      </div>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
