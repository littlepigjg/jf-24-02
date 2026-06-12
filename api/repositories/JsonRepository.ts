import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DATA_DIR = path.resolve(__dirname, '..', 'data')

interface JsonFile<T> {
  version: number
  items: T[]
}

type Task<T> = () => Promise<T>

class LockQueue {
  private queue: Promise<unknown> = Promise.resolve()

  async execute<T>(task: Task<T>): Promise<T> {
    const result = this.queue.then(() => task())
    this.queue = result.catch(() => undefined)
    return result
  }
}

export class JsonRepository<T extends { id: string }> {
  private filePath: string
  private lock: LockQueue

  constructor(filename: string) {
    this.filePath = path.join(DATA_DIR, filename)
    this.lock = new LockQueue()
  }

  private async readFile(): Promise<JsonFile<T>> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8')
      return JSON.parse(data) as JsonFile<T>
    } catch {
      return { version: 1, items: [] }
    }
  }

  private async writeFile(data: JsonFile<T>): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
  }

  async getAll(): Promise<T[]> {
    return this.lock.execute(async () => {
      const data = await this.readFile()
      return data.items
    })
  }

  async getById(id: string): Promise<T | undefined> {
    return this.lock.execute(async () => {
      const data = await this.readFile()
      return data.items.find((item) => item.id === id)
    })
  }

  async findMany(predicate: (item: T) => boolean): Promise<T[]> {
    return this.lock.execute(async () => {
      const data = await this.readFile()
      return data.items.filter(predicate)
    })
  }

  async findOne(predicate: (item: T) => boolean): Promise<T | undefined> {
    return this.lock.execute(async () => {
      const data = await this.readFile()
      return data.items.find(predicate)
    })
  }

  async create(item: T): Promise<T> {
    return this.lock.execute(async () => {
      const data = await this.readFile()
      data.items.unshift(item)
      await this.writeFile(data)
      return item
    })
  }

  async createMany(items: T[]): Promise<T[]> {
    return this.lock.execute(async () => {
      const data = await this.readFile()
      data.items = [...items, ...data.items]
      await this.writeFile(data)
      return items
    })
  }

  async update(id: string, updates: Partial<T>): Promise<T | undefined> {
    return this.lock.execute(async () => {
      const data = await this.readFile()
      const index = data.items.findIndex((item) => item.id === id)
      if (index === -1) return undefined
      data.items[index] = { ...data.items[index], ...updates, id } as T
      await this.writeFile(data)
      return data.items[index]
    })
  }

  async delete(id: string): Promise<boolean> {
    return this.lock.execute(async () => {
      const data = await this.readFile()
      const index = data.items.findIndex((item) => item.id === id)
      if (index === -1) return false
      data.items.splice(index, 1)
      await this.writeFile(data)
      return true
    })
  }

  async deleteMany(predicate: (item: T) => boolean): Promise<number> {
    return this.lock.execute(async () => {
      const data = await this.readFile()
      const beforeLen = data.items.length
      data.items = data.items.filter((item) => !predicate(item))
      const deleted = beforeLen - data.items.length
      if (deleted > 0) {
        await this.writeFile(data)
      }
      return deleted
    })
  }

  async count(predicate?: (item: T) => boolean): Promise<number> {
    return this.lock.execute(async () => {
      const data = await this.readFile()
      if (!predicate) return data.items.length
      return data.items.filter(predicate).length
    })
  }
}
