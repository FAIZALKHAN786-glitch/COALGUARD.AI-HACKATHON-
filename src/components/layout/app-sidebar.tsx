'use client';

import * as React from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Sidebar } from './sidebar';

/**
 * Desktop navigation rail. Hidden below the `lg` breakpoint — on smaller
 * viewports the `MobileNav` component provides an equivalent drawer.
 */
export function DesktopSidebar({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  return (
    <div className="relative hidden h-screen shrink-0 lg:block">
      <Sidebar className={collapsed ? 'h-screen w-[4.25rem]' : 'h-screen w-64'} />
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onToggleCollapsed}
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        className="absolute -right-3 top-[3.1rem] z-20 rounded-full border border-white/20 bg-graphite-900 text-graphite-100 hover:bg-graphite-800 hover:text-graphite-50"
      >
        {collapsed ? (
          <PanelLeftOpen className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <PanelLeftClose className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </Button>
    </div>
  );
}

/** Mobile navigation drawer trigger plus the drawer itself. */
export function MobileNav() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label="Open navigation menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="w-[17.5rem] gap-0 border-r-white/20 bg-graphite-950 p-0 shadow-soft-lg [&>button]:top-[1.2rem] [&>button]:text-graphite-200 [&>button]:opacity-90 [&>button:hover]:text-graphite-50 [&>button:hover]:opacity-100"
          aria-describedby="mobile-nav-description"
        >
          <SheetTitle className="sr-only">Primary navigation</SheetTitle>
          <p id="mobile-nav-description" className="sr-only">
            Navigate between CoalGuard.AI governance modules.
          </p>
          <Sidebar onNavigate={() => setOpen(false)} className="w-full" />
        </SheetContent>
      </Sheet>
    </>
  );
}

export function SearchTrigger({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      className="h-9 w-9 justify-start p-0 text-muted-foreground lg:w-72 lg:justify-start lg:px-3"
      aria-label="Open global search"
    >
      <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="ml-2 hidden flex-1 text-left text-sm lg:inline">Search records…</span>
      <kbd className="ml-auto hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground lg:inline">
        /
      </kbd>
    </Button>
  );
}
