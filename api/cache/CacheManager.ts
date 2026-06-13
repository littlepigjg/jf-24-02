import { L1LocalCache, type L1CacheOptions } from './L1LocalCache.js'
import type { L2CacheAdapter } from './L2CacheAdapter.js'
import { MemoryL2Adapter, type MemoryL2Options } from './MemoryL2Adapter.js'
import { RedisL2Adapter, type RedisL2Options } from './RedisL2Adapter.js'
import { Singleflight, type SingleflightOptions } from '../utils/singleflight.js'
import { BloomFilter, type BloomFilterOptions } from '../utils/BloomFilter.js'
import { staggeredTtl, jitterTtlWithSeed, jitterTtl } from '../utils/ttlUtils.js'
import { CacheKeyBuilder } from '../utils/CacheKeyBuilder.js'

export interface CacheManagerOptions {
  l1?: L1CacheOptions
  l2?: MemoryL2Options
  l2TtlMs?: number
  l1TtlMs?: number
  nullValueTtlMs?: number
  singleflight?: SingleflightOptions
  useRedis?: boolean
  redis?: RedisL2Options
  namespace?: string
  bloomFilter?: BloomFilterOptions | boolean
  seedTtlByKey?: boolean
  bloomFilterStrict?: boolean
}

const NULL_SENTINEL = '__NULL__' as const
const DEFAULT_L2_TTL = 300_000
const DEFAULT_L1_TTL = 30_000
const DEFAULT_NULL_TTL = 10_000
const DEFAULT_TTL_JITTER = 0.5

export class CacheManager {
  readonly l1: L1LocalCache
  readonly l2: L2CacheAdapter
  readonly keyBuilder: CacheKeyBuilder
  private readonly singleflight: Singleflight<unknown>
  private bloomFilter: BloomFilter | null = null
  private readonly l1TtlMs: number
  private readonly l2TtlMs: number
  private readonly nullValueTtlMs: number
  private readonly namespace: string
  private readonly seedTtlByKey: boolean
  private readonly bloomFilterStrict: boolean
  private _degraded = false
  private _l2Available = true
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null
  private _bloomFilterBlocked = 0
  private _bloomFilterFalsePositives = 0
  private _bloomFilterPassThrough = 0

  constructor(options?: CacheManagerOptions) {
    this.namespace = options?.namespace ?? 'qr'
    this.seedTtlByKey = options?.seedTtlByKey ?? true
    this.bloomFilterStrict = options?.bloomFilterStrict ?? false
    this.keyBuilder = new CacheKeyBuilder(this.namespace)

    this.l1 = new L1LocalCache({
      ...options?.l1,
      ttlJitterRatio: options?.l1?.ttlJitterRatio ?? DEFAULT_TTL_JITTER,
      seedTtlByKey: options?.l1?.seedTtlByKey ?? this.seedTtlByKey,
    })
    this.l1TtlMs = options?.l1TtlMs ?? DEFAULT_L1_TTL
    this.l2TtlMs = options?.l2TtlMs ?? DEFAULT_L2_TTL
    this.nullValueTtlMs = options?.nullValueTtlMs ?? DEFAULT_NULL_TTL

    if (options?.useRedis) {
      this.l2 = new RedisL2Adapter(options.redis)
      this.initRedisConnection()
    } else {
      this.l2 = new MemoryL2Adapter({
        ...options?.l2,
        jitterRatio: options?.l2?.jitterRatio ?? DEFAULT_TTL_JITTER,
        seedTtlByKey: options?.l2?.seedTtlByKey ?? this.seedTtlByKey,
      })
      ;(this.l2 as MemoryL2Adapter).startCleanup()
    }

    this.singleflight = new Singleflight({
      timeoutMs: options?.singleflight?.timeoutMs ?? 5000,
      maxInflight: options?.singleflight?.maxInflight ?? 1000,
      cancelOnTimeout: options?.singleflight?.cancelOnTimeout ?? false,
    })

    const bfConfig = options?.bloomFilter
    if (bfConfig !== undefined && bfConfig !== false) {
      const bfOptions: BloomFilterOptions =
        typeof bfConfig === 'boolean' ? { capacity: 100_000, errorRate: 0.001 } : bfConfig
      this.bloomFilter = new BloomFilter(bfOptions)
    }

    this.l1.startCleanup()
  }

