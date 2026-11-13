'use client';

import * as React from 'react';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';

import { normaliseError } from '@/lib/errors/normalise';

export interface AppMutationOptions<TVariables, TData> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  /** Message shown on success. A function receives the result and variables. */
  successMessage?: string | ((data: TData, variables: TVariables) => string);
  /** When false, failures are reported through `onError` only. */
  showErrorToast?: boolean;
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
  /** Query keys invalidated when the mutation succeeds. */
  invalidates?: readonly QueryKey[];
  invalidatesAll?: boolean;
}

/**
 * Thin wrapper over `useMutation` that:
 *  - normalises thrown values into an `AppError`,
 *  - surfaces a real success toast only after the request resolves,
 *  - surfaces a real failure toast when the request rejects.
 *
 * There is no code path that reports success without a successful response.
 */
export function useAppMutation<TVariables, TData>(
  options: AppMutationOptions<TVariables, TData>,
) {
  const queryClient = useQueryClient();

  const mutation = useMutation<TData, Error, TVariables>({
    mutationFn: options.mutationFn,
    onSuccess: (data, variables) => {
      if (options.invalidatesAll) {
        void queryClient.invalidateQueries();
      } else if (options.invalidates) {
        for (const key of options.invalidates) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
      }
      options.onSuccess?.(data, variables);
      const message =
        typeof options.successMessage === 'function'
          ? options.successMessage(data, variables)
          : options.successMessage;
      if (message) toast.success(message);
    },
    onError: (error, variables) => {
      const appError = normaliseError(error);
      options.onError?.(appError, variables);
      if (options.showErrorToast !== false) {
        toast.error(appError.message);
      }
    },
  });

  return mutation;
}

/** Formats a server-side validation failure for inline display. */
export function describeMutationError(error: unknown): string {
  return normaliseError(error).message;
}
