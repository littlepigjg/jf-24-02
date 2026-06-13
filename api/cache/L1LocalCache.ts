import { jitterTtl, jitterTtlWithSeed } from '../utils/ttlUtils.js'

interface CacheEntry<T> {
  value: T
  expireAt: number
}

interface LRUNode<T> {
  key: string
  entry: CacheEntry<T>
  prev: LRUNode<T> | null
  next: LRUNode<T> | null
}

export interface L1CacheOptions {
  maxSize?: number
  defaultTtlMs?: number
  ttlJitterRatio?: number
  seedTtlByKey?: boolean
}

const DEFAULT_MAX_SIZE = 500
const DEFAULT_TTL_MS = 30_000
const DEFAULT_JITTER_RATIO = 0.5

export class L1LocalCache {
  private map = new Map<string, LRUNode<unknown>>()
  private head: LRUNode<unknown> | null = null
  private tail: LRUNode<unknown> | null = null
  private readonly maxSize: number
  private readonly defaultTtlMs: number
  private readonly jitterRatio: number
  private readonly seedTtlByKey: boolean
  private cleanupTimer: ReturnType<typeof setInterval> | null = null
  private _hits = 0
  private _misses = 0

  constructor(options?: L1CacheOptions) {
    this.maxSize = options?.maxSize ?? DEFAULT_MAX_SIZE
    this.defaultTtlMs = options?.defaultTtlMs ?? DEFAULT_TTL_MS
    this.jitterRatio = options?.ttlJitterRatio ?? DEFAULT_JITTER_RATIO
    this.seedTtlByKey = options?.seedTtlByKey ?? false
  }

  startCleanup(intervalMs: number = 10_000): void {
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

  get<T>(key: string): T | undefined {
    const node = this.map.get(key)
    if (!node) {
      this._misses++
      return undefined
    }
    if (Date.now() > node.entry.expireAt) {
      this.removeNode(node)
      this.map.delete(key)
      this._misses++
      return undefined
    }
    this.moveToHead(node)
    this._hits++
    return node.entry.value as T
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    const baseTtl = ttlMs ?? this.defaultTtlMs
    const ttl = this.seedTtlByKey
      ? jitterTtlWithSeed(baseTtl, key, this.jitterRatio)
      : jitterTtl(baseTtl, this.jitterRatio)
    const expireAt = Date.now() + ttl

    const existing = this.map.get(key)
    if (existing) {
      existing.entry = { value, expireAt }
      this.moveToHead(existing)
      return
    }

    const node: LRUNode<unknown> = {
      key,
      entry: { value, expireAt },
      prev: null,
      next: null,
    }
    this.map.set(key, node)
    this.addToHead(node)

    if (this.map.size > this.maxSize) {
      const lru = this.tail
      if (lru) {
        this.removeNode(lru)
        this.map.delete(lru.key)
      }
    }
  }

  delete(key: string): boolean {
    const node = this.map.get(key)
    if (!node) return false
    this.removeNode(node)
    this.map.delete(key)
    return true
  }

  clear(): void {
    this.map.clear()
    this.head = null
    this.tail = null
  }

  get size(): number {
    return this.map.size
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

  keys(): string[] {
    return [...this.map.keys()]
  }

  private moveToHead(node: LRUNode<unknown>): void {
    if (node === this.head) return
    this.removeNode(node)
    this.addToHead(node)
  }

  private addToHead(node: LRUNode<unknown>): void {
    node.prev = null
    node.next = this.head
    if (this.head) this.head.prev = node
    this.head = node
    if (!this.tail) this.tail = node
  }

  private removeNode(node: LRUNode<unknown>): void {
    if (node.prev) node.prev.next = node.next
    else this.head = node.next
    if (node.next) node.next.prev = node.prev
    else this.tail = node.prev
    node.prev = null
    node.next = null
  }

  private evictExpired(): void {
    const now = Date.now()
    const keysToDelete: string[] = []
    for (const [key, node] of this.map) {
      if (now > node.entry.expireAt) {
        keysToDelete.push(key)
      }
    }
    for (const key of keysToDelete) {
      this.delete(key)
    }
  }
}
