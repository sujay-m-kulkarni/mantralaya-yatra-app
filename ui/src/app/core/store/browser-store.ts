import { COLLECTIONS, DocWrite, LocalStore, YatraData, emptyData } from './local-store';

/**
 * localStorage, for `npm start` in a browser and for tests. The phone uses SQLite instead.
 * A yatra's rows live under one key, so a write replaces them in one step.
 */
export class BrowserStore implements LocalStore {
  constructor(
    private readonly storage: Storage = localStorage,
    private readonly prefix = 'myatra',
  ) {}

  async load(yatraId: string): Promise<YatraData> {
    const raw = this.storage.getItem(this.dataKey(yatraId));
    const data = emptyData();
    if (!raw) return data;
    const parsed = JSON.parse(raw) as Partial<YatraData>;
    for (const c of COLLECTIONS) (data[c] as unknown[]) = parsed[c] ?? [];
    return data;
  }

  async write(yatraId: string, docs: DocWrite[], meta: Record<string, string | null> = {}): Promise<void> {
    const data = await this.load(yatraId);
    for (const { collection, doc } of docs) {
      const list = data[collection] as { id: string }[];
      const at = list.findIndex((d) => d.id === doc.id);
      if (at >= 0) list[at] = doc;
      else list.push(doc);
    }
    this.storage.setItem(this.dataKey(yatraId), JSON.stringify(data));
    for (const [key, value] of Object.entries(meta)) await this.setMeta(key, value);
  }

  async getMeta(key: string): Promise<string | null> {
    return this.storage.getItem(`${this.prefix}:meta:${key}`);
  }

  async setMeta(key: string, value: string | null): Promise<void> {
    if (value === null) this.storage.removeItem(`${this.prefix}:meta:${key}`);
    else this.storage.setItem(`${this.prefix}:meta:${key}`, value);
  }

  async clear(yatraId: string): Promise<void> {
    this.storage.removeItem(this.dataKey(yatraId));
  }

  private dataKey(yatraId: string): string {
    return `${this.prefix}:data:${yatraId}`;
  }
}

/** An in-memory Storage, for tests. */
export class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}
