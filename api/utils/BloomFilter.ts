const DEFAULT_ERROR_RATE = 0.01
const DEFAULT_CAPACITY = 10_000

const LN2_SQUARED = Math.LN2 * Math.LN2

export interface BloomFilterOptions {
  capacity?: number
  errorRate?: number
}

export class BloomFilter {
  private readonly bits: Uint8Array
  private readonly bitCount: number
  private readonly hashCount: number
  private readonly capacity: number
  private _inserted = 0

  constructor(options?: BloomFilterOptions) {
    const capacity = options?.capacity ?? DEFAULT_CAPACITY
    const errorRate = options?.errorRate ?? DEFAULT_ERROR_RATE

    this.capacity = capacity
    this.bitCount = Math.ceil(-capacity * Math.log(errorRate) / LN2_SQUARED)
    this.hashCount = Math.max(1, Math.round((this.bitCount / capacity) * Math.LN2))
    this.bits = new Uint8Array(Math.ceil(this.bitCount / 8))
  }

  add(value: string): void {
    const hashes = this.getHashes(value)
    for (const hash of hashes) {
      const bitIndex = hash % this.bitCount
      const byteIndex = Math.floor(bitIndex / 8)
      const bitOffset = bitIndex % 8
      this.bits[byteIndex] |= 1 << bitOffset
    }
    this._inserted++
  }

  addMany(values: string[]): void {
    for (const v of values) this.add(v)
  }

  mightContain(value: string): boolean {
    const hashes = this.getHashes(value)
    for (const hash of hashes) {
      const bitIndex = hash % this.bitCount
      const byteIndex = Math.floor(bitIndex / 8)
      const bitOffset = bitIndex % 8
      if ((this.bits[byteIndex] & (1 << bitOffset)) === 0) {
        return false
      }
    }
    return true
  }

  clear(): void {
    this.bits.fill(0)
    this._inserted = 0
  }

  get size(): number {
    return this._inserted
  }

  get maxCapacity(): number {
    return this.capacity
  }

  get bitSize(): number {
    return this.bitCount
  }

  get hashFunctions(): number {
    return this.hashCount
  }

  get estimatedErrorRate(): number {
    const k = this.hashCount
    const n = this._inserted
    const m = this.bitCount
    if (n === 0) return 0
    const exp = -k * n / m
    return Math.pow(1 - Math.exp(exp), k)
  }

  private getHashes(value: string): number[] {
    const hashes: number[] = []
    let h1 = this.hashFnv1a(value, 0x811c9dc5)
    let h2 = this.hashFnv1a(value, 0x9e3779b9)

    for (let i = 0; i < this.hashCount; i++) {
      const combined = (h1 + i * h2) >>> 0
      hashes.push(combined)
    }
    return hashes
  }

  private hashFnv1a(value: string, seed: number): number {
    let hash = seed >>> 0
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i)
      hash = Math.imul(hash, 0x01000193)
    }
    return hash >>> 0
  }
}
