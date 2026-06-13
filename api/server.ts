import app, { initializeCache } from './app.js'
import { destroyQrCodeCache } from './cache/index.js'

const PORT = process.env.PORT || 3001

async function start(): Promise<void> {
  await initializeCache()

  const server = app.listen(PORT, () => {
    console.log(`Server ready on port ${PORT}`)
  })

  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received')
    destroyQrCodeCache().finally(() => {
      server.close(() => {
        console.log('Server closed')
        process.exit(0)
      })
    })
  })

  process.on('SIGINT', () => {
    console.log('SIGINT signal received')
    destroyQrCodeCache().finally(() => {
      server.close(() => {
        console.log('Server closed')
        process.exit(0)
      })
    })
  })
}

start().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})

export default app
