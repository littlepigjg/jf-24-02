import type { L2CacheAdapter } from './L2CacheAdapter.js'
import { jitterTtl } from '../utils/ttlUtils.js'

export interface RedisL2Options {
  url?: string
  keyPrefix?: string
  connectTimeoutMs?: number
  maxRetries?: number
  ttlJitterRatio?: number
}

const DEFAULT_JITTER_RATIO = 0.3

export class RedisL2Adapter implements L2CacheAdapter {
  private client: any = null
  private connected = false
  private connecting: Promise<void> | null = null
  private readonly keyPrefix: string
  private readonly connectTimeoutMs: number
  private readonly maxRetries: number
  private readonly url: string
  private readonly jitterRatio: number
  private _hits = 0
  private _misses = 0
  private retries = 0

  constructor(options?: RedisL2Options) {
    this.url = options?.url ?? process.env.REDIS_URL ?? 'redis://localhost:6379'
    this.keyPrefix = options?.keyPrefix ?? 'qr:cache:'
    this.connectTimeoutMs = options?.connectTimeoutMs ?? 5000
    this.maxRetries = options?.maxRetries ?? 3
    this.jitterRatio = options?.ttlJitterRatio ?? DEFAULT_JITTER_RATIO
  }

  async connect(): Promise<void> {
    if (this.connected && this.client) return
    if (this.connecting) return this.connecting

    this.connecting = this._connect()
    try {
      await this.connecting
    } finally {
      this.connecting = null
    }
  }

  private async _connect(): Promise<void> {
    try {
      let redis: any
      const ioredisName = 'iored' + 'is'
      const redisName = 're' + 'dis'
      try {
        const mod: any = await import(/* @vite-ignore */ ioredisName)
        redis = mod.default || mod
      } catch {
        try {
          const mod: any = await import(/* @vite-ignore */ redisName)
          redis = mod.createClient ? mod : mod.default || mod
        } catch {
          throw new Error('Neither ioredis nor redis package is installed. Install one: npm install ioredis or npm install redis')
        }
      }

      if (typeof redis.createClient === 'function') {
        this.client = redis.createClient({ url: this.url })
        this.client.on('error', () => {
          this.connected = false
        })
        await this.client.connect()
      } else if (typeof redis === 'function') {
        this.client = new redis(this.url)
        this.client.on('error', () => {
          this.connected = false
        })
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Redis connect timeout')), this.connectTimeoutMs)
          this.client.once('ready', () => {
            clearTimeout(timeout)
            resolve()
          })
          this.client.once('error', (err: Error) => {
            clearTimeout(timeout)
            reject(err)
          })
        })
      }

      this.connected = true
      this.retries = 0
    } catch (err) {
      this.connected = false
      this.client = null
      throw err
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        if (this.client.quit) await this.client.quit()
        else if (this.client.disconnect) this.client.disconnect()
      } catch {}
      this.client = null
      this.connected = false
    }
  }

  private async ensureConnection(): Promise<void> {
    if (this.connected && this.client) return
    if (this.retries >= this.maxRetries) {
      throw new Error(`Redis max retries (${this.maxRetries}) exceeded`)
    }
    this.retries++
    await this.connect()
  }

  private prefixKey(key: string): string {
    return `${this.keyPrefix}${key}`
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      await this.ensureConnection()
      const raw = await this.client.get(this.prefixKey(key))
      if (raw === null || raw === undefined) {
        this._misses++
        return undefined
      }
      this._hits++
      return JSON.parse(raw) as T
    } catch {
      this._misses++
      this.connected = false
      return undefined
    }
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    try {
      await this.ensureConnection()
      const jitteredTtl = jitterTtl(ttlMs, this.jitterRatio)
      const ttlSec = Math.max(1, Math.ceil(jitteredTtl / 1000))
      await this.client.set(this.prefixKey(key), JSON.stringify(value), { EX: ttlSec })
    } catch {
      this.connected = false
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      await this.ensureConnection()
      const result = await this.client.del(this.prefixKey(key))
      return result > 0
    } catch {
      this.connected = false
      return false
    }
  }

  async clear(): Promise<void> {
    try {
      await this.ensureConnection()
      const pattern = this.prefixKey('*')
      const keys: string[] = []
      let cursor = '0'
      do {
        const reply = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
        cursor = reply[0]
        keys.push(...reply[1])
      } while (cursor !== '0')
      if (keys.length > 0) {
        await this.client.del(...keys)
      }
    } catch {
      this.connected = false
    }
  }

  async getMany<T>(keys: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>()
    if (keys.length === 0) return result
    try {
      await this.ensureConnection()
      const prefixed = keys.map((k) => this.prefixKey(k))
      const values = await this.client.mGet(prefixed)
      for (let i = 0; i < keys.length; i++) {
        const raw = values[i]
        if (raw !== null && raw !== undefined) {
          result.set(keys[i], JSON.parse(raw) as T)
        }
      }
    } catch {
      this.connected = false
    }
    return result
  }

  async setMany<T>(entries: Array<{ key: string; value: T }>, ttlMs: number): Promise<void> {
    if (entries.length === 0) return
    try {
      await this.ensureConnection()
      const pipeline = this.client.multi ? this.client.multi() : this.client.pipeline()
      for (const entry of entries) {
        const jitteredTtl = jitterTtl(ttlMs, this.jitterRatio)
        const ttlSec = Math.max(1, Math.ceil(jitteredTtl / 1000))
        pipeline.set(this.prefixKey(entry.key), JSON.stringify(entry.value), { EX: ttlSec })
      }
      await pipeline.exec()
    } catch {
      this.connected = false
    }
  }

  async deleteMany(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0
    try {
      await this.ensureConnection()
      const prefixed = keys.map((k) => this.prefixKey(k))
      return await this.client.del(...prefixed)
    } catch {
      this.connected = false
      return 0
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.ensureConnection()
      const result = await this.client.ping()
      return result === 'PONG'
    } catch {
      this.connected = false
      return false
    }
  }

  get isConnected(): boolean {
    return this.connected
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
}
