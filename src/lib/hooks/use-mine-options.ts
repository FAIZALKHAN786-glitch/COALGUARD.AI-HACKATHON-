'use client';

import { useApiQuery, useServices } from '@/lib/api/use-services';

export interface MineOption {
  value: string;
  label: string;
}

/**
 * Loads the mines visible to the signed-in user as select options.
 *
 * Used by every filter bar and every form that has to reference a mine, so the
 * option list is always consistent and always comes from the service layer.
 */
export function useMineOptions() {
  const services = useServices();
  const query = useApiQuery(['mines', 'options'], () => services.mines.list({ pageSize: 200 }));

  const options: MineOption[] = (query.data?.items ?? []).map((mine) => ({
    value: mine.id,
    label: `${mine.name} (${mine.code})`,
  }));

  return {
    options,
    mines: query.data?.items ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

/** Loads the subsidiaries as select options. */
export function useSubsidiaryOptions() {
  const services = useServices();
  const query = useApiQuery(['subsidiaries', 'list'], () => services.mines.subsidiaries());

  return {
    options: (query.data ?? []).map((entry) => ({ value: entry.id, label: entry.name })),
    subsidiaries: query.data ?? [],
    isLoading: query.isLoading,
  };
}

/** Loads users as select options, labelled with their role. */
export function useUserOptions() {
  const services = useServices();
  const query = useApiQuery(['users', 'options'], () => services.mines.users({ pageSize: 200 }));

  return {
    options: (query.data?.items ?? []).map((user) => ({
      value: user.id,
      label: `${user.name} — ${user.title}`,
    })),
    users: query.data?.items ?? [],
    isLoading: query.isLoading,
  };
}
