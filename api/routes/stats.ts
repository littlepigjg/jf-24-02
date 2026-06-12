import { Router, type Request, type Response } from 'express'
import { StatsService } from '../services/StatsService.js'

const router = Router()

router.get('/overview', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await StatsService.getOverview()
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.get('/qrcodes/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await StatsService.getQrCodeStats(req.params.id)
    if (!data) {
      res.status(404).json({ success: false, error: 'QrCode not found' })
      return
    }
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.get('/scans', async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1
    const pageSize = parseInt(req.query.pageSize as string, 10) || 50
    const qrcodeId = req.query.qrcodeId as string | undefined
    const result = await StatsService.listScanRecords(page, pageSize, qrcodeId)
    res.json({ success: true, data: result })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

export default router