  getBloomFilter(): BloomFilter | null {
    return this.bloomFilter
  }

  initBloomFilter(options: BloomFilterOptions): void {
    this.bloomFilter = new BloomFilter(options)
  }

  populateBloomFilter(keys: string[]): void {
    if (!this.bloomFilter) {
      this.bloomFilter = new BloomFilter({ capacity: Math.max(keys.length * 4, 10_000), errorRate: 0.001 })
    }
    for (const key of keys) {
      this.bloomFilter.add(key)
    }
  }

  addToBloomFilter(key: string): void {
    if (this.bloomFilter) {
      this.bloomFilter.add(key)
    }
  }

  get bloomFilterBlocked(): number {
    return this._bloomFilterBlocked
  }

  get bloomFilterFalsePositives(): number {
    return this._bloomFilterFalsePositives
  }

  get bloomFilterPassThrough(): number {
    return this._bloomFilterPassThrough
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

  private computeL1Ttl(key: string): number {
    return this.seedTtlByKey
      ? jitterTtlWithSeed(this.l1TtlMs, key + ':l1', DEFAULT_TTL_JITTER)
      : jitterTtl(this.l1TtlMs, DEFAULT_TTL_JITTER)
  }

  private computeL2Ttl(key: string): number {
    return this.seedTtlByKey
      ? jitterTtlWithSeed(this.l2TtlMs, key + ':l2', DEFAULT_TTL_JITTER)
      : jitterTtl(this.l2TtlMs, DEFAULT_TTL_JITTER)
  }

  async get<T>(
    key: string,
    fallback: () => Promise<T | undefined>,
  ): Promise<T | undefined> {
    const l1Val = this.l1.get<T>(key)
    if (l1Val !== undefined) {
      if ((l1Val as unknown) === NULL_SENTINEL) return undefined
      return l1Val
    }

    if (!this._degraded && this._l2Available) {
      try {
        const l2Val = await this.l2.get<T>(key)
        if (l2Val !== undefined) {
          if ((l2Val as unknown) === NULL_SENTINEL) return undefined
          this.l1.set(key, l2Val, this.computeL1Ttl(key))
          return l2Val
        }
      } catch {
        this._l2Available = false
      }
    }

    if (this.bloomFilter) {
      if (!this.bloomFilter.mightContain(key)) {
        this._bloomFilterBlocked++
        if (this.bloomFilterStrict) {
          this.l1.set(key, NULL_SENTINEL, this.nullValueTtlMs)
          if (!this._degraded && this._l2Available) {
            try {
              await this.l2.set(key, NULL_SENTINEL, this.nullValueTtlMs)
            } catch {
              this._l2Available = false
            }
          }
          return undefined
        } else {
          this._bloomFilterPassThrough++
        }
      }
    }

    return this.singleflight.do(key, async () => {
      return this.executeLoad<T>(key, fallback)
    }) as Promise<T | undefined>
  }

  private async executeLoad<T>(
    key: string,
    fallback: () => Promise<T | undefined>,
  ): Promise<T | undefined> {
    try {
      const value = await fallback()

      if (value === undefined || value === null) {
        if (this.bloomFilter && !this.bloomFilter.mightContain(key)) {
          this._bloomFilterFalsePositives--
        }
        this.l1.set(key, NULL_SENTINEL, this.nullValueTtlMs)
        if (!this._degraded && this._l2Available) {
          try {
            await this.l2.set(key, NULL_SENTINEL, this.nullValueTtlMs)
          } catch {
            this._l2Available = false
          }
        }
        return undefined
      }

      if (this.bloomFilter) {
        this.bloomFilter.add(key)
      }

      this.l1.set(key, value, this.computeL1Ttl(key))
      if (!this._degraded && this._l2Available) {
        try {
          await this.l2.set(key, value, this.computeL2Ttl(key))
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
    const l1Ttl = ttlOverride?.l1 ?? this.computeL1Ttl(key)
    const l2Ttl = ttlOverride?.l2 ?? this.computeL2Ttl(key)

    this.l1.set(key, value, l1Ttl)
    if (this.bloomFilter) {
      this.bloomFilter.add(key)
    }
    if (!this._degraded && this._l2Available) {
      try {
        await this.l2.set(key, value, l2Ttl)
      } catch {
        this._l2Available = false
      }
    }
  }

  async invalidate(key: string): Promise<void> {
    this.l1.delete(key)
    if (this._l2Available) {
      try {
        await this.l2.delete(key)
      } catch {
        this._l2Available = false
      }
    }
  }

  async invalidateMany(keys: string[]): Promise<void> {
    for (const k of keys) this.l1.delete(k)
    if (this._l2Available && this.l2.deleteMany) {
      try {
        await this.l2.deleteMany(keys)
      } catch {
        this._l2Available = false
      }
    } else {
      for (const k of keys) {
        try {
          await this.l2.delete(k)
        } catch {
          this._l2Available = false
        }
      }
    }
  }

  async invalidateByPrefix(prefix: string): Promise<number> {
    let count = 0
    const keysToDelete: string[] = []
    for (const key of this.l1.keys()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key)
        this.l1.delete(key)
        count++
      }
    }
    if (this._l2Available && keysToDelete.length > 0 && this.l2.deleteMany) {
      try {
        await this.l2.deleteMany(keysToDelete)
      } catch {
        this._l2Available = false
      }
    } else if (this._l2Available && keysToDelete.length > 0) {
      for (const k of keysToDelete) {
        try {
          await this.l2.delete(k)
        } catch {
          this._l2Available = false
        }
      }
    }
    return count
  }

  async warmUp<T>(entries: Array<{ key: string; value: T }>, ttlOverride?: { l1?: number; l2?: number }): Promise<void> {
    const baseL1Ttl = ttlOverride?.l1 ?? this.l1TtlMs
    const baseL2Ttl = ttlOverride?.l2 ?? this.l2TtlMs
    const total = entries.length

    for (let i = 0; i < total; i++) {
      const entry = entries[i]
      const staggeredL1 = staggeredTtl(baseL1Ttl, i, total, DEFAULT_TTL_JITTER)
      this.l1.set(entry.key, entry.value, staggeredL1)

      if (this.bloomFilter) {
        this.bloomFilter.add(entry.key)
      }
    }

    if (!this._degraded && this._l2Available && this.l2.setMany) {
      try {
        const l2Entries: Array<{ key: string; value: T; ttlMs: number }> = entries.map((e, i) => ({
          key: e.key,
          value: e.value,
          ttlMs: staggeredTtl(baseL2Ttl, i, total, DEFAULT_TTL_JITTER),
        }))
        if ('setManyWithTtl' in this.l2 && typeof (this.l2 as any).setManyWithTtl === 'function') {
          await (this.l2 as any).setManyWithTtl(l2Entries)
        } else {
          for (const entry of l2Entries) {
            await this.l2.set(entry.key, entry.value, entry.ttlMs)
          }
        }
      } catch {
        this._l2Available = false
        for (const entry of entries) {
          try {
            await this.l2.set(entry.key, entry.value, this.computeL2Ttl(entry.key))
          } catch {
            this._l2Available = false
            break
          }
        }
      }
    } else if (!this._degraded && this._l2Available) {
      for (let i = 0; i < total; i++) {
        const entry = entries[i]
        const staggeredL2 = staggeredTtl(baseL2Ttl, i, total, DEFAULT_TTL_JITTER)
        try {
          await this.l2.set(entry.key, entry.value, staggeredL2)
        } catch {
          this._l2Available = false
          break
        }
      }
    }
  }

  async clear(): Promise<void> {
    this.l1.clear()
    this._bloomFilterBlocked = 0
    this._bloomFilterFalsePositives = 0
    this._bloomFilterPassThrough = 0
    if (this.bloomFilter) {
      this.bloomFilter.clear()
    }
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
      bloomFilter: {
        enabled: this.bloomFilter !== null,
        strict: this.bloomFilterStrict,
        blocked: this._bloomFilterBlocked,
        passThrough: this._bloomFilterPassThrough,
        falsePositives: this._bloomFilterFalsePositives,
        size: this.bloomFilter?.size ?? 0,
        whitelistSize: this.bloomFilter?.whitelistSize ?? 0,
        capacity: this.bloomFilter?.maxCapacity ?? 0,
        estimatedErrorRate: this.bloomFilter?.estimatedErrorRate ?? 0,
      },
      singleflight: {
        inflight: this.singleflight.inflightCount,
      },
    }
  }

  async destroy(): Promise<void> {
    this.l1.stopCleanup()
    this.singleflight.clear()
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
    if (this.bloomFilter) {
      this.bloomFilter.clear()
    }
  }
}
