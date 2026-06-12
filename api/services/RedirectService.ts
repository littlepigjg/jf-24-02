import { QrService } from './QrService.js'
import { scanRecordRepository } from '../repositories/ScanRecordRepository.js'
import type { ScanRecord } from '../../shared/types.js'

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

function getClientIp(req: any): string {
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) {
    const arr = Array.isArray(forwarded) ? forwarded : forwarded.split(',')
    return arr[0]?.trim() || ''
  }
  return req.ip || req.socket?.remoteAddress || ''
}

export const RedirectService = {
  async resolve(shortCode: string, req: any): Promise<{ targetUrl: string } | null> {
    const qr = await QrService.getByShortCode(shortCode)
    if (!qr || !qr.enabled) {
      return null
    }

    const record: ScanRecord = {
      id: generateId(),
      qrcodeId: qr.id,
      shortCode: qr.shortCode,
      timestamp: new Date().toISOString(),
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || '',
      referer: req.headers['referer'],
    }
    await scanRecordRepository.create(record)
    await QrService.incrementScanCount(qr.id)

    return { targetUrl: qr.targetUrl }
  },
}
