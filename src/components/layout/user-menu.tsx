'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, Settings, UserRound } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import { useAuth } from '@/lib/auth/AuthProvider';
import { initials } from '@/lib/formatting/numbers';

export function UserMenu() {
  const { user, signOut, isDevelopmentIdentity } = useAuth();
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  if (!user) return null;

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      toast.success('Signed out');
      router.replace('/login');
    } catch (error) {
      toast.error('Sign out failed', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-9 gap-2 px-2"
          aria-label={`Account menu for ${user.name}`}
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-semibold text-primary">
            {initials(user.name)}
          </span>
          <span className="hidden min-w-0 flex-col items-start leading-tight lg:flex">
            <span className="max-w-[10rem] truncate text-sm font-medium">{user.name}</span>
            <span className="max-w-[10rem] truncate text-[11px] text-muted-foreground">
              {ROLE_LABELS[user.role]}
            </span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="normal-case tracking-normal">
          <span className="block text-sm font-medium text-foreground">{user.name}</span>
          <span className="block text-xs font-normal text-muted-foreground">{user.email}</span>
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            {ROLE_LABELS[user.role]}
          </span>
          {isDevelopmentIdentity && (
            <span className="mt-2 block rounded border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] font-normal text-warning-foreground">
              Development identity — not a production credential.
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserRound className="h-4 w-4" aria-hidden="true" />
            Profile &amp; preferences
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/notifications">
            <Settings className="h-4 w-4" aria-hidden="true" />
            Notification settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void handleSignOut()} disabled={signingOut}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
