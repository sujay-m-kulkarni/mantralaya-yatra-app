import { registerPlugin } from '@capacitor/core';

import { COLLECTIONS, CollectionName, DocWrite, LocalStore, YatraData, emptyData } from './local-store';

export type SqlValue = string | number | boolean | null;

export interface Statement {
  sql: string;
  args?: SqlValue[];
}

/** Implemented natively in android/app/src/main/java/app/mantralayayatra/db/DatabasePlugin.java (as in Money Trail). */
interface AppDatabasePlugin {
  query(options: { sql: string; args?: SqlValue[] }): Promise<{ rows: Record<string, SqlValue>[] }>;
  execute(options: { statements: Statement[] }): Promise<void>;
}

const AppDatabase = registerPlugin<AppDatabasePlugin>('AppDatabase');

/**
 * Schema changes, applied in order and never edited once released. Each entry runs in one transaction.
 * Rows are kept as JSON by collection: the books are small (hundreds of entries a day) and every screen
 * reads a whole yatra's rows into memory, so there is nothing to gain from a column per field yet.
 */
export const MIGRATIONS: string[][] = [
  [
    `CREATE TABLE doc (
       yatra_id TEXT NOT NULL,
       collection TEXT NOT NULL,
       id TEXT NOT NULL,
       body TEXT NOT NULL,
       PRIMARY KEY (yatra_id, collection, id)
     )`,
  ],
];

export class SqliteStore implements LocalStore {
  private ready: Promise<void> | null = null;

  constructor(private readonly db: AppDatabasePlugin = AppDatabase) {}

  async load(yatraId: string): Promise<YatraData> {
    await this.init();
    const rows = await this.query<{ collection: string; body: string }>(
      `SELECT collection, body FROM doc WHERE yatra_id = ?`,
      [yatraId],
    );
    const data = emptyData();
    for (const row of rows) {
      if ((COLLECTIONS as readonly string[]).includes(row.collection)) {
        (data[row.collection as CollectionName] as unknown[]).push(JSON.parse(row.body));
      }
    }
    return data;
  }

  async write(yatraId: string, docs: DocWrite[], meta: Record<string, string | null> = {}): Promise<void> {
    await this.init();
    await this.execute([
      ...docs.map(({ collection, doc }) => ({
        sql: `INSERT OR REPLACE INTO doc (yatra_id, collection, id, body) VALUES (?, ?, ?, ?)`,
        args: [yatraId, collection, doc.id, JSON.stringify(doc)],
      })),
      ...Object.entries(meta).map(([key, value]) => metaStatement(key, value)),
    ]);
  }

  async getMeta(key: string): Promise<string | null> {
    await this.init();
    const rows = await this.query<{ value: string }>(`SELECT value FROM app_meta WHERE key = ?`, [key]);
    return rows[0]?.value ?? null;
  }

  async setMeta(key: string, value: string | null): Promise<void> {
    await this.init();
    await this.execute([metaStatement(key, value)]);
  }

  async clear(yatraId: string): Promise<void> {
    await this.init();
    await this.execute([{ sql: `DELETE FROM doc WHERE yatra_id = ?`, args: [yatraId] }]);
  }

  private init(): Promise<void> {
    this.ready ??= this.migrate();
    return this.ready;
  }

  private async query<T>(sql: string, args: SqlValue[] = []): Promise<T[]> {
    const result = await this.db.query({ sql, args });
    return result.rows as T[];
  }

  private async execute(statements: Statement[]): Promise<void> {
    if (statements.length > 0) await this.db.execute({ statements });
  }

  private async migrate(): Promise<void> {
    await this.execute([{ sql: `CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)` }]);
    const rows = await this.query<{ value: string }>(`SELECT value FROM app_meta WHERE key = 'schema_version'`);
    const current = rows.length > 0 ? Number(rows[0].value) : 0;
    for (let version = current; version < MIGRATIONS.length; version++) {
      await this.execute([
        ...MIGRATIONS[version].map((sql) => ({ sql })),
        { sql: `INSERT OR REPLACE INTO app_meta (key, value) VALUES ('schema_version', ?)`, args: [String(version + 1)] },
      ]);
    }
  }
}

function metaStatement(key: string, value: string | null): Statement {
  return value === null
    ? { sql: `DELETE FROM app_meta WHERE key = ?`, args: [key] }
    : { sql: `INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)`, args: [key, value] };
}
