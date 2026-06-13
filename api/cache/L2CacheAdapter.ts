export interface L2CacheAdapter {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T, ttlMs: number): Promise<void>
  delete(key: string): Promise<boolean>
  clear(): Promise<void>
  getMany?<T>(keys: string[]): Promise<Map<string, T>>
  setMany?<T>(entries: Array<{ key: string; value: T }>, ttlMs: number): Promise<void>
  deleteMany?(keys: string[]): Promise<number>
  ping?(): Promise<boolean>
}
