import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import authRoutes from './routes/auth.js'
import qrcodesRoutes from './routes/qrcodes.js'
import statsRoutes from './routes/stats.js'
import batchRoutes from './routes/batch.js'
import exportRoutes from './routes/export.js'
import cacheRoutes from './routes/cache.js'
import { RedirectService } from './services/RedirectService.js'
import { getQrCodeCache } from './cache/index.js'
import { qrCodeRepository } from './repositories/QrCodeRepository.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.get('/r/:code', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await RedirectService.resolve(req.params.code, req)
    if (!result) {
      res.status(404).send('Not found or disabled')
      return
    }
    res.redirect(302, result.targetUrl)
  } catch (err) {
    next(err)
  }
})

app.use('/api/auth', authRoutes)
app.use('/api/qrcodes', qrcodesRoutes)
app.use('/api/stats', statsRoutes)
app.use('/api/batch', batchRoutes)
app.use('/api/export', exportRoutes)
app.use('/api/cache', cacheRoutes)

app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    const cache = getQrCodeCache()
    res.status(200).json({
      success: true,
      message: 'ok',
      cache: {
        warmedUp: cache.isWarmedUp,
        degraded: cache.getStats().degraded,
        l2Available: cache.getStats().l2.available,
      },
    })
  },
)

app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(error)
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  })
})

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export async function initializeCache(): Promise<void> {
  const cache = getQrCodeCache({
    useRedis: process.env.REDIS_URL !== undefined,
  })
  await cache.initialize(() => qrCodeRepository.getAll())
}

export default app
