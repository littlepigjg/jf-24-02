export type QrCodeType = 'static' | 'dynamic'
export type ErrorLevel = 'L' | 'M' | 'Q' | 'H'
export type BatchStatus = 'pending' | 'running' | 'done' | 'failed'

export interface QrCode {
  id: string
  name: string
  type: QrCodeType
  targetUrl: string
  shortCode: string
  size: number
  foreground: string
  background: string
  errorLevel: ErrorLevel
  logoDataUrl?: string
  enabled: boolean
  scanCount: number
  createdAt: string
  updatedAt: string
}

export interface ScanRecord {
  id: string
  qrcodeId: string
  shortCode: string
  timestamp: string
  ip: string
  userAgent: string
  referer?: string
}

export interface BatchTask {
  id: string
  name: string
  baseUrl: string
  paramName: string
  totalCount: number
  successCount: number
  status: BatchStatus
  qrcodeIds: string[]
  createdAt: string
}

export interface CreateQrCodeRequest {
  name: string
  type: QrCodeType
  targetUrl: string
  shortCode?: string
  size?: number
  foreground?: string
  background?: string
  errorLevel?: ErrorLevel
  logoDataUrl?: string
}

export interface UpdateQrCodeRequest {
  name?: string
  targetUrl?: string
  size?: number
  foreground?: string
  background?: string
  errorLevel?: ErrorLevel
  logoDataUrl?: string
}

export interface BatchGenerateRequest {
  name: string
  baseUrl: string
  paramName: string
  paramValues: string[]
  template?: Partial<CreateQrCodeRequest>
}

export interface TrendPoint {
  date: string
  count: number
}

export interface OverviewStats {
  totalQrCodes: number
  activeQrCodes: number
  totalScans: number
  todayScans: number
  thisWeekScans: number
  topQrCodes: { id: string; name: string; scanCount: number }[]
  trendByDay: TrendPoint[]
}

export interface QrCodeStats {
  qrcode: QrCode
  totalScans: number
  todayScans: number
  thisWeekScans: number
  avgDaily: number
  trendByDay: TrendPoint[]
  trendByHour: TrendPoint[]
  recentRecords: ScanRecord[]
}

export interface PagedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface CacheLayerStats {
  size: number
  hits: number
  misses: number
  hitRate: number
}

export interface CacheStats {
  l1: CacheLayerStats
  l2: {
    available: boolean
    hits: number | null
    misses: number | null
    hitRate: number | null
    size: number | null
  }
  degraded: boolean
  namespace: string
}

export interface CacheMetricSnapshot {
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

export interface CacheCumulativeStats {
  l1Hits: number
  l1Misses: number
  l2Hits: number
  l2Misses: number
  fallbacks: number
  totalRequests: number
  overallHitRate: number
}
