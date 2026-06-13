interface Flight<T> {
  promise: Promise<T | undefined>
  sharedResult: T | undefined
  sharedError: Error | undefined
  completed: boolean
  callbacks: Array<{
    resolve: (value: T | undefined) => void
    timeoutId: ReturnType<typeof setTimeout>
    timedOut: boolean
  }>
}

export interface SingleflightOptions {
  timeoutMs?: number
  maxInflight?: number
  cancelOnTimeout?: boolean
}

const DEFAULT_TIMEOUT_MS = 3_000
const DEFAULT_MAX_INFLIGHT = 1000

export class Singleflight<T = unknown> {
  private flights = new Map<string, Flight<T>>()
  private readonly timeoutMs: number
  private readonly maxInflight: number
  private readonly cancelOnTimeout: boolean

  constructor(options?: SingleflightOptions) {
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxInflight = options?.maxInflight ?? DEFAULT_MAX_INFLIGHT
    this.cancelOnTimeout = options?.cancelOnTimeout ?? false
  }

  get inflightCount(): number {
    return this.flights.size
  }

  async do(key: string, fn: () => Promise<T | undefined>): Promise<T | undefined> {
    const existing = this.flights.get(key)
    if (existing) {
      if (existing.completed) {
        return existing.sharedError ? Promise.reject(existing.sharedError) : existing.sharedResult
      }
      return this.createWaiterPromise(key, existing)
    }

    if (this.flights.size >= this.maxInflight) {
      try {
        return await fn()
      } catch {
        return undefined
      }
    }

    const flight: Flight<T> = {
      promise: this.executeFlight(key, fn),
      sharedResult: undefined,
      sharedError: undefined,
      completed: false,
      callbacks: [],
    }

    this.flights.set(key, flight)

    return this.createWaiterPromise(key, flight)
  }

  private createWaiterPromise(
    key: string,
    flight: Flight<T>,
  ): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve) => {
      const timeoutId = setTimeout(() => {
        const flightEntry = this.flights.get(key)
        if (flightEntry && !flightEntry.completed) {
          const callback = flightEntry.callbacks.find((c) => c.resolve === resolve)
          if (callback) {
            callback.timedOut = true
            if (this.cancelOnTimeout) {
              resolve(undefined)
              const idx = flightEntry.callbacks.indexOf(callback)
              if (idx !== -1) flightEntry.callbacks.splice(idx, 1)
            }
          }
        }
      }, this.timeoutMs)

      if (timeoutId.unref) timeoutId.unref()

      flight.callbacks.push({ resolve, timeoutId, timedOut: false })
    })
  }

  private async executeFlight(
    key: string,
    fn: () => Promise<T | undefined>,
  ): Promise<T | undefined> {
    try {
      const result = await fn()
      this.completeFlight(key, result, undefined)
      return result
    } catch (err) {
      this.completeFlight(key, undefined, err as Error)
      throw err
    }
  }

  private completeFlight(
    key: string,
    result: T | undefined,
    error: Error | undefined,
  ): void {
    const flight = this.flights.get(key)
    if (!flight) return

    flight.sharedResult = result
    flight.sharedError = error
    flight.completed = true

    this.flights.delete(key)

    for (const callback of flight.callbacks) {
      clearTimeout(callback.timeoutId)
      if (!callback.timedOut || !this.cancelOnTimeout) {
        if (error) {
          try {
            callback.resolve(undefined)
          } catch {}
        } else {
          callback.resolve(result)
        }
      } else {
        callback.resolve(undefined)
      }
    }
  }

  cancel(key: string): boolean {
    const flight = this.flights.get(key)
    if (flight) {
      this.completeFlight(key, undefined, new Error('Cancelled'))
      return true
    }
    return false
  }

  clear(): void {
    for (const [key] of this.flights) {
      this.completeFlight(key, undefined, new Error('Cleared'))
    }
    this.flights.clear()
  }
}
