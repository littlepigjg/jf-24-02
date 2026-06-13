import { L1LocalCache, type L1CacheOptions } from './L1LocalCache.js'
import type { L2CacheAdapter } from './L2CacheAdapter.js'
import { MemoryL2Adapter } from './MemoryL2Adapter.js'
import { RedisL2Adapter, type RedisL2Options } from './RedisL2Adapter.js'

export interface CacheManagerOptions {
  l1?: L1CacheOptions
  l2TtlMs?: number
  l1TtlMs?: number
  nullValueTtlMs?: number
  lockTimeoutMs?: number
  useRedis?: boolean
  redis?: RedisL2Options
  namespace?: string
}

const NULL_SENTINEL = '__NULL__'
const DEFAULT_L2_TTL = 300_000
const DEFAULT_L1_TTL = 30_000
const DEFAULT_NULL_TTL = 5_000
const DEFAULT_LOCK_TIMEOUT = 3_000

export class CacheManager {
  readonly l1: L1LocalCache
  readonly l2: L2CacheAdapter
  private readonly l1TtlMs: number
  private readonly l2TtlMs: number
  private readonly nullValueTtlMs: number
  private readonly lockTimeoutMs: number
  private readonly namespace: string
  private readonly lockMap = new Map<string, Promise<unknown>>()
  private _degraded = false
  private _l2Available = true
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null

  constructor(options?: CacheManagerOptions) {
    this.l1 = new L1LocalCache(options?.l1)
    this.l1TtlMs = options?.l1TtlMs ?? DEFAULT_L1_TTL
    this.l2TtlMs = options?.l2TtlMs ?? DEFAULT_L2_TTL
    this.nullValueTtlMs = options?.nullValueTtlMs ?? DEFAULT_NULL_TTL
    this.lockTimeoutMs = options?.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT
    this.namespace = options?.namespace ?? 'qr'

    if (options?.useRedis) {
      this.l2 = new RedisL2Adapter(options.redis)
      this.initRedisConnection()
    } else {
      this.l2 = new MemoryL2Adapter(this.l2TtlMs)
      ;(this.l2 as MemoryL2Adapter).startCleanup()
    }

    this.l1.startCleanup()
  }

  private async initRedisConnection(): Promise<void> {
    try {
      await (this.l2 as RedisL2Adapter).connect()
      this._l2Available = true
      this.startHealthCheck()
    } catch {
      this._l2Available = false
      this.startHealthCheck()
    }
  }

  private startHealthCheck(intervalMs: number = 15_000): void {
    if (this.healthCheckInterval) return
    this.healthCheckInterval = setInterval(async () => {
      if (this.l2.ping) {
        try {
          this._l2Available = await this.l2.ping()
          if (this._l2Available) this._degraded = false
        } catch {
          this._l2Available = false
        }
      }
    }, intervalMs)
    if (this.healthCheckInterval.unref) this.healthCheckInterval.unref()
  }

  private nsKey(key: string): string {
    return `${this.namespace}:${key}`
  }

  async get<T>(
    key: string,
    fallback: () => Promise<T | undefined>,
  ): Promise<T | undefined> {
    const nsKey = this.nsKey(key)

    const l1Val = this.l1.get<T>(nsKey)
    if (l1Val !== undefined) {
      if ((l1Val as any) === NULL_SENTINEL) return undefined
      return l1Val
    }

    if (!this._degraded && this._l2Available) {
      try {
        const l2Val = await this.l2.get<T>(nsKey)
        if (l2Val !== undefined) {
          if ((l2Val as any) === NULL_SENTINEL) return undefined
          this.l1.set(nsKey, l2Val, this.l1TtlMs)
          return l2Val
        }
      } catch {
        this._l2Available = false
      }
    }

    return this.loadWithLock(nsKey, fallback)
  }

  private async loadWithLock<T>(
    nsKey: string,
    fallback: () => Promise<T | undefined>,
  ): Promise<T | undefined> {
    const existingLock = this.lockMap.get(nsKey)
    if (existingLock) {
      return Promise.race([
        existingLock as Promise<T | undefined>,
        this.lockTimeout(nsKey),
      ])
    }

    const loadPromise = this.executeLoad(nsKey, fallback)
    this.lockMap.set(nsKey, loadPromise)

    try {
      const result = await loadPromise
      return result
    } finally {
      this.lockMap.delete(nsKey)
    }
  }

