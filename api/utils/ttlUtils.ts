export interface TtlOptions {
  baseTtlMs: number
  jitterRatio?: number
  minTtlMs?: number
  seed?: string
}

const DEFAULT_JITTER_RATIO = 0.5
const MIN_JITTER_RATIO = 0.2
const MAX_JITTER_RATIO = 0.8

export function jitterTtl(baseTtlMs: number, jitterRatio: number = DEFAULT_JITTER_RATIO): number {
  const safeRatio = Math.min(MAX_JITTER_RATIO, Math.max(MIN_JITTER_RATIO, jitterRatio))
  const jitter = baseTtlMs * safeRatio * (Math.random() * 2 - 1)
  const result = Math.max(1, baseTtlMs + jitter)
  return Math.round(result)
}

export function jitterTtlWithSeed(baseTtlMs: number, seed: string, jitterRatio: number = DEFAULT_JITTER_RATIO): number {
  const safeRatio = Math.min(MAX_JITTER_RATIO, Math.max(MIN_JITTER_RATIO, jitterRatio))
  const hash = stringHash(seed)
  const random = (hash % 10000) / 10000
  const jitter = baseTtlMs * safeRatio * (random * 2 - 1)
  return Math.max(1, Math.round(baseTtlMs + jitter))
}

export function staggeredTtl(baseTtlMs: number, index: number, total: number, jitterRatio: number = 0.5): number {
  const safeRatio = Math.min(MAX_JITTER_RATIO, Math.max(MIN_JITTER_RATIO, jitterRatio))
  if (total <= 1) return jitterTtl(baseTtlMs, safeRatio)
  const spread = baseTtlMs * safeRatio * 2
  const offset = spread * (index / (total - 1) - 0.5)
  const base = baseTtlMs + offset
  const extraJitter = baseTtlMs * 0.1 * (Math.random() * 2 - 1)
  return Math.max(1, Math.round(base + extraJitter))
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

export function perKeyTtl(baseTtlMs: number, key: string, jitterRatio: number = DEFAULT_JITTER_RATIO): number {
  return jitterTtlWithSeed(baseTtlMs, key, jitterRatio)
}

export function tieredTtl(
  baseTtlMs: number,
  tier: number,
  totalTiers: number,
  jitterRatio: number = 0.5,
): number {
  if (totalTiers <= 1) return jitterTtl(baseTtlMs, jitterRatio)
  const tierMultiplier = 0.5 + (tier / (totalTiers - 1)) * 1.0
  const tiered = baseTtlMs * tierMultiplier
  return jitterTtl(tiered, jitterRatio)
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
