import type { CacheManager } from './CacheManager.js'

interface MetricSnapshot {
  timestamp: number
  l1Hits: number
  l1Misses: number
  l1HitRate: number
  l1Size: number
  l2Hits: number | null
  l2Misses: number | null
  l2HitRate: number | null
  l2Size: number | null
  l2Available: boolean
  degraded: boolean
  totalRequests: number
  overallHitRate: number
}

interface DegradationEvent {
  timestamp: number
  reason: string
  recovered: boolean
}

const HISTORY_MAX = 288
const SNAPSHOT_INTERVAL = 30_000
const DEGRADATION_THRESHOLD = 0.3
const RECOVERY_THRESHOLD = 0.6
const CONSECUTIVE_CHECKS = 3

export class CacheMonitor {
  private history: MetricSnapshot[] = []
  private degradationEvents: DegradationEvent[] = []
  private snapshotInterval: ReturnType<typeof setInterval> | null = null
  private consecutiveLowHits = 0
  private consecutiveGoodHits = 0
  private onDegradationCallback?: (reason: string) => void
  private onRecoveryCallback?: () => void
  private _totalL1Hits = 0
  private _totalL1Misses = 0
  private _totalL2Hits = 0
  private _totalL2Misses = 0
  private _totalFallbacks = 0

  constructor(
    private readonly manager: CacheManager,
    private readonly options?: {
      snapshotIntervalMs?: number
      degradationThreshold?: number
      recoveryThreshold?: number
      consecutiveChecks?: number
    },
  ) {}

  start(): void {
    if (this.snapshotInterval) return
    this.snapshotInterval = setInterval(
      () => this.takeSnapshot(),
      this.options?.snapshotIntervalMs ?? SNAPSHOT_INTERVAL,
    )
    if (this.snapshotInterval.unref) this.snapshotInterval.unref()
    this.takeSnapshot()
  }

  stop(): void {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval)
      this.snapshotInterval = null
    }
  }

  recordHit(layer: 'l1' | 'l2'): void {
    if (layer === 'l1') this._totalL1Hits++
    else this._totalL2Hits++
  }

  recordMiss(layer: 'l1' | 'l2'): void {
    if (layer === 'l1') this._totalL1Misses++
    else this._totalL2Misses++
  }

  recordFallback(): void {
    this._totalFallbacks++
  }

  onDegradation(callback: (reason: string) => void): void {
    this.onDegradationCallback = callback
  }

  onRecovery(callback: () => void): void {
    this.onRecoveryCallback = callback
  }

  getCurrentMetrics(): MetricSnapshot {
    const stats = this.manager.getStats()
    const totalHits = stats.l1.hits + (stats.l2.hits ?? 0)
    const totalMisses = stats.l1.misses + (stats.l2.misses ?? 0)
    const total = totalHits + totalMisses

    return {
      timestamp: Date.now(),
      l1Hits: stats.l1.hits,
      l1Misses: stats.l1.misses,
      l1HitRate: stats.l1.hitRate,
      l1Size: stats.l1.size,
      l2Hits: stats.l2.hits,
      l2Misses: stats.l2.misses,
      l2HitRate: stats.l2.hitRate,
      l2Size: stats.l2.size,
      l2Available: stats.l2.available,
      degraded: stats.degraded,
      totalRequests: total,
      overallHitRate: total === 0 ? 0 : totalHits / total,
    }
  }

  getHistory(): MetricSnapshot[] {
    return [...this.history]
  }

  getDegradationEvents(): DegradationEvent[] {
    return [...this.degradationEvents]
  }

  getCumulativeStats() {
    const totalHits = this._totalL1Hits + this._totalL2Hits
    const totalMisses = this._totalL1Misses + this._totalL2Misses
    const total = totalHits + totalMisses
    return {
      l1Hits: this._totalL1Hits,
      l1Misses: this._totalL1Misses,
      l2Hits: this._totalL2Hits,
      l2Misses: this._totalL2Misses,
      fallbacks: this._totalFallbacks,
      totalRequests: total,
      overallHitRate: total === 0 ? 0 : totalHits / total,
    }
  }

  private takeSnapshot(): void {
    const metrics = this.getCurrentMetrics()
    this.history.push(metrics)
    if (this.history.length > HISTORY_MAX) {
      this.history.shift()
    }
    this.checkDegradation(metrics)
  }

  private checkDegradation(metrics: MetricSnapshot): void {
    const degradeThreshold = this.options?.degradationThreshold ?? DEGRADATION_THRESHOLD
    const recoverThreshold = this.options?.recoveryThreshold ?? RECOVERY_THRESHOLD
    const requiredChecks = this.options?.consecutiveChecks ?? CONSECUTIVE_CHECKS

    if (metrics.overallHitRate < degradeThreshold && metrics.totalRequests > 10) {
      this.consecutiveLowHits++
      this.consecutiveGoodHits = 0

      if (this.consecutiveLowHits >= requiredChecks && !this.manager.degraded) {
        const reason = !metrics.l2Available
          ? 'L2 cache unavailable'
          : `Hit rate dropped below ${Math.round(degradeThreshold * 100)}%`
        this.degradationEvents.push({
          timestamp: Date.now(),
          reason,
          recovered: false,
        })
        this.onDegradationCallback?.(reason)
      }
    } else if (metrics.overallHitRate >= recoverThreshold || metrics.totalRequests <= 10) {
      this.consecutiveGoodHits++
      this.consecutiveLowHits = 0

      if (this.consecutiveGoodHits >= requiredChecks && this.manager.degraded) {
        const lastEvent = this.degradationEvents[this.degradationEvents.length - 1]
        if (lastEvent && !lastEvent.recovered) {
          lastEvent.recovered = true
        }
        this.onRecoveryCallback?.()
      }
    } else {
      this.consecutiveLowHits = 0
      this.consecutiveGoodHits = 0
    }
  }
}
