import type { Request, Response } from 'express'
import { ExportService } from './export.service.js'
import { parseIds, parseFormat, validateIdsExplicit } from '../../utils/parseIds.js'

export type ExportMode = 'query' | 'body'
export type ExportFormat = 'zip' | 'csv' | 'scans_csv' | 'full'

function sendError(res: Response, status: number, error: string): void {
  if (!res.headersSent) {
    res.status(status).json({ success: false, error })
  }
}

export async function handleExport(
  req: Request,
  res: Response,
  mode: ExportMode,
): Promise<void> {
  const idsResult = parseIds(req, { prefer: mode })
  const format = parseFormat(req, { prefer: mode })
  const validation = validateIdsExplicit(idsResult)

  if (!validation.valid) {
    sendError(res, 400, validation.error)
    return
  }

  const ids = validation.ids

  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[export ${req.method}] format=${format}, source=${idsResult.source}, ` +
        `explicit=${idsResult.explicit}, idsCount=${ids?.length ?? 'all'}`,
    )
  }

  try {
    if (format === 'csv') {
      const csv = await ExportService.buildStatsCsv(ids)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="qrcodes_stats_${Date.now()}.csv"`,
      )
      res.send('\uFEFF' + csv)
      return
    }
    if (format === 'scans_csv') {
      const csv = await ExportService.buildScanRecordsCsv(ids)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="scan_records_${Date.now()}.csv"`,
      )
      res.send('\uFEFF' + csv)
      return
    }
    if (format === 'full') {
      res.setHeader('Content-Type', 'application/zip')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="full_export_${Date.now()}.zip"`,
      )
      await ExportService.pipeFullExportZip(res, ids)
      return
    }
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="qrcodes_png_${Date.now()}.zip"`,
    )
    await ExportService.pipeQrCodePngsZip(res, ids)
  } catch (err) {
    console.error('[export controller] error:', err)
    sendError(res, 500, (err as Error).message)
  }
}

export const ExportController = {
  handleExport,
}
