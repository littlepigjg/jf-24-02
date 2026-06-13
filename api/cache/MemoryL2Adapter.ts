import type { L2CacheAdapter } from './L2CacheAdapter.js'

interface StoredEntry {
  value: unknown
  expireAt: number
}

export class MemoryL2Adapter implements L2CacheAdapter {
  private store = new Map<string, StoredEntry>()
  private cleanupTimer: ReturnType<typeof setInterval> | null = null
  private _hits = 0
  private _misses = 0

  constructor(private readonly defaultTtlMs: number = 300_000) {}

  startCleanup(intervalMs: number = 30_000): void {
    if (this.cleanupTimer) return
    this.cleanupTimer = setInterval(() => this.evictExpired(), intervalMs)
    if (this.cleanupTimer.unref) this.cleanupTimer.unref()
  }

  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.store.get(key)
    if (!entry) {
      this._misses++
      return undefined
    }
    if (Date.now() > entry.expireAt) {
      this.store.delete(key)
      this._misses++
      return undefined
    }
    this._hits++
    return entry.value as T
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const jitter = ttlMs! * 0.1 * (Math.random() * 2 - 1)
    this.store.set(key, {
      value,
      expireAt: Date.now() + (ttlMs ?? this.defaultTtlMs) + jitter,
    })
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key)
  }

  async clear(): Promise<void> {
    this.store.clear()
  }

  async getMany<T>(keys: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>()
    for (const key of keys) {
      const val = await this.get<T>(key)
      if (val !== undefined) result.set(key, val)
    }
    return result
  }

  async setMany<T>(entries: Array<{ key: string; value: T }>, ttlMs: number): Promise<void> {
    for (const entry of entries) {
      await this.set(entry.key, entry.value, ttlMs)
    }
  }

  async deleteMany(keys: string[]): Promise<number> {
    let count = 0
    for (const key of keys) {
      if (this.store.delete(key)) count++
    }
    return count
  }

  async ping(): Promise<boolean> {
    return true
  }

  get size(): number {
    return this.store.size
  }

  get hits(): number {
    return this._hits
  }

  get misses(): number {
    return this._misses
  }

  get hitRate(): number {
    const total = this._hits + this._misses
    return total === 0 ? 0 : this._hits / total
  }

  private evictExpired(): void {
    const now = Date.now()
    for (const [key, entry] of this.store) {
      if (now > entry.expireAt) {
        this.store.delete(key)
      }
    }
  }
}
