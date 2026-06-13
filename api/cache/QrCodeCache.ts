import { CacheManager, type CacheManagerOptions } from './CacheManager.js'
import { CacheMonitor } from './CacheMonitor.js'
import type { QrCode } from '../../shared/types.js'

export interface QrCodeCacheOptions extends CacheManagerOptions {
  warmUpTopN?: number
  staleWhileRevalidateMs?: number
}

const DEFAULT_WARM_UP_TOP_N = 50
const DEFAULT_STALE_WHILE_REVALIDATE_MS = 60_000

const KEY_PREFIX_BY_ID = 'id:'
const KEY_PREFIX_BY_SHORT = 'short:'
const KEY_PREFIX_LIST = 'list:'
const KEY_PREFIX_ALL = 'all'

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

      const entries: Array<{ key: string; value: QrCode }> = []
      for (const qr of topN) {
        entries.push({ key: `${KEY_PREFIX_BY_ID}${qr.id}`, value: qr })
        entries.push({ key: `${KEY_PREFIX_BY_SHORT}${qr.shortCode}`, value: qr })
      }

      if (entries.length > 0) {
        await this.manager.warmUp(entries)
      }

      if (allQrCodes.length > 0) {
        await this.manager.set(KEY_PREFIX_ALL, allQrCodes, {
          l1: this.manager['l1TtlMs'] * 2,
          l2: this.manager['l2TtlMs'] * 2,
        })
      }

      this.warmedUp = true
      this.monitor.start()
      console.info(`[QrCodeCache] Warmed up with ${entries.length / 2} QR codes (${allQrCodes.length} total)`)
    } catch (err) {
      console.error('[QrCodeCache] Warm-up failed:', err)
      this.monitor.start()
    }
  }

  async getById(id: string, fallback: () => Promise<QrCode | undefined>): Promise<QrCode | undefined> {
    return this.manager.get<QrCode>(`${KEY_PREFIX_BY_ID}${id}`, fallback)
  }

  async getByShortCode(shortCode: string, fallback: () => Promise<QrCode | undefined>): Promise<QrCode | undefined> {
    return this.manager.get<QrCode>(`${KEY_PREFIX_BY_SHORT}${shortCode}`, fallback)
  }

  async getAll(fallback: () => Promise<QrCode[]>): Promise<QrCode[]> {
    return this.manager.get<QrCode[]>(KEY_PREFIX_ALL, fallback) ?? []
  }

  async getList(
    cacheKey: string,
    fallback: () => Promise<QrCode[]>,
  ): Promise<QrCode[]> {
    return this.manager.get<QrCode[]>(`${KEY_PREFIX_LIST}${cacheKey}`, fallback) ?? []
  }

  async onCreated(qr: QrCode): Promise<void> {
    await Promise.all([
      this.manager.invalidate(KEY_PREFIX_ALL),
      this.manager.invalidate(`${KEY_PREFIX_BY_ID}${qr.id}`),
      this.manager.invalidate(`${KEY_PREFIX_BY_SHORT}${qr.shortCode}`),
    ])
  }

  async onUpdated(qr: QrCode): Promise<void> {
    const keys = [
      `${KEY_PREFIX_BY_ID}${qr.id}`,
      `${KEY_PREFIX_BY_SHORT}${qr.shortCode}`,
    ]
    await this.manager.warmUp([
      { key: `${KEY_PREFIX_BY_ID}${qr.id}`, value: qr },
      { key: `${KEY_PREFIX_BY_SHORT}${qr.shortCode}`, value: qr },
    ])
    await this.manager.invalidateByPrefix(KEY_PREFIX_LIST)
    await this.manager.invalidate(KEY_PREFIX_ALL)
  }

  async onDeleted(id: string, shortCode: string): Promise<void> {
    await this.manager.invalidateMany([
      `${KEY_PREFIX_BY_ID}${id}`,
      `${KEY_PREFIX_BY_SHORT}${shortCode}`,
      KEY_PREFIX_ALL,
    ])
    await this.manager.invalidateByPrefix(KEY_PREFIX_LIST)
  }

  async onScanCountUpdated(id: string): Promise<void> {
    await this.manager.invalidate(`${KEY_PREFIX_BY_ID}${id}`)
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
