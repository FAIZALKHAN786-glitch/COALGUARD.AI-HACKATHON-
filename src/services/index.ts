/**
 * Service factory.
 *
 * The active adapter is chosen by configuration — never by the outcome of a
 * request. A failing backend call surfaces an error; it is never silently
 * replaced with demonstration data.
 */

import { appConfig } from '@/config/app';
import { AppError } from '@/lib/errors/normalise';
import { getAccessToken } from '@/lib/api/session-token';
import { createDevServices } from './dev';
import { createHttpServices } from './http';
import type { PlatformServices } from './types';

let cached: PlatformServices | null = null;

export function getServices(): PlatformServices {
  if (cached) return cached;

  if (appConfig.dataSource === 'api') {
    if (!appConfig.apiBaseUrl) {
      throw new AppError({
        status: 0,
        code: 'configuration_error',
        message:
          'NEXT_PUBLIC_DATA_SOURCE is set to "api" but NEXT_PUBLIC_API_BASE_URL is not configured. Set the backend URL or switch to the development adapter.',
      });
    }
    cached = createHttpServices({
      baseUrl: appConfig.apiBaseUrl,
      getToken: () => getAccessToken(),
    });
  } else {
    cached = createDevServices();
  }
  return cached;
}

/** Clears the cached adapter. Used by tests and by the development reset. */
export function resetServices(): void {
  cached = null;
}

export * from './types';
export { createDevServices } from './dev';
export { createHttpServices } from './http';
