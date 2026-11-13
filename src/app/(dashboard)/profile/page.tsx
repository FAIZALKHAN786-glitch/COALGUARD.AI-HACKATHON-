'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, LogOut, ShieldCheck } from 'lucide-react';

import { DetailList, SectionCard } from '@/components/data-display/detail-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FormErrorSummary,
  FormProvider,
  TextInput,
  useZodForm,
} from '@/components/forms/form';
import { ListPage } from '@/components/shared/page-shell';
import { ProvenanceNote } from '@/components/shared/provenance-note';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ROLE_LABELS, permissionsFor } from '@/lib/auth/permissions';
import { useApiQuery, useServices } from '@/lib/api/use-services';
import { useAppMutation } from '@/lib/hooks/use-app-mutation';
import { formatDateTime } from '@/lib/formatting/dates';
import { initials } from '@/lib/formatting/numbers';
import { applyServerFieldErrors } from '@/lib/errors/normalise';
import { profileSchema, type ProfileFormValues } from '@/lib/validation/schemas';

export default function ProfilePage() {
  const services = useServices();
  const router = useRouter();
  const { user, session, updateProfile, signOut, isDevelopmentIdentity, can } = useAuth();

  const subsidiaries = useApiQuery(['subsidiaries', 'list'], () => services.mines.subsidiaries());
  const mines = useApiQuery(['mines', 'options'], () => services.mines.list({ pageSize: 200 }));

  const form = useZodForm<ProfileFormValues>({
    schema: profileSchema,
    defaultValues: { name: user?.name ?? '', title: user?.title ?? '' },
  });

  React.useEffect(() => {
    if (!user) return;
    form.reset({ name: user.name, title: user.title });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.name, user?.title]);

  const mutation = useAppMutation({
    mutationFn: async (values: ProfileFormValues) => {
      const parsed = profileSchema.parse(values);
      return updateProfile({ name: parsed.name, title: parsed.title });
    },
    successMessage: 'Your profile was updated.',
    invalidates: [['users'], ['audit', 'list']],
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync(values);
    } catch (error) {
      applyServerFieldErrors(error, form.setError as never);
    }
  });

  if (!user || !session) {
    return (
      <ListPage title="Profile">
        <SectionCard title="No active session">
          <p className="text-sm text-muted-foreground">
            Your session is not available. Sign in again to view your profile.
          </p>
        </SectionCard>
      </ListPage>
    );
  }

  const mineNames =
    user.mineIds.length === 0
      ? 'No explicit mine restriction'
      : user.mineIds
          .map((id) => (mines.data?.items ?? []).find((mine) => mine.id === id)?.name ?? id)
          .join(', ');

  const subsidiaryNames =
    user.subsidiaryIds.length === 0
      ? 'No explicit subsidiary restriction'
      : user.subsidiaryIds
          .map((id) => (subsidiaries.data ?? []).find((entry) => entry.id === id)?.name ?? id)
          .join(', ');

  const permissions = permissionsFor(user.role);

  return (
    <ListPage
      title="Profile & access"
      description="Your identity as the authentication service reports it, the scope your records are limited to, and the permissions your role holds."
      headerActions={
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await signOut();
            router.replace('/login');
          }}
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          Sign out
        </Button>
      }
    >
      {isDevelopmentIdentity && (
        <ProvenanceNote tone="warning" label="Development identity">
          This session was issued by the local development identity adapter. It is not a production credential
          and no password was verified. Do not use this build to make real access-control decisions.
        </ProvenanceNote>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Identity" className="lg:col-span-1">
          <div className="flex items-center gap-3">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary/12 text-lg font-semibold text-primary">
              {initials(user.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">{user.name}</p>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
              <Badge variant="outline" className="mt-1">
                <ShieldCheck className="mr-1 h-3 w-3" aria-hidden="true" />
                {ROLE_LABELS[user.role]}
              </Badge>
            </div>
          </div>

          <div className="mt-4">
            <DetailList
              columns={1}
              items={[
                { label: 'Job title', value: user.title },
                { label: 'Mine scope', value: mineNames },
                { label: 'Subsidiary scope', value: subsidiaryNames },
                {
                  label: 'Identity source',
                  value: isDevelopmentIdentity
                    ? 'Development adapter (local)'
                    : 'Configured identity provider',
                },
                { label: 'Session issued', value: formatDateTime(session.issuedAt) },
                { label: 'Session expires', value: formatDateTime(session.expiresAt) },
              ]}
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Edit profile"
          description="Only your display name and job title are editable here. Role and scope are controlled by an administrator."
          className="lg:col-span-2"
        >
          <FormProvider form={form}>
            <form onSubmit={onSubmit} className="space-y-3" noValidate>
              <FormErrorSummary form={form} />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextInput name="name" label="Display name" required />
                <TextInput name="title" label="Job title" required />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-medium">Email</p>
                  <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Changing an email address requires the identity provider&apos;s verification flow, which is
                    not available here.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">Role</p>
                  <p className="mt-1 text-sm text-muted-foreground">{ROLE_LABELS[user.role]}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {can('admin.users')
                      ? 'You can change roles from Administration.'
                      : 'Only an administrator can change roles.'}
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" loading={mutation.isPending} disabled={!form.formState.isDirty}>
                  Save profile
                </Button>
              </div>
            </form>
          </FormProvider>
        </SectionCard>
      </div>

      <SectionCard
        title="Permissions held by your role"
        description="These permissions decide what this interface renders and which actions it offers. The backend enforces the same policy independently."
        actions={
          <Badge variant="outline">
            <KeyRound className="mr-1 h-3 w-3" aria-hidden="true" />
            {permissions.length} permissions
          </Badge>
        }
      >
        <ul className="flex flex-wrap gap-1.5">
          {permissions.map((permission) => (
            <li key={permission}>
              <Badge variant="outline">{permission}</Badge>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Security notes">
        <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
          <li>
            Signing out clears the stored session on this device. It does not revoke tokens issued by an external
            identity provider.
          </li>
          <li>
            Your profile change is written by the authentication service; if that service rejects the request,
            the form shows the failure and nothing is changed.
          </li>
          <li>
            The audit trail records administrative changes. It does not record this profile edit unless the
            authentication service writes an audit event.
          </li>
        </ul>
      </SectionCard>
    </ListPage>
  );
}
