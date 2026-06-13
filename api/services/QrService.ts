import QRCode from 'qrcode'
import { qrCodeRepository } from '../repositories/QrCodeRepository.js'
import { scanRecordRepository } from '../repositories/ScanRecordRepository.js'
import { getQrCodeCache } from '../cache/index.js'
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
    const cache = getQrCodeCache()

    const cachedItems = await cache.getList(page, pageSize, keyword, async () => {
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
      const start = (page - 1) * pageSize
      return items.slice(start, start + pageSize)
    })

    const allItems = await cache.getAll(() => qrCodeRepository.getAll())
    let total = allItems.length
    if (keyword) {
      const kw = keyword.toLowerCase()
      total = allItems.filter(
        (q) =>
          q.name.toLowerCase().includes(kw) ||
          q.targetUrl.toLowerCase().includes(kw) ||
          q.shortCode.toLowerCase().includes(kw),
      ).length
    }

    return { items: cachedItems, total, page, pageSize }
  },

  async getById(id: string): Promise<QrCode | undefined> {
    const cache = getQrCodeCache()
    return cache.getById(id, () => qrCodeRepository.getById(id))
  },

  async getByShortCode(shortCode: string): Promise<QrCode | undefined> {
    const cache = getQrCodeCache()
    return cache.getByShortCode(shortCode, () =>
      qrCodeRepository.findOne((q) => q.shortCode === shortCode),
    )
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
    const created = await qrCodeRepository.create(qr)
    await getQrCodeCache().onCreated(created)
    return created
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

    const updated = await qrCodeRepository.update(id, updates)
    if (updated) {
      await getQrCodeCache().onUpdated(updated)
    }
    return updated
  },

  async setEnabled(id: string, enabled: boolean): Promise<QrCode | undefined> {
    const updated = await qrCodeRepository.update(id, {
      enabled,
      updatedAt: new Date().toISOString(),
    })
    if (updated) {
      await getQrCodeCache().onEnabledChanged(id, updated)
    }
    return updated
  },

  async delete(id: string): Promise<boolean> {
    const qr = await qrCodeRepository.getById(id)
    const ok = await qrCodeRepository.delete(id)
    if (ok && qr) {
      await scanRecordRepository.deleteMany((s) => s.qrcodeId === id)
      await getQrCodeCache().onDeleted(id, qr.shortCode)
    }
    return ok
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
      await getQrCodeCache().onScanCountUpdated(id, qr.shortCode)
    }
  },
}
