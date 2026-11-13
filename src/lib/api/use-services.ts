'use client';

import * as React from 'react';
import { useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

import { normaliseError } from '@/lib/errors/normalise';
import { getServices } from '@/services';
import type { ListQuery, PlatformServices } from '@/services/types';

export function useServices(): PlatformServices {
  return React.useMemo(() => getServices(), []);
}

/**
 * Thin wrapper over `useQuery` that normalises thrown errors so that every
 * consumer receives a predictable `AppError`.
 */
export function useApiQuery<T>(
  queryKey: readonly unknown[],
  queryFn: (signal: AbortSignal) => Promise<T>,
  options?: Omit<UseQueryOptions<T, Error>, 'queryKey' | 'queryFn'>,
): UseQueryResult<T, Error> {
  return useQuery<T, Error>({
    queryKey,
    queryFn: ({ signal }) => queryFn(signal),
    retry: (failureCount, error) => {
      const status = normaliseError(error).status;
      if (status === 401 || status === 403 || status === 404) return false;
      return failureCount < 2;
    },
    ...options,
  });
}

/** Standard list query key builder. */
export function listQueryKey(scope: string, query?: ListQuery): readonly unknown[] {
  return [scope, 'list', query ?? {}];
}
