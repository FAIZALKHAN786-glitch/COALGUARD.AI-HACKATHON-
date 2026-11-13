/**
 * Runtime configuration for CoalGuard.AI.
 *
 * Only public, browser-safe values live here. Server-side secrets must never
 * be exposed through `NEXT_PUBLIC_*` variables.
 */

export type DataSourceMode = 'development' | 'api';
export type AuthMode = 'development' | 'oidc';

function env(name: string): string {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

export const appConfig = {
  name: env('NEXT_PUBLIC_APP_NAME') || 'CoalGuard.AI',
  tagline: 'Smart governance & compliance monitoring for the coal mining sector',
  dataSource: (env('NEXT_PUBLIC_DATA_SOURCE') === 'api' ? 'api' : 'development') as DataSourceMode,
  apiBaseUrl: env('NEXT_PUBLIC_API_BASE_URL'),
  authMode: (env('NEXT_PUBLIC_AUTH_MODE') === 'oidc' ? 'oidc' : 'development') as AuthMode,
  oidcAuthority: env('NEXT_PUBLIC_OIDC_AUTHORITY'),
  oidcClientId: env('NEXT_PUBLIC_OIDC_CLIENT_ID'),
  mapboxToken: env('NEXT_PUBLIC_MAPBOX_TOKEN'),
  mapboxStyle: env('NEXT_PUBLIC_MAPBOX_STYLE') || 'mapbox://styles/mapbox/light-v11',
  defaultLocale: env('NEXT_PUBLIC_DEFAULT_LOCALE') || 'en',
  supportedLocales: ['en', 'hi'] as const,
} as const;

export type Locale = (typeof appConfig.supportedLocales)[number];

/** True when the application is running against the deterministic demo dataset. */
export const isDevelopmentData = appConfig.dataSource === 'development';

/** True when a Mapbox token is configured. */
export const hasMapboxToken = appConfig.mapboxToken.length > 0;

/**
 * True when the platform is using the clearly-labelled development identity
 * adapter. The UI must never describe this as secure production auth.
 */
export const usesDevelopmentIdentity = appConfig.authMode === 'development';
