import { qrCodeRepository } from '../repositories/QrCodeRepository.js'
import { scanRecordRepository } from '../repositories/ScanRecordRepository.js'
import type {
  OverviewStats,
  QrCodeStats,
  ScanRecord,
  TrendPoint,
  PagedResult,
  QrCode,
} from '../../shared/types.js'

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function buildDateRange(days: number): Date[] {
  const result: Date[] = []
  const today = startOfDay(new Date())
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    result.push(d)
  }
  return result
}

function buildHourRange(): Date[] {
  const result: Date[] = []
  const now = new Date()
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() - i, 0, 0)
    result.push(d)
  }
  return result
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function isSameHour(a: Date, b: Date): boolean {
  return isSameDay(a, b) && a.getHours() === b.getHours()
}

export const StatsService = {
  async getOverview(): Promise<OverviewStats> {
    const qrcodes = await qrCodeRepository.getAll()
    const scans = await scanRecordRepository.getAll()
    const totalQrCodes = qrcodes.length
    const activeQrCodes = qrcodes.filter((q) => q.enabled).length
    const totalScans = scans.length

    const today = startOfDay(new Date())
    const weekAgo = new Date(today)
    weekAgo.setDate(weekAgo.getDate() - 6)

    let todayScans = 0
    let thisWeekScans = 0
    const dayCounts = new Map<string, number>()
    const qrScanCounts = new Map<string, { qr: QrCode; count: number }>()

    for (const qr of qrcodes) {
      qrScanCounts.set(qr.id, { qr, count: 0 })
    }

    const dateRange = buildDateRange(7)
    for (const d of dateRange) {
      dayCounts.set(formatDate(d), 0)
    }

    for (const s of scans) {
      const sd = new Date(s.timestamp)
      if (isSameDay(sd, today)) todayScans++
      if (sd >= weekAgo) thisWeekScans++
      const key = formatDate(sd)
      if (dayCounts.has(key)) {
        dayCounts.set(key, (dayCounts.get(key) || 0) + 1)
      }
      const entry = qrScanCounts.get(s.qrcodeId)
      if (entry) entry.count++
    }

    const trendByDay: TrendPoint[] = dateRange.map((d) => ({
      date: formatDate(d),
      count: dayCounts.get(formatDate(d)) || 0,
    }))

    const topQrCodes = [...qrScanCounts.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .filter((e) => e.count > 0)
      .map((e) => ({
        id: e.qr.id,
        name: e.qr.name,
        scanCount: e.count,
      }))

    return {
      totalQrCodes,
      activeQrCodes,
      totalScans,
      todayScans,
      thisWeekScans,
      topQrCodes,
      trendByDay,
    }
  },

  async getQrCodeStats(id: string): Promise<QrCodeStats | undefined> {
    const qr = await qrCodeRepository.getById(id)
    if (!qr) return undefined

    const allScans = await scanRecordRepository.findMany((s) => s.qrcodeId === id)
    const today = startOfDay(new Date())
    const weekAgo = new Date(today)
    weekAgo.setDate(weekAgo.getDate() - 6)

    let todayScans = 0
    let thisWeekScans = 0
    const dayCounts = new Map<string, number>()
    const hourCounts = new Map<string, number>()

    const dateRange = buildDateRange(7)
    for (const d of dateRange) {
      dayCounts.set(formatDate(d), 0)
    }
    const hourRange = buildHourRange()
    for (const h of hourRange) {
      const key = `${formatDate(h)} ${String(h.getHours()).padStart(2, '0')}:00`
      hourCounts.set(key, 0)
    }

    for (const s of allScans) {
      const sd = new Date(s.timestamp)
      if (isSameDay(sd, today)) todayScans++
      if (sd >= weekAgo) thisWeekScans++
      const dKey = formatDate(sd)
      if (dayCounts.has(dKey)) {
        dayCounts.set(dKey, (dayCounts.get(dKey) || 0) + 1)
      }
      const hKey = `${formatDate(sd)} ${String(sd.getHours()).padStart(2, '0')}:00`
      if (hourCounts.has(hKey)) {
        hourCounts.set(hKey, (hourCounts.get(hKey) || 0) + 1)
      }
    }

    const trendByDay: TrendPoint[] = dateRange.map((d) => ({
      date: formatDate(d),
      count: dayCounts.get(formatDate(d)) || 0,
    }))

    const trendByHour: TrendPoint[] = hourRange.map((h) => {
      const key = `${formatDate(h)} ${String(h.getHours()).padStart(2, '0')}:00`
      return {
        date: key,
        count: hourCounts.get(key) || 0,
      }
    })

    const daysWithData = trendByDay.filter((t) => t.count > 0).length || 1
    const avgDaily = Math.round(thisWeekScans / daysWithData)

    const recentRecords = allScans.slice(0, 50)

    return {
      qrcode: qr,
      totalScans: allScans.length,
      todayScans,
      thisWeekScans,
      avgDaily,
      trendByDay,
      trendByHour,
      recentRecords,
    }
  },

  async listScanRecords(
    page: number = 1,
    pageSize: number = 50,
    qrcodeId?: string,
  ): Promise<PagedResult<ScanRecord>> {
    let items = await scanRecordRepository.getAll()
    if (qrcodeId) {
      items = items.filter((s) => s.qrcodeId === qrcodeId)
    }
    const total = items.length
    const start = (page - 1) * pageSize
    const paged = items.slice(start, start + pageSize)
    return { items: paged, total, page, pageSize }
  },
}
