import { QrService } from './QrService.js'
import { batchTaskRepository } from '../repositories/BatchTaskRepository.js'
import type {
  BatchTask,
  BatchGenerateRequest,
  CreateQrCodeRequest,
  QrCode,
  BatchStatus,
} from '../../shared/types.js'

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

const runningTasks = new Map<string, { abort: boolean }>()

export const BatchService = {
  async list(): Promise<BatchTask[]> {
    return batchTaskRepository.getAll()
  },

  async getById(id: string): Promise<BatchTask | undefined> {
    return batchTaskRepository.getById(id)
  },

  previewUrls(req: BatchGenerateRequest): string[] {
    const urls: string[] = []
    for (const value of req.paramValues) {
      const sep = req.baseUrl.includes('?') ? '&' : '?'
      const url = `${req.baseUrl}${sep}${encodeURIComponent(req.paramName)}=${encodeURIComponent(value)}`
      urls.push(url)
    }
    return urls
  },

  async create(req: BatchGenerateRequest): Promise<BatchTask> {
    const now = new Date().toISOString()
    const task: BatchTask = {
      id: generateId(),
      name: req.name.trim(),
      baseUrl: req.baseUrl.trim(),
      paramName: req.paramName.trim(),
      totalCount: req.paramValues.length,
      successCount: 0,
      status: 'pending',
      qrcodeIds: [],
      createdAt: now,
    }
    await batchTaskRepository.create(task)
    void this.runTask(task.id, req)
    return task
  },

  async runTask(taskId: string, req: BatchGenerateRequest): Promise<void> {
    const ctx = { abort: false }
    runningTasks.set(taskId, ctx)
    let status: BatchStatus = 'running'
    try {
      await batchTaskRepository.update(taskId, { status: 'running' })
      const createdQrs: QrCode[] = []
      for (let i = 0; i < req.paramValues.length; i++) {
        if (ctx.abort) {
          status = 'failed'
          break
        }
        const value = req.paramValues[i]
        const sep = req.baseUrl.includes('?') ? '&' : '?'
        const url = `${req.baseUrl}${sep}${encodeURIComponent(req.paramName)}=${encodeURIComponent(value)}`
        const createReq: CreateQrCodeRequest = {
          name: `${req.name}_${value}`,
          type: 'dynamic',
          targetUrl: url,
          ...(req.template || {}),
        }
        try {
          const qr = await QrService.create(createReq)
          createdQrs.push(qr)
        } catch {
          // 跳过失败的
        }
        await batchTaskRepository.update(taskId, {
          successCount: createdQrs.length,
          qrcodeIds: createdQrs.map((q) => q.id),
        })
      }
      if (status !== 'failed') {
        status = 'done'
      }
    } catch {
      status = 'failed'
    } finally {
      runningTasks.delete(taskId)
      await batchTaskRepository.update(taskId, { status })
    }
  },

  async cancel(taskId: string): Promise<boolean> {
    const ctx = runningTasks.get(taskId)
    if (ctx) {
      ctx.abort = true
    }
    const task = await batchTaskRepository.getById(taskId)
    if (!task) return false
    if (task.status === 'pending' || task.status === 'running') {
      await batchTaskRepository.update(taskId, { status: 'failed' })
    }
    return true
  },

  async delete(taskId: string): Promise<boolean> {
    const task = await batchTaskRepository.getById(taskId)
    if (!task) return false
    runningTasks.delete(taskId)
    return batchTaskRepository.delete(taskId)
  },
}
