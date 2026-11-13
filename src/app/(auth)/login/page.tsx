'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Loader2, LogIn, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BrandMark } from '@/components/layout/brand-mark';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useServices } from '@/lib/api/use-services';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import { appConfig, usesDevelopmentIdentity } from '@/config/app';
import type { User } from '@/types';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn } = useAuth();
  const services = useServices();

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [identities, setIdentities] = React.useState<User[]>([]);
  const [identitiesError, setIdentitiesError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    services.auth
      .listIdentities()
      .then((list) => {
        if (!cancelled) setIdentities(list);
      })
      .catch(() => {
        if (!cancelled) {
          setIdentitiesError('Development identities could not be loaded. Configure the data source and reload.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [services]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError('Enter the email address of the identity you want to use.');
      return;
    }
    setSubmitting(true);
    try {
      const user = await signIn(email.trim(), password);
      toast.success(`Signed in as ${user.name}`);
      const next = searchParams.get('next');
      const safeNext =
        next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
      router.replace(safeNext);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign in failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="hidden flex-col justify-between bg-graphite-950 p-10 text-graphite-100 lg:flex">
        <BrandMark className="[&_span]:text-white [&_span_span]:text-graphite-300" />
        <div className="max-w-md space-y-5">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-white">
            Governance, compliance and operational oversight for coal mining.
          </h1>
          <p className="text-sm leading-relaxed text-graphite-300">
            CoalGuard.AI brings statutory compliance monitoring, inspection management, contractor
            governance, environmental tracking and AI-assisted risk analytics into one auditable
            platform across every mine and subsidiary.
          </p>
          <ul className="space-y-2 text-sm text-graphite-300">
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-copper-300" aria-hidden="true" />
              Evidence-backed compliance records with defined verification workflows.
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-copper-300" aria-hidden="true" />
              Geo-tagged field reporting for inspections, observations and incidents.
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-copper-300" aria-hidden="true" />
              A complete, tamper-evident audit trail for every recorded decision.
            </li>
          </ul>
        </div>
        <p className="text-xs text-graphite-400">
          © {new Date().getFullYear()} CoalGuard.AI. Access is restricted to authorised personnel.
        </p>
      </section>

      <section className="flex items-center justify-center bg-background p-6 sm:p-10">
        <div className="w-full max-w-md space-y-6">
          <div className="lg:hidden">
            <BrandMark />
          </div>

          <div>
            <h2 className="text-xl font-semibold tracking-tight">Sign in to {appConfig.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Use your authorised identity to continue to the governance workspace.
            </p>
          </div>

          {usesDevelopmentIdentity && (
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Development identity provider</AlertTitle>
              <AlertDescription>
                No production identity provider is configured. The accounts below are demonstration
                identities with pre-assigned roles — they are not secure credentials.
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Sign in failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.invalid"
                required
                aria-invalid={error ? true : undefined}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={usesDevelopmentIdentity ? 'Any value (development adapter)' : '••••••••'}
              />
              {usesDevelopmentIdentity && (
                <p className="text-xs text-muted-foreground">
                  The development adapter does not verify passwords. Do not enter a real password here.
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" loading={submitting} loadingLabel="Signing in…">
              {!submitting && <LogIn className="h-4 w-4" aria-hidden="true" />}
              Sign in
            </Button>
          </form>

          {usesDevelopmentIdentity && (
            <div className="space-y-2 rounded-lg border border-border bg-card p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Demonstration identities
              </p>
              {identitiesError && (
                <p className="text-xs text-destructive" role="alert">
                  {identitiesError}
                </p>
              )}
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {identities.map((identity) => (
                  <li key={identity.id}>
                    <button
                      type="button"
                      onClick={() => setEmail(identity.email)}
                      className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-foreground">{identity.name}</span>
                        <span className="block truncate text-muted-foreground">{identity.title}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
                        {ROLE_LABELS[identity.role]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground">
            Need access? Contact your administrator.{' '}
            <Link href="/access-denied" className="underline underline-offset-2">
              View access policy
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={<div className="grid min-h-screen place-items-center">Loading…</div>}>
      <LoginForm />
    </React.Suspense>
  );
}
