import { Router, type Request, type Response } from 'express'
import { BatchService } from '../services/BatchService.js'
import { ExportService } from '../modules/export/index.js'
import type { BatchGenerateRequest } from '../../shared/types.js'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await BatchService.list()
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.post('/preview', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as Partial<BatchGenerateRequest>
    if (!body.baseUrl || !body.paramName || !body.paramValues || !Array.isArray(body.paramValues)) {
      res.status(400).json({
        success: false,
        error: 'baseUrl, paramName, paramValues (array) are required',
      })
      return
    }
    const urls = BatchService.previewUrls(body as BatchGenerateRequest)
    res.json({ success: true, data: urls })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as BatchGenerateRequest
    if (
      !body.name ||
      !body.baseUrl ||
      !body.paramName ||
      !body.paramValues ||
      !Array.isArray(body.paramValues) ||
      body.paramValues.length === 0
    ) {
      res.status(400).json({
        success: false,
        error: 'name, baseUrl, paramName, paramValues (non-empty array) are required',
      })
      return
    }
    const task = await BatchService.create(body)
    res.status(201).json({ success: true, data: task })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.get('/:id/download', async (req: Request, res: Response): Promise<void> => {
  try {
    const task = await BatchService.getById(req.params.id)
    if (!task) {
      res.status(404).json({ success: false, error: 'Batch task not found' })
      return
    }
    if (task.status !== 'done') {
      res.status(400).json({ success: false, error: `任务尚未完成，当前状态: ${task.status}` })
      return
    }
    const safeName = task.name.replace(/[<>:"/\\|?*]/g, '_') || `batch_${task.id}`
    const filename = `${safeName}.zip`
    const ids = task.qrcodeIds && task.qrcodeIds.length > 0 ? task.qrcodeIds : undefined

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[batch download] task=${task.id}, name=${task.name}, idsCount=${ids?.length ?? 'all'}`)
    }

    if (ids !== undefined && ids.length === 0) {
      res.status(400).json({ success: false, error: '该批量任务没有生成任何二维码' })
      return
    }

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
    await ExportService.pipeQrCodePngsZip(res, ids)
  } catch (err) {
    console.error('[batch download] error:', err)
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: (err as Error).message })
    }
  }
})

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const task = await BatchService.getById(req.params.id)
    if (!task) {
      res.status(404).json({ success: false, error: 'Batch task not found' })
      return
    }
    res.json({ success: true, data: task })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.post('/:id/cancel', async (req: Request, res: Response): Promise<void> => {
  try {
    const ok = await BatchService.cancel(req.params.id)
    if (!ok) {
      res.status(404).json({ success: false, error: 'Batch task not found' })
      return
    }
    res.json({ success: true, message: 'Cancelled' })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const ok = await BatchService.delete(req.params.id)
    if (!ok) {
      res.status(404).json({ success: false, error: 'Batch task not found' })
      return
    }
    res.json({ success: true, message: 'Deleted' })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

export default router
