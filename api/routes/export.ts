import { Router, type Request, type Response } from 'express'
import { ExportController, ExportService } from '../modules/export/index.js'
import { BatchService } from '../services/BatchService.js'

const router = Router()

router.post('/', async (req: Request, res: Response): Promise<void> => {
  await ExportController.handleExport(req, res, 'body')
})

router.get('/tasks', async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(String(req.query.page || '1'), 10) || 1
    const pageSize = parseInt(String(req.query.pageSize || '20'), 10) || 20
    const all = await BatchService.list()
    const sorted = [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const start = (page - 1) * pageSize
    const items = sorted.slice(start, start + pageSize)
    res.json({
      success: true,
      data: { items, total: sorted.length, page, pageSize },
    })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.get('/qrcodes/png.zip', async (req: Request, res: Response): Promise<void> => {
  await ExportController.handleExport(req, res, 'query')
})

router.get('/stats.csv', async (req: Request, res: Response): Promise<void> => {
  await ExportController.handleExport(req, res, 'query')
})

router.get('/scans.csv', async (req: Request, res: Response): Promise<void> => {
  await ExportController.handleExport(req, res, 'query')
})

router.get('/full.zip', async (req: Request, res: Response): Promise<void> => {
  await ExportController.handleExport(req, res, 'query')
})

export { ExportService }
export default router
