'use client';

import * as React from 'react';

import { useApiQuery } from '@/lib/api/use-services';
import type { ListQuery, ListResult } from '@/services/types';

export interface ListQueryState {
  page: number;
  pageSize: number;
  search: string;
  filters: Record<string, string>;
  sortBy: string;
  sortDir: 'asc' | 'desc';
}

export const DEFAULT_LIST_STATE: ListQueryState = {
  page: 1,
  pageSize: 20,
  search: '',
  filters: {},
  sortBy: '',
  sortDir: 'asc',
};

/**
 * Holds the list state (search, filters, sort, pagination) for a table view.
 *
 * Changing a filter or the search term resets to the first page, which is the
 * behaviour users expect from a filtered list.
 */
export function useListQueryState(
  overrides: Partial<ListQueryState> = {},
): [ListQueryState, (patch: Partial<ListQueryState>) => void, () => void] {
  const [state, setState] = React.useState<ListQueryState>({ ...DEFAULT_LIST_STATE, ...overrides });

  const update = React.useCallback((patch: Partial<ListQueryState>) => {
    setState((previous) => {
      const next = { ...previous, ...patch };
      const filtersChanged = patch.filters !== undefined;
      const searchChanged = patch.search !== undefined && patch.search !== previous.search;
      if (filtersChanged || searchChanged) next.page = 1;
      if (patch.sortBy !== undefined && patch.sortBy !== previous.sortBy) next.sortDir = 'asc';
      return next;
    });
  }, []);

  const reset = React.useCallback(() => {
    setState({ ...DEFAULT_LIST_STATE, ...overrides });
    // `overrides` is intentionally not a dependency: it is a static default set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [state, update, reset];
}

/** Converts the UI state into the service-layer query contract. */
export function toListQuery(state: ListQueryState): ListQuery {
  const filters: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(state.filters)) {
    if (value && value !== 'all') filters[key] = value;
  }
  return {
    page: state.page,
    pageSize: state.pageSize,
    search: state.search.trim() || undefined,
    sortBy: state.sortBy || undefined,
    sortDir: state.sortBy ? state.sortDir : undefined,
    filters,
  };
}

/**
 * Runs a list query through react-query using the shared query-key
 * convention, so invalidation from any mutation refreshes every view.
 */
export function useListData<T>(
  scope: string,
  state: ListQueryState,
  fetcher: (query: ListQuery) => Promise<ListResult<T>>,
) {
  const query = React.useMemo(() => toListQuery(state), [state]);
  return useApiQuery<ListResult<T>>(
    [scope, 'list', query],
    () => fetcher(query),
    { placeholderData: (previous) => previous },
  );
}
