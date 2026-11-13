/**
 * In-browser store backing the CoalGuard development adapter.
 *
 * The store keeps a deterministic seeded dataset and persists mutations to
 * `localStorage` so that the demo behaves like a real database across
 * reloads. It is explicitly a DEVELOPMENT adapter — it is never used when
 * `NEXT_PUBLIC_DATA_SOURCE=api`.
 */

import { createSeedDatabase, type DevDatabase } from './seed';

export const DEV_STORAGE_KEY = 'coalguard.devdb.v1';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export class DevStore {
  private db: DevDatabase;

  constructor(now: Date = new Date()) {
    this.db = this.load(now);
  }

  private load(now: Date): DevDatabase {
    if (!isBrowser()) return createSeedDatabase(now);
    try {
      const raw = window.localStorage.getItem(DEV_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DevDatabase;
        if (parsed && Array.isArray(parsed.mines) && parsed.mines.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Corrupt payload — fall through to a fresh deterministic seed.
    }
    const seeded = createSeedDatabase(now);
    this.persist(seeded);
    return seeded;
  }

  private persist(db: DevDatabase): void {
    if (!isBrowser()) return;
    try {
      window.localStorage.setItem(DEV_STORAGE_KEY, JSON.stringify(db));
    } catch {
      // Quota or privacy-mode failures must not break the application.
    }
  }

  get data(): DevDatabase {
    return this.db;
  }

  save(): void {
    this.db.generatedAt = new Date().toISOString();
    this.persist(this.db);
  }

  reset(now: Date = new Date()): void {
    this.db = createSeedDatabase(now);
    this.persist(this.db);
  }
}

let singleton: DevStore | null = null;

export function getDevStore(): DevStore {
  if (!singleton) singleton = new DevStore();
  return singleton;
}

export function resetDevStore(): void {
  singleton?.reset();
}
