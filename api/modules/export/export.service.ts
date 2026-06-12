import archiver from 'archiver'
import { QrService } from '../../services/QrService.js'
import { StatsService } from '../../services/StatsService.js'
import { qrCodeRepository } from '../../repositories/QrCodeRepository.js'
import type { QrCode, ScanRecord } from '../../../shared/types.js'
import type { Response } from 'express'

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function buildCsv(headers: string[], rows: (string | number)[][]): string {
  const head = headers.map(escapeCsv).join(',')
  const body = rows.map((r) => r.map(escapeCsv).join(',')).join('\n')
  return head + (body ? '\n' + body : '')
}

async function resolveQrCodes(ids?: string[]): Promise<QrCode[]> {
  if (ids && ids.length > 0) {
    const result: QrCode[] = []
    for (const id of ids) {
      const qr = await qrCodeRepository.getById(id)
      if (qr) result.push(qr)
    }
    return result
  }
  return qrCodeRepository.getAll()
}

function safeFilename(baseName: string, usedNames: Map<string, number>, ext: string): string {
  const safe = baseName.replace(/[<>:"/\\|?*]/g, '_')
  let filename = `${safe}.${ext}`
  const count = usedNames.get(filename) || 0
  if (count > 0) {
    filename = `${safe}_${count}.${ext}`
  }
  usedNames.set(filename, count + 1)
  return filename
}

export const ExportService = {
  async pipeQrCodePngsZip(res: Response, qrcodeIds?: string[]): Promise<void> {
    const qrcodes = await resolveQrCodes(qrcodeIds)
    const archive = archiver('zip', { zlib: { level: 9 } })
    archive.on('error', (err) => {
      if (!res.headersSent) res.status(500).json({ success: false, error: err.message })
    })
    archive.pipe(res)

    const usedNames = new Map<string, number>()
    for (const qr of qrcodes) {
      const filename = safeFilename(qr.name || qr.shortCode, usedNames, 'png')
      try {
        const buf = await QrService.generatePngBuffer(qr)
        archive.append(buf, { name: filename })
      } catch {
        // skip failed
      }
    }
    await archive.finalize()
  },

  async buildStatsCsv(qrcodeIds?: string[]): Promise<string> {
    const qrcodes = await resolveQrCodes(qrcodeIds)
    const headers = [
      'ID',
      '名称',
      '类型',
      '短码',
      '目标URL',
      '启用状态',
      '扫描次数',
      '创建时间',
      '更新时间',
    ]
    const rows: (string | number)[][] = []
    for (const qr of qrcodes) {
      rows.push([
        qr.id,
        qr.name,
        qr.type,
        qr.shortCode,
        qr.targetUrl,
        qr.enabled ? '启用' : '禁用',
        qr.scanCount,
        qr.createdAt,
        qr.updatedAt,
      ])
    }
    return buildCsv(headers, rows)
  },

  async buildScanRecordsCsv(qrcodeIds?: string[]): Promise<string> {
    let records: ScanRecord[]
    if (qrcodeIds && qrcodeIds.length > 0) {
      records = []
      for (const id of qrcodeIds) {
        const result = await StatsService.listScanRecords(1, 1000000, id)
        records.push(...result.items)
      }
    } else {
      const result = await StatsService.listScanRecords(1, 1000000)
      records = result.items
    }
    const headers = ['ID', '二维码ID', '短码', '时间', 'IP', 'UserAgent', '来源']
    const rows: (string | number)[][] = []
    for (const r of records) {
      rows.push([
        r.id,
        r.qrcodeId,
        r.shortCode,
        r.timestamp,
        r.ip,
        r.userAgent,
        r.referer || '',
      ])
    }
    return buildCsv(headers, rows)
  },

  async pipeFullExportZip(res: Response, qrcodeIds?: string[]): Promise<void> {
    const archive = archiver('zip', { zlib: { level: 9 } })
    archive.on('error', (err) => {
      if (!res.headersSent) res.status(500).json({ success: false, error: err.message })
    })
    archive.pipe(res)

    const statsCsv = await this.buildStatsCsv(qrcodeIds)
    archive.append(statsCsv, { name: 'qrcodes_stats.csv' })

    const scansCsv = await this.buildScanRecordsCsv(qrcodeIds)
    archive.append(scansCsv, { name: 'scan_records.csv' })

    const qrcodes = await resolveQrCodes(qrcodeIds)
    const usedNames = new Map<string, number>()
    for (const qr of qrcodes) {
      const filename = safeFilename(qr.name || qr.shortCode, usedNames, 'png')
      try {
        const buf = await QrService.generatePngBuffer(qr)
        archive.append(buf, { name: `qrcodes/${filename}` })
      } catch {
        // skip
      }
    }
    await archive.finalize()
  },
}