  private lockTimeout(nsKey: string): Promise<undefined> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(undefined)
      }, this.lockTimeoutMs)
    })
  }

  private async executeLoad<T>(
    nsKey: string,
    fallback: () => Promise<T | undefined>,
  ): Promise<T | undefined> {
    try {
      const value = await fallback()

      if (value === undefined || value === null) {
        this.l1.set(nsKey, NULL_SENTINEL, this.nullValueTtlMs)
        if (!this._degraded && this._l2Available) {
          try {
            await this.l2.set(nsKey, NULL_SENTINEL, this.nullValueTtlMs)
          } catch {
            this._l2Available = false
          }
        }
        return undefined
      }

      this.l1.set(nsKey, value, this.l1TtlMs)
      if (!this._degraded && this._l2Available) {
        try {
          await this.l2.set(nsKey, value, this.l2TtlMs)
        } catch {
          this._l2Available = false
        }
      }

      return value
    } catch (err) {
      this._degraded = true
      throw err
    }
  }

  async set<T>(key: string, value: T, ttlOverride?: { l1?: number; l2?: number }): Promise<void> {
    const nsKey = this.nsKey(key)
    const l1Ttl = ttlOverride?.l1 ?? this.l1TtlMs
    const l2Ttl = ttlOverride?.l2 ?? this.l2TtlMs

    this.l1.set(nsKey, value, l1Ttl)
    if (!this._degraded && this._l2Available) {
      try {
        await this.l2.set(nsKey, value, l2Ttl)
      } catch {
        this._l2Available = false
      }
    }
  }

  async invalidate(key: string): Promise<void> {
    const nsKey = this.nsKey(key)
    this.l1.delete(nsKey)
    if (this._l2Available) {
      try {
        await this.l2.delete(nsKey)
      } catch {
        this._l2Available = false
      }
    }
  }

  async invalidateMany(keys: string[]): Promise<void> {
    const nsKeys = keys.map((k) => this.nsKey(k))
    for (const k of nsKeys) this.l1.delete(k)
    if (this._l2Available && this.l2.deleteMany) {
      try {
        await this.l2.deleteMany(nsKeys)
      } catch {
        this._l2Available = false
      }
    } else {
      for (const k of nsKeys) {
        try {
          await this.l2.delete(k)
        } catch {
          this._l2Available = false
        }
      }
    }
  }

  async invalidateByPrefix(prefix: string): Promise<number> {
    const fullPrefix = this.nsKey(prefix)
    let count = 0

    for (const key of this.l1.keys()) {
      if (key.startsWith(fullPrefix)) {
        this.l1.delete(key)
        count++
      }
    }

    return count
  }

  async warmUp<T>(entries: Array<{ key: string; value: T }>, ttlOverride?: { l1?: number; l2?: number }): Promise<void> {
    const l1Ttl = ttlOverride?.l1 ?? this.l1TtlMs
    const l2Ttl = ttlOverride?.l2 ?? this.l2TtlMs

    for (const entry of entries) {
      const nsKey = this.nsKey(entry.key)
      this.l1.set(nsKey, entry.value, l1Ttl)
    }

    if (!this._degraded && this._l2Available && this.l2.setMany) {
      try {
        await this.l2.setMany(
          entries.map((e) => ({ key: this.nsKey(e.key), value: e.value })),
          l2Ttl,
        )
      } catch {
        this._l2Available = false
        for (const entry of entries) {
          try {
            await this.l2.set(this.nsKey(entry.key), entry.value, l2Ttl)
          } catch {
            this._l2Available = false
            break
          }
        }
      }
    }
  }

  async clear(): Promise<void> {
    this.l1.clear()
    try {
      await this.l2.clear()
    } catch {
      this._l2Available = false
    }
  }

  get degraded(): boolean {
    return this._degraded
  }

  get l2Available(): boolean {
    return this._l2Available
  }

  getStats() {
    return {
      l1: {
        size: this.l1.size,
        hits: this.l1.hits,
        misses: this.l1.misses,
        hitRate: this.l1.hitRate,
      },
      l2: {
        available: this._l2Available,
        hits: 'hits' in this.l2 ? (this.l2 as any).hits : null,
        misses: 'misses' in this.l2 ? (this.l2 as any).misses : null,
        hitRate: 'hitRate' in this.l2 ? (this.l2 as any).hitRate : null,
        size: 'size' in this.l2 ? (this.l2 as any).size : null,
      },
      degraded: this._degraded,
      namespace: this.namespace,
    }
  }

  async destroy(): Promise<void> {
    this.l1.stopCleanup()
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }
    if (this.l2 instanceof MemoryL2Adapter) {
      this.l2.stopCleanup()
    }
    if (this.l2 instanceof RedisL2Adapter) {
      await this.l2.disconnect()
    }
    this.l1.clear()
    await this.l2.clear()
  }
}
