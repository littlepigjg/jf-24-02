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
