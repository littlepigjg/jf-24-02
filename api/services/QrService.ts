import QRCode from 'qrcode'
import { qrCodeRepository } from '../repositories/QrCodeRepository.js'
import { scanRecordRepository } from '../repositories/ScanRecordRepository.js'
import type {
  QrCode,
  CreateQrCodeRequest,
  UpdateQrCodeRequest,
  PagedResult,
} from '../../shared/types.js'

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

function generateShortCode(): string {
  return Math.random().toString(36).slice(2, 10)
}

export const QrService = {
  async list(
    page: number = 1,
    pageSize: number = 20,
    keyword?: string,
  ): Promise<PagedResult<QrCode>> {
    let items = await qrCodeRepository.getAll()
    if (keyword) {
      const kw = keyword.toLowerCase()
      items = items.filter(
        (q) =>
          q.name.toLowerCase().includes(kw) ||
          q.targetUrl.toLowerCase().includes(kw) ||
          q.shortCode.toLowerCase().includes(kw),
      )
    }
    const total = items.length
    const start = (page - 1) * pageSize
    const paged = items.slice(start, start + pageSize)
    return { items: paged, total, page, pageSize }
  },

  async getById(id: string): Promise<QrCode | undefined> {
    return qrCodeRepository.getById(id)
  },

  async getByShortCode(shortCode: string): Promise<QrCode | undefined> {
    return qrCodeRepository.findOne((q) => q.shortCode === shortCode)
  },

  async create(req: CreateQrCodeRequest): Promise<QrCode> {
    let shortCode = req.shortCode?.trim()
    if (shortCode) {
      const exist = await qrCodeRepository.findOne((q) => q.shortCode === shortCode)
      if (exist) {
        throw new Error('Short code already exists')
      }
    } else {
      do {
        shortCode = generateShortCode()
      } while (await qrCodeRepository.findOne((q) => q.shortCode === shortCode))
    }

    const now = new Date().toISOString()
    const qr: QrCode = {
      id: generateId(),
      name: req.name.trim(),
      type: req.type,
      targetUrl: req.targetUrl.trim(),
      shortCode,
      size: req.size ?? 256,
      foreground: req.foreground ?? '#000000',
      background: req.background ?? '#FFFFFF',
      errorLevel: req.errorLevel ?? 'M',
      logoDataUrl: req.logoDataUrl,
      enabled: true,
      scanCount: 0,
      createdAt: now,
      updatedAt: now,
    }
    return qrCodeRepository.create(qr)
  },

  async update(id: string, req: UpdateQrCodeRequest): Promise<QrCode | undefined> {
    const exist = await qrCodeRepository.getById(id)
    if (!exist) return undefined

    const updates: Partial<QrCode> = { updatedAt: new Date().toISOString() }
    if (req.name !== undefined) updates.name = req.name.trim()
    if (req.targetUrl !== undefined) updates.targetUrl = req.targetUrl.trim()
    if (req.size !== undefined) updates.size = req.size
    if (req.foreground !== undefined) updates.foreground = req.foreground
    if (req.background !== undefined) updates.background = req.background
    if (req.errorLevel !== undefined) updates.errorLevel = req.errorLevel
    if (req.logoDataUrl !== undefined) updates.logoDataUrl = req.logoDataUrl

    return qrCodeRepository.update(id, updates)
  },

  async setEnabled(id: string, enabled: boolean): Promise<QrCode | undefined> {
    return qrCodeRepository.update(id, {
      enabled,
      updatedAt: new Date().toISOString(),
    })
  },

  async delete(id: string): Promise<boolean> {
    await scanRecordRepository.deleteMany((s) => s.qrcodeId === id)
    return qrCodeRepository.delete(id)
  },

  async generatePngBuffer(qr: QrCode): Promise<Buffer> {
    const opts: QRCode.QRCodeToBufferOptions = {
      width: qr.size,
      margin: 2,
      color: {
        dark: qr.foreground,
        light: qr.background,
      },
      errorCorrectionLevel: qr.errorLevel as any,
    }
    return QRCode.toBuffer(qr.targetUrl, opts)
  },

  async generateDataUrl(qr: QrCode): Promise<string> {
    const opts: QRCode.QRCodeToDataURLOptions = {
      width: qr.size,
      margin: 2,
      color: {
        dark: qr.foreground,
        light: qr.background,
      },
      errorCorrectionLevel: qr.errorLevel as any,
    }
    return QRCode.toDataURL(qr.targetUrl, opts)
  },

  async incrementScanCount(id: string): Promise<void> {
    const qr = await qrCodeRepository.getById(id)
    if (qr) {
      await qrCodeRepository.update(id, { scanCount: qr.scanCount + 1 })
    }
  },
}
