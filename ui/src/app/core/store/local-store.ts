import { Booking, Payment, Reversal, SevaType } from '../models';

/** The kinds of rows the phone keeps for a yatra. */
export interface Collections {
  sevaTypes: SevaType;
  bookings: Booking;
  payments: Payment;
  reversals: Reversal;
}

export type CollectionName = keyof Collections;

export const COLLECTIONS: readonly CollectionName[] = ['sevaTypes', 'bookings', 'payments', 'reversals'];

export type YatraData = { [K in CollectionName]: Collections[K][] };

export interface DocWrite<K extends CollectionName = CollectionName> {
  collection: K;
  doc: Collections[K];
}

/**
 * Where the phone keeps its copy of a yatra's books, and a few settings.
 * Rows are kept per yatra. Writes in one call are applied together: all of them, or none.
 *
 * On Android this is SQLite (SqliteStore); in a browser during development it is localStorage (BrowserStore).
 */
export interface LocalStore {
  load(yatraId: string): Promise<YatraData>;

  /** Inserts or replaces rows by id, and sets meta values, in one transaction. */
  write(yatraId: string, docs: DocWrite[], meta?: Record<string, string | null>): Promise<void>;

  getMeta(key: string): Promise<string | null>;

  setMeta(key: string, value: string | null): Promise<void>;

  /** Removes everything kept for a yatra, e.g. after leaving it. */
  clear(yatraId: string): Promise<void>;
}

export function emptyData(): YatraData {
  return { sevaTypes: [], bookings: [], payments: [], reversals: [] };
}
