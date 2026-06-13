export interface CacheKeyParts {
  prefix?: string
  entity?: string
  id?: string
  params?: Record<string, string | number | boolean | undefined>
}

export class CacheKeyBuilder {
  private readonly namespace: string
  private readonly delimiter: string

  constructor(namespace: string = 'cache', delimiter: string = ':') {
    this.namespace = namespace
    this.delimiter = delimiter
  }

  build(parts: CacheKeyParts): string {
    const segments: string[] = [this.namespace]

    if (parts.prefix) segments.push(parts.prefix)
    if (parts.entity) segments.push(parts.entity)
    if (parts.id) segments.push(parts.id)

    let key = segments.join(this.delimiter)

    if (parts.params && Object.keys(parts.params).length > 0) {
      const paramParts: string[] = []
      const sortedKeys = Object.keys(parts.params).sort()
      for (const k of sortedKeys) {
        const v = parts.params[k]
        if (v !== undefined && v !== null) {
          paramParts.push(`${k}=${encodeURIComponent(String(v))}`)
        }
      }
      if (paramParts.length > 0) {
        key += '?' + paramParts.join('&')
      }
    }

    return key
  }

  forEntityById(entity: string, id: string, prefix?: string): string {
    return this.build({ prefix, entity, id })
  }

  forList(entity: string, params?: Record<string, string | number | boolean | undefined>, prefix?: string): string {
    return this.build({ prefix, entity, params })
  }

  forAll(entity: string, prefix?: string): string {
    return this.build({ prefix, entity, id: 'all' })
  }

  static create(namespace: string = 'cache'): CacheKeyBuilder {
    return new CacheKeyBuilder(namespace)
  }
}

const qrKeyBuilder = new CacheKeyBuilder('qr')

export const QR_CACHE_KEYS = {
  byId: (id: string) => qrKeyBuilder.build({ prefix: 'id', entity: 'qrcode', id }),
  byShortCode: (shortCode: string) => qrKeyBuilder.build({ prefix: 'short', entity: 'qrcode', id: shortCode }),
  list: (page: number, pageSize: number, keyword?: string) =>
    qrKeyBuilder.build({
      prefix: 'list',
      entity: 'qrcode',
      params: { page, pageSize, keyword },
    }),
  all: () => qrKeyBuilder.build({ entity: 'qrcode', id: 'all' }),
}
