/**
 * Opaque bearer-token storage for the HTTP adapter.
 *
 * The token is issued by `POST /auth/sign-in` and is only a session
 * identifier. Authorization decisions remain on the server. Tokens are kept
 * out of URLs, logs and the service cache.
 */

const TOKEN_KEY = 'coalguard.api.token.v1';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(TOKEN_KEY) ?? window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAccessToken(token: string | null | undefined, remember = false): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(TOKEN_KEY);
    if (!token) return;
    const storage = remember ? window.localStorage : window.sessionStorage;
    storage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage can be unavailable in hardened browsers. The in-memory session
    // remains usable for the current page; the server still enforces access.
  }
}

export function clearAccessToken(): void {
  setAccessToken(null);
}
