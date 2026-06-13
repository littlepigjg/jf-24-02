export interface TtlOptions {
  baseTtlMs: number
  jitterRatio?: number
  minTtlMs?: number
  seed?: string
}

const DEFAULT_JITTER_RATIO = 0.3

export function jitterTtl(baseTtlMs: number, jitterRatio: number = DEFAULT_JITTER_RATIO): number {
  const jitter = baseTtlMs * jitterRatio * (Math.random() * 2 - 1)
  const result = Math.max(1, baseTtlMs + jitter)
  return Math.round(result)
}

export function jitterTtlWithSeed(baseTtlMs: number, seed: string, jitterRatio: number = DEFAULT_JITTER_RATIO): number {
  const hash = stringHash(seed)
  const random = (hash % 10000) / 10000
  const jitter = baseTtlMs * jitterRatio * (random * 2 - 1)
  return Math.max(1, Math.round(baseTtlMs + jitter))
}

export function staggeredTtl(baseTtlMs: number, index: number, total: number, jitterRatio: number = 0.2): number {
  if (total <= 1) return jitterTtl(baseTtlMs, jitterRatio)
  const spread = baseTtlMs * jitterRatio
  const offset = spread * (index / (total - 1) - 0.5)
  return Math.max(1, Math.round(baseTtlMs + offset))
}

export function randomTtlRange(minMs: number, maxMs: number): number {
  return Math.round(minMs + Math.random() * (maxMs - minMs))
}

export function perLayerTtl(
  baseTtlMs: number,
  layerMultipliers: number[],
  jitterRatio: number = DEFAULT_JITTER_RATIO,
): number[] {
  return layerMultipliers.map((m) => jitterTtl(baseTtlMs * m, jitterRatio))
}

function stringHash(str: string): number {
  let hash = 2166136261
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) || 1
}

export const TTL_SECOND = 1_000
export const TTL_MINUTE = 60 * TTL_SECOND
export const TTL_HOUR = 60 * TTL_MINUTE
export const TTL_DAY = 24 * TTL_HOUR
