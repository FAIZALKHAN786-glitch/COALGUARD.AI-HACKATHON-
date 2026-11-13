import Link from 'next/link';
import { ShieldX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = { title: 'Access denied' };

export default function AccessDeniedPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <Card className="w-full max-w-lg">
        <CardHeader className="items-center text-center">
          <ShieldX className="mb-1 h-9 w-9 text-destructive" aria-hidden="true" />
          <CardTitle>Access denied</CardTitle>
          <CardDescription>
            Your current role does not permit access to this resource. All access decisions are
            enforced by the CoalGuard backend; the interface only reflects the permissions granted
            to your identity.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            If you believe this is an error, contact your mine administrator or the platform
            administrator to have your role assignment reviewed. Every access decision is recorded
            in the audit trail.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href="/dashboard">Return to dashboard</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/login">Switch identity</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
