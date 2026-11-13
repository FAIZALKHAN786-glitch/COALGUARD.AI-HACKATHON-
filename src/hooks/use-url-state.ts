'use client';

import * as React from 'react';

/**
 * Persists a piece of UI state (filters, pagination, sort) in the URL query
 * string so that a refresh preserves the current view.
 */
export interface UrlStateOptions<T> {
  defaults: T;
  parse: (params: URLSearchParams) => Partial<T>;
  serialise: (state: T) => Record<string, string | undefined>;
}

export function useUrlState<T extends Record<string, unknown>>({
  defaults,
  parse,
  serialise,
}: UrlStateOptions<T>): [T, (patch: Partial<T>) => void] {
  const [state, setState] = React.useState<T>(defaults);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const parsed = parse(params);
    setState({ ...defaults, ...parsed });
    // Only run on mount — later updates are pushed by the setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = React.useCallback(
    (patch: Partial<T>) => {
      setState((previous) => {
        const next = { ...previous, ...patch };
        const params = new URLSearchParams(window.location.search);
        for (const [key, value] of Object.entries(serialise(next))) {
          if (value === undefined || value === '' || value === 'all') {
            params.delete(key);
          } else {
            params.set(key, value);
          }
        }
        const query = params.toString();
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${query ? `?${query}` : ''}`,
        );
        return next;
      });
    },
    [serialise],
  );

  return [state, update];
}
