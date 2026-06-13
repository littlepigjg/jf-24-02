import { CacheManager, type CacheManagerOptions } from './CacheManager.js'
import { CacheMonitor } from './CacheMonitor.js'
import { QR_CACHE_KEYS } from '../utils/CacheKeyBuilder.js'
import type { QrCode } from '../../shared/types.js'

export interface QrCodeCacheOptions extends CacheManagerOptions {
  warmUpTopN?: number
  staleWhileRevalidateMs?: number
}

const DEFAULT_WARM_UP_TOP_N = 50
const DEFAULT_STALE_WHILE_REVALIDATE_MS = 60_000

export class QrCodeCache {
  readonly manager: CacheManager
  readonly monitor: CacheMonitor
  private readonly warmUpTopN: number
  private readonly staleWhileRevalidateMs: number
  private warmedUp = false

  constructor(options?: QrCodeCacheOptions) {
    this.warmUpTopN = options?.warmUpTopN ?? DEFAULT_WARM_UP_TOP_N
    this.staleWhileRevalidateMs = options?.staleWhileRevalidateMs ?? DEFAULT_STALE_WHILE_REVALIDATE_MS
    this.manager = new CacheManager({
      namespace: 'qr',
      seedTtlByKey: true,
      bloomFilter: options?.bloomFilter ?? true,
      ...options,
    })
    this.monitor = new CacheMonitor(this.manager)

    this.monitor.onDegradation((reason) => {
      console.warn(`[QrCodeCache] Degradation detected: ${reason}`)
    })
    this.monitor.onRecovery(() => {
      console.info('[QrCodeCache] Cache recovered from degradation')
    })
  }

  async initialize(loadAllFn: () => Promise<QrCode[]>): Promise<void> {
    try {
      const allQrCodes = await loadAllFn()
      const sorted = [...allQrCodes].sort((a, b) => b.scanCount - a.scanCount)
      const topN = sorted.slice(0, this.warmUpTopN)

      const warmUpEntries: Array<{ key: string; value: QrCode }> = []
      const bloomFilterKeys: string[] = []

      for (const qr of allQrCodes) {
        const idKey = QR_CACHE_KEYS.byId(qr.id)
        const shortKey = QR_CACHE_KEYS.byShortCode(qr.shortCode)
        bloomFilterKeys.push(idKey, shortKey)
      }

      this.manager.populateBloomFilter(bloomFilterKeys)

      for (const qr of topN) {
        warmUpEntries.push({ key: QR_CACHE_KEYS.byId(qr.id), value: qr })
        warmUpEntries.push({ key: QR_CACHE_KEYS.byShortCode(qr.shortCode), value: qr })
      }

      if (warmUpEntries.length > 0) {
        await this.manager.warmUp(warmUpEntries)
      }

      if (allQrCodes.length > 0) {
        await this.manager.set(QR_CACHE_KEYS.all(), allQrCodes, {
          l1: 60_000,
          l2: 600_000,
        })
      }

      this.warmedUp = true
      this.monitor.start()
      console.info(
        `[QrCodeCache] Warmed up with ${topN.length} QR codes, ` +
        `${bloomFilterKeys.length} keys added to bloom filter, ` +
        `${allQrCodes.length} total`,
      )
    } catch (err) {
      console.error('[QrCodeCache] Warm-up failed:', err)
      this.monitor.start()
    }
  }

  async getById(id: string, fallback: () => Promise<QrCode | undefined>): Promise<QrCode | undefined> {
    const key = QR_CACHE_KEYS.byId(id)
    const result = await this.manager.get<QrCode>(key, fallback)
    if (result) {
      this.manager.addToBloomFilter(QR_CACHE_KEYS.byShortCode(result.shortCode))
    }
    return result
  }

  async getByShortCode(shortCode: string, fallback: () => Promise<QrCode | undefined>): Promise<QrCode | undefined> {
    const key = QR_CACHE_KEYS.byShortCode(shortCode)
    const result = await this.manager.get<QrCode>(key, fallback)
    if (result) {
      this.manager.addToBloomFilter(QR_CACHE_KEYS.byId(result.id))
    }
    return result
  }

  async getAll(fallback: () => Promise<QrCode[]>): Promise<QrCode[]> {
    return this.manager.get<QrCode[]>(QR_CACHE_KEYS.all(), fallback) ?? []
  }

  async getList(
    page: number,
    pageSize: number,
    keyword: string | undefined,
    fallback: () => Promise<QrCode[]>,
  ): Promise<QrCode[]> {
    const key = QR_CACHE_KEYS.list(page, pageSize, keyword)
    return this.manager.get<QrCode[]>(key, fallback) ?? []
  }

  async onCreated(qr: QrCode): Promise<void> {
    const idKey = QR_CACHE_KEYS.byId(qr.id)
    const shortKey = QR_CACHE_KEYS.byShortCode(qr.shortCode)

    this.manager.addToBloomFilter(idKey)
    this.manager.addToBloomFilter(shortKey)

    await Promise.all([
      this.manager.invalidate(QR_CACHE_KEYS.all()),
      this.manager.invalidate(idKey),
      this.manager.invalidate(shortKey),
    ])
  }

  async onUpdated(qr: QrCode): Promise<void> {
    const idKey = QR_CACHE_KEYS.byId(qr.id)
    const shortKey = QR_CACHE_KEYS.byShortCode(qr.shortCode)

    this.manager.addToBloomFilter(idKey)
    this.manager.addToBloomFilter(shortKey)

    await this.manager.warmUp([
      { key: idKey, value: qr },
      { key: shortKey, value: qr },
    ])

    await this.manager.invalidateByPrefix('qr:list:')
    await this.manager.invalidate(QR_CACHE_KEYS.all())
  }

  async onDeleted(id: string, shortCode: string): Promise<void> {
    await this.manager.invalidateMany([
      QR_CACHE_KEYS.byId(id),
      QR_CACHE_KEYS.byShortCode(shortCode),
      QR_CACHE_KEYS.all(),
    ])
    await this.manager.invalidateByPrefix('qr:list:')
  }

  async onScanCountUpdated(id: string, shortCode: string): Promise<void> {
    await this.manager.invalidate(QR_CACHE_KEYS.byId(id))
    await this.manager.invalidate(QR_CACHE_KEYS.byShortCode(shortCode))
  }

  async onEnabledChanged(id: string, qr: QrCode): Promise<void> {
    await this.onUpdated(qr)
  }

  get isWarmedUp(): boolean {
    return this.warmedUp
  }

  getStats() {
    return this.manager.getStats()
  }

  getMonitorMetrics() {
    return this.monitor.getCurrentMetrics()
  }

  getMonitorHistory() {
    return this.monitor.getHistory()
  }

  getCumulativeStats() {
    return this.monitor.getCumulativeStats()
  }

  async destroy(): Promise<void> {
    this.monitor.stop()
    await this.manager.destroy()
  }
}

let _instance: QrCodeCache | null = null

export function getQrCodeCache(options?: QrCodeCacheOptions): QrCodeCache {
  if (!_instance) {
    _instance = new QrCodeCache(options)
  }
  return _instance
}

export function destroyQrCodeCache(): Promise<void> {
  if (_instance) {
    const promise = _instance.destroy()
    _instance = null
    return promise
  }
  return Promise.resolve()
}
