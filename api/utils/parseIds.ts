import type { Request } from 'express'

export interface ParseIdsResult {
  ids: string[] | undefined
  explicit: boolean
  source: 'query' | 'body' | 'none'
  rawQuery?: string
  rawBody?: unknown
}

function parseCsvIds(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function parseArrayIds(arr: unknown[]): string[] {
  return arr
    .map((s) => String(s).trim())
    .filter((s) => s.length > 0)
}

export function parseIds(
  req: Request,
  options?: { prefer?: 'query' | 'body' | 'auto' },
): ParseIdsResult {
  const prefer = options?.prefer || 'auto'
  const method = req.method?.toUpperCase() || 'GET'
  const isPost = method === 'POST' || method === 'PUT' || method === 'PATCH'

  const queryIds = req.query.ids as string | undefined
  const bodyIds = req.body?.ids

  const hasQuery = queryIds !== undefined && queryIds !== null
  const hasBody = bodyIds !== undefined && bodyIds !== null

  let useSource: 'query' | 'body' | 'none' = 'none'

  if (prefer === 'query') {
    useSource = hasQuery ? 'query' : 'none'
  } else if (prefer === 'body') {
    useSource = hasBody ? 'body' : 'none'
  } else {
    if (isPost) {
      useSource = hasBody ? 'body' : hasQuery ? 'query' : 'none'
    } else {
      useSource = hasQuery ? 'query' : hasBody ? 'body' : 'none'
    }
  }

  if (useSource === 'query') {
    const raw = String(queryIds)
    const arr = parseCsvIds(raw)
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[parseIds] source=query, raw="${raw}" (len=${raw.length}) → ${arr.length} ids`,
      )
    }
    return {
      ids: arr,
      explicit: true,
      source: 'query',
      rawQuery: raw,
    }
  }

  if (useSource === 'body') {
    if (Array.isArray(bodyIds)) {
      const arr = parseArrayIds(bodyIds)
      if (process.env.NODE_ENV !== 'production') {
        console.log(
          `[parseIds] source=body, array length=${bodyIds.length} → ${arr.length} ids`,
        )
      }
      return {
        ids: arr,
        explicit: true,
        source: 'body',
        rawBody: bodyIds,
      }
    }
    if (typeof bodyIds === 'string') {
      const arr = parseCsvIds(bodyIds)
      if (process.env.NODE_ENV !== 'production') {
        console.log(
          `[parseIds] source=body, string="${bodyIds}" (len=${bodyIds.length}) → ${arr.length} ids`,
        )
      }
      return {
        ids: arr,
        explicit: true,
        source: 'body',
        rawBody: bodyIds,
      }
    }
    console.warn(`[parseIds] body.ids 类型异常: ${typeof bodyIds}, value=`, bodyIds)
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('[parseIds] no ids parameter found, will export all')
  }
  return {
    ids: undefined,
    explicit: false,
    source: 'none',
  }
}

export function parseFormat(
  req: Request,
  options?: { prefer?: 'query' | 'body' | 'auto' },
): 'zip' | 'csv' | 'scans_csv' | 'full' {
  const prefer = options?.prefer || 'auto'
  const method = req.method?.toUpperCase() || 'GET'
  const isPost = method === 'POST' || method === 'PUT' || method === 'PATCH'

  const queryFormat = req.query.format as string | undefined
  const bodyFormat = req.body?.format as string | undefined

  let format: string | undefined
  if (prefer === 'query') format = queryFormat
  else if (prefer === 'body') format = bodyFormat
  else format = isPost ? (bodyFormat || queryFormat) : (queryFormat || bodyFormat)

  if (format && ['zip', 'csv', 'scans_csv', 'full'].includes(format)) {
    return format as 'zip' | 'csv' | 'scans_csv' | 'full'
  }
  console.warn(`[parseFormat] 未知 format: ${format}, fallback to zip`)
  return 'zip'
}

export function validateIdsExplicit(result: ParseIdsResult):
  | { valid: true; ids: string[] | undefined }
  | { valid: false; error: string } {
  if (result.explicit && result.ids !== undefined && result.ids.length === 0) {
    return { valid: false, error: '请至少选择一个二维码' }
  }
  return { valid: true, ids: result.ids }
}
