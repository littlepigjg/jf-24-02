import { Router, type Request, type Response } from 'express'
import { getQrCodeCache } from '../cache/index.js'

const router = Router()

router.get('/stats', (req: Request, res: Response): void => {
  const cache = getQrCodeCache()
  res.json({
    success: true,
    data: cache.getStats(),
  })
})

router.get('/metrics', (req: Request, res: Response): void => {
  const cache = getQrCodeCache()
  res.json({
    success: true,
    data: cache.getMonitorMetrics(),
  })
})

router.get('/history', (req: Request, res: Response): void => {
  const cache = getQrCodeCache()
  res.json({
    success: true,
    data: cache.getMonitorHistory(),
  })
})

router.get('/cumulative', (req: Request, res: Response): void => {
  const cache = getQrCodeCache()
  res.json({
    success: true,
    data: cache.getCumulativeStats(),
  })
})

router.post('/warmup', async (req: Request, res: Response): Promise<void> => {
  try {
    const { initializeCache } = await import('../app.js')
    await initializeCache()
    const cache = getQrCodeCache()
    res.json({
      success: true,
      data: {
        warmedUp: cache.isWarmedUp,
        stats: cache.getStats(),
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.post('/clear', async (req: Request, res: Response): Promise<void> => {
  try {
    const cache = getQrCodeCache()
    await cache.manager.clear()
    res.json({ success: true, message: 'Cache cleared' })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.delete('/invalidate/:key', async (req: Request, res: Response): Promise<void> => {
  try {
    const cache = getQrCodeCache()
    await cache.manager.invalidate(req.params.key)
    res.json({ success: true, message: `Key '${req.params.key}' invalidated` })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

export default router
