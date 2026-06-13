import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BloomFilter } from '../api/utils/BloomFilter.js'
import {
  jitterTtl,
  jitterTtlWithSeed,
  staggeredTtl,
  perKeyTtl,
  tieredTtl,
  TTL_SECOND,
  TTL_MINUTE,
} from '../api/utils/ttlUtils.js'
import { Singleflight } from '../api/utils/singleflight.js'
import { CacheKeyBuilder, QR_CACHE_KEYS } from '../api/utils/CacheKeyBuilder.js'
import { L1LocalCache } from '../api/cache/L1LocalCache.js'
import { MemoryL2Adapter } from '../api/cache/MemoryL2Adapter.js'
import { CacheManager } from '../api/cache/CacheManager.js'

let passCount = 0
let failCount = 0
const failures: string[] = []

function runTest(name: string, fn: () => void | Promise<void>): void {
  test(name, async (t) => {
    try {
      await fn()
      passCount++
      console.log(`  ✓ ${name}`)
    } catch (err) {
      failCount++
      const msg = err instanceof Error ? err.message : String(err)
      failures.push(`${name}: ${msg}`)
      console.log(`  ✗ ${name}`)
      console.log(`    ${msg}`)
      throw err
    }
  })
}

// ========== BloomFilter Tests ==========
console.log('\n=== BloomFilter Tests ===')

runTest('新增的 key 应该被 mightContain 返回 true', () => {
  const bf = new BloomFilter({ capacity: 1000, errorRate: 0.001 })
  bf.add('test:123')
  assert.equal(bf.mightContain('test:123'), true, '已添加的 key 应该返回 true')
})

runTest('未添加的 key 应该返回 false（极低误判）', () => {
  const bf = new BloomFilter({ capacity: 100000, errorRate: 0.0001 })
  bf.add('test:1')
  bf.add('test:2')
  let falsePositives = 0
  for (let i = 100; i < 200; i++) {
    if (bf.mightContain(`test:${i}`)) falsePositives++
  }
  assert.equal(falsePositives, 0, '误判率应该接近 0')
})

runTest('whitelist 机制 - 已 add 的 key 必返回 true', () => {
  const bf = new BloomFilter({ capacity: 100, errorRate: 0.5 })
  for (let i = 0; i < 1000; i++) {
    bf.add(`key:${i}`)
  }
  for (let i = 0; i < 1000; i++) {
    assert.equal(bf.isWhitelisted(`key:${i}`), true, `key:${i} 应在白名单中`)
    assert.equal(bf.mightContain(`key:${i}`), true, `key:${i} mightContain 应返回 true`)
  }
})

runTest('addMany 批量添加', () => {
  const bf = new BloomFilter({ capacity: 100, errorRate: 0.001 })
  bf.addMany(['a', 'b', 'c'])
  assert.equal(bf.size, 3)
  assert.equal(bf.mightContain('a'), true)
  assert.equal(bf.mightContain('b'), true)
  assert.equal(bf.mightContain('c'), true)
})

runTest('clear 后状态清空', () => {
  const bf = new BloomFilter({ capacity: 100, errorRate: 0.001 })
  bf.addMany(['a', 'b', 'c'])
  bf.clear()
  assert.equal(bf.size, 0)
  assert.equal(bf.whitelistSize, 0)
})

// ========== TTL Utils Tests ==========
console.log('\n=== TTL Utils Tests ===')

runTest('jitterTtl 应在基准值 ±50% 范围内', () => {
  const base = 10000
  for (let i = 0; i < 100; i++) {
    const ttl = jitterTtl(base, 0.5)
    assert.ok(ttl >= base * 0.5 && ttl <= base * 1.5, `ttl=${ttl} 应在 [${base * 0.5}, ${base * 1.5}]`)
    assert.ok(ttl > 0, 'TTL 必须 > 0')
  }
})

runTest('jitterTtlWithSeed 相同 seed 应返回相同值', () => {
  const base = 10000
  const t1 = jitterTtlWithSeed(base, 'key-abc')
  const t2 = jitterTtlWithSeed(base, 'key-abc')
  assert.equal(t1, t2, '相同 seed 应产生相同 TTL')
})

runTest('jitterTtlWithSeed 不同 seed 应返回不同值', () => {
  const base = 100000
  const values = new Set<number>()
  for (let i = 0; i < 100; i++) {
    values.add(jitterTtlWithSeed(base, `key-${i}`))
  }
  assert.ok(values.size > 50, `不同 seed 的 TTL 应有差异，实际只有 ${values.size} 个不同值`)
})

runTest('staggeredTtl 应均匀分布', () => {
  const base = 10000
  const ttls: number[] = []
  const total = 100
  for (let i = 0; i < total; i++) {
    ttls.push(staggeredTtl(base, i, total, 0.5))
  }
  const min = Math.min(...ttls)
  const max = Math.max(...ttls)
  assert.ok(min < base, `最小值 ${min} 应小于基准值 ${base}`)
  assert.ok(max > base, `最大值 ${max} 应大于基准值 ${base}`)
  assert.ok(max - min > base * 0.5, `TTL 范围 ${max - min} 应足够分散`)
})

runTest('perKeyTtl 是 jitterTtlWithSeed 的别名', () => {
  const base = 60000
  const key = 'qr:id:123'
  assert.equal(perKeyTtl(base, key), jitterTtlWithSeed(base, key))
})

runTest('tieredTtl 不同层应产生明显差异', () => {
  const base = 10000
  const t0 = tieredTtl(base, 0, 3, 0)
  const t1 = tieredTtl(base, 1, 3, 0)
  const t2 = tieredTtl(base, 2, 3, 0)
  assert.ok(t0 < t1 && t1 < t2, '层级越高 TTL 应越长')
})

runTest('TTL 常量值正确', () => {
  assert.equal(TTL_SECOND, 1000)
  assert.equal(TTL_MINUTE, 60000)
})

// ========== Singleflight Tests ==========
console.log('\n=== Singleflight Tests ===')

runTest('同一 key 并发请求只执行一次 fn', async () => {
  const sf = new Singleflight<number>({ timeoutMs: 5000 })
  let callCount = 0
  const fn = async () => {
    callCount++
    await new Promise((r) => setTimeout(r, 50))
    return 42
  }
  const results = await Promise.all([
    sf.do('k1', fn),
    sf.do('k1', fn),
    sf.do('k1', fn),
    sf.do('k1', fn),
  ])
  assert.equal(callCount, 1, `fn 只应被调用 1 次，实际 ${callCount} 次`)
  for (const r of results) {
    assert.equal(r, 42)
  }
})

runTest('不同 key 独立执行', async () => {
  const sf = new Singleflight<number>({ timeoutMs: 5000 })
  let countA = 0, countB = 0
  const fnA = async () => { countA++; return 1 }
  const fnB = async () => { countB++; return 2 }
  const [a, b] = await Promise.all([sf.do('a', fnA), sf.do('b', fnB)])
  assert.equal(countA, 1)
  assert.equal(countB, 1)
  assert.equal(a, 1)
  assert.equal(b, 2)
})

runTest('cancelOnTimeout=false 时超时仍获取结果', async () => {
  const sf = new Singleflight<number>({ timeoutMs: 30, cancelOnTimeout: false })
  const fn = async () => {
    await new Promise((r) => setTimeout(r, 100))
    return 99
  }
  const p1 = sf.do('slow', fn)
  await new Promise((r) => setTimeout(r, 150))
  const result = await p1
  assert.equal(result, 99, '即使超时，cancelOnTimeout=false 也应返回实际结果')
})

runTest('inflightCount 追踪飞行中请求', async () => {
  const sf = new Singleflight<number>({ timeoutMs: 5000 })
  assert.equal(sf.inflightCount, 0)
  const p = sf.do('k', async () => {
    await new Promise((r) => setTimeout(r, 50))
    return 1
  })
  assert.equal(sf.inflightCount, 1)
  await p
  assert.equal(sf.inflightCount, 0)
})

runTest('clear 清理所有飞行中请求', async () => {
  const sf = new Singleflight<number>({ timeoutMs: 5000 })
  sf.do('k', async () => { await new Promise((r) => setTimeout(r, 1000)); return 1 })
  sf.clear()
  assert.equal(sf.inflightCount, 0)
})

// ========== CacheKeyBuilder Tests ==========
console.log('\n=== CacheKeyBuilder Tests ===')

runTest('CacheKeyBuilder 构建正确格式的 key', () => {
  const kb = new CacheKeyBuilder('test', ':')
  const key = kb.build({ prefix: 'p', entity: 'e', id: '123' })
  assert.equal(key, 'test:p:e:123')
})

runTest('forEntityById 生成实体 key', () => {
  const kb = new CacheKeyBuilder('app')
  const key = kb.forEntityById('user', 'u-1')
  assert.ok(key.includes('user'))
  assert.ok(key.includes('u-1'))
})

runTest('QR_CACHE_KEYS.byId 包含正确前缀', () => {
  const k = QR_CACHE_KEYS.byId('abc123')
  assert.ok(k.startsWith('qr:'), `应包含 qr 命名空间，实际=${k}`)
  assert.ok(k.includes('abc123'), `应包含 id，实际=${k}`)
})

runTest('QR_CACHE_KEYS.byShortCode 格式正确', () => {
  const k = QR_CACHE_KEYS.byShortCode('SC001')
  assert.ok(k.startsWith('qr:'))
  assert.ok(k.includes('SC001'))
})

runTest('QR_CACHE_KEYS.list 带分页参数', () => {
  const k = QR_CACHE_KEYS.list(2, 20, 'test')
  assert.ok(k.includes('2'))
  assert.ok(k.includes('20'))
  assert.ok(k.includes('test'))
})

// ========== L1LocalCache Tests ==========
console.log('\n=== L1LocalCache Tests ===')

runTest('L1 get/set 基本功能', () => {
  const l1 = new L1LocalCache({ maxSize: 10 })
  l1.set('k1', 'v1', 10000)
  assert.equal(l1.get('k1'), 'v1')
})

runTest('L1 get 不存在的 key 返回 undefined', () => {
  const l1 = new L1LocalCache({ maxSize: 10 })
  assert.equal(l1.get('missing'), undefined)
})

runTest('L1 TTL 过期后返回 undefined', async () => {
  const l1 = new L1LocalCache({ maxSize: 10 })
  l1.set('k', 'v', 20)
  assert.equal(l1.get('k'), 'v')
  await new Promise((r) => setTimeout(r, 60))
  assert.equal(l1.get('k'), undefined)
})

runTest('L1 LRU 淘汰 - 超出 maxSize 时移除最旧的', () => {
  const l1 = new L1LocalCache({ maxSize: 3 })
  l1.set('a', '1', 10000)
  l1.set('b', '2', 10000)
  l1.set('c', '3', 10000)
  l1.set('d', '4', 10000)
  assert.equal(l1.get('a'), undefined, '最旧的 a 应被淘汰')
  assert.equal(l1.get('b'), '2')
  assert.equal(l1.get('c'), '3')
  assert.equal(l1.get('d'), '4')
})

runTest('L1 访问后提升到头部（LRU）', () => {
  const l1 = new L1LocalCache({ maxSize: 3 })
  l1.set('a', '1', 10000)
  l1.set('b', '2', 10000)
  l1.set('c', '3', 10000)
  l1.get('a')
  l1.set('d', '4', 10000)
  assert.equal(l1.get('a'), '1', 'a 被访问后应保留')
  assert.equal(l1.get('b'), undefined, 'b 应被淘汰')
})

runTest('L1 delete 删除 key', () => {
  const l1 = new L1LocalCache({ maxSize: 10 })
  l1.set('k', 'v', 10000)
  assert.equal(l1.delete('k'), true)
  assert.equal(l1.get('k'), undefined)
  assert.equal(l1.delete('k'), false)
})

runTest('L1 clear 清空', () => {
  const l1 = new L1LocalCache({ maxSize: 10 })
  l1.set('a', '1', 10000)
  l1.set('b', '2', 10000)
  l1.clear()
  assert.equal(l1.size, 0)
})

runTest('L1 seedTtlByKey 相同 key 产生稳定 TTL', () => {
  const l1a = new L1LocalCache({ maxSize: 10, seedTtlByKey: true, defaultTtlMs: 10000 })
  const l1b = new L1LocalCache({ maxSize: 10, seedTtlByKey: true, defaultTtlMs: 10000 })
  const start = Date.now()
  l1a.set('same-key', 'v')
  l1b.set('same-key', 'v')
})

runTest('L1 命中率统计', () => {
  const l1 = new L1LocalCache({ maxSize: 10 })
  l1.set('a', '1', 10000)
  l1.get('a')
  l1.get('a')
  l1.get('missing')
  assert.equal(l1.hits, 2)
  assert.equal(l1.misses, 1)
  assert.ok(l1.hitRate > 0.6)
})

// ========== MemoryL2Adapter Tests ==========
console.log('\n=== MemoryL2Adapter Tests ===')

runTest('L2 get/set 基本功能', async () => {
  const l2 = new MemoryL2Adapter()
  await l2.set('k', 'v', 10000)
  assert.equal(await l2.get('k'), 'v')
})

runTest('L2 TTL 过期', async () => {
  const l2 = new MemoryL2Adapter()
  await l2.set('k', 'v', 20)
  await new Promise((r) => setTimeout(r, 60))
  assert.equal(await l2.get('k'), undefined)
})

runTest('L2 getMany 批量获取', async () => {
  const l2 = new MemoryL2Adapter()
  await l2.set('a', '1', 10000)
  await l2.set('b', '2', 10000)
  await l2.set('c', '3', 10000)
  const result = await l2.getMany<string>(['a', 'c', 'missing'])
  assert.equal(result.get('a'), '1')
  assert.equal(result.get('c'), '3')
  assert.equal(result.get('missing'), undefined)
})

runTest('L2 setMany 批量设置', async () => {
  const l2 = new MemoryL2Adapter()
  await l2.setMany(
    [
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
    ],
    10000,
  )
  assert.equal(await l2.get('a'), '1')
  assert.equal(await l2.get('b'), '2')
})

runTest('L2 deleteMany 批量删除', async () => {
  const l2 = new MemoryL2Adapter()
  await l2.set('a', '1', 10000)
  await l2.set('b', '2', 10000)
  await l2.set('c', '3', 10000)
  const deleted = await l2.deleteMany(['a', 'c'])
  assert.equal(deleted, 2)
  assert.equal(await l2.get('a'), undefined)
  assert.equal(await l2.get('b'), '2')
  assert.equal(await l2.get('c'), undefined)
})

runTest('L2 clear 清空', async () => {
  const l2 = new MemoryL2Adapter()
  await l2.set('a', '1', 10000)
  await l2.clear()
  assert.equal(l2.size, 0)
})

// ========== CacheManager Tests ==========
console.log('\n=== CacheManager Tests ===')

runTest('CacheManager 多级缓存 L1→L2→fallback', async () => {
  const cm = new CacheManager({ bloomFilter: false, seedTtlByKey: false })
  let fallbackCount = 0
  const fallback = async () => {
    fallbackCount++
    return { data: 'fallback-value' }
  }
  const result = await cm.get('k1', fallback)
  assert.deepEqual(result, { data: 'fallback-value' })
  assert.equal(fallbackCount, 1)
  const result2 = await cm.get('k1', fallback)
  assert.deepEqual(result2, { data: 'fallback-value' })
  assert.equal(fallbackCount, 1, '缓存命中后不应再次调用 fallback')
  await cm.destroy()
})

runTest('CacheManager 非严格模式布隆过滤器 - 不存在的 key 仍走到 fallback', async () => {
  const cm = new CacheManager({
    bloomFilter: { capacity: 100, errorRate: 0.001 },
    bloomFilterStrict: false,
    seedTtlByKey: false,
  })
  let fallbackCalled = false
  const fallback = async () => {
    fallbackCalled = true
    return undefined
  }
  await cm.get('unknown-key-xyz', fallback)
  assert.equal(fallbackCalled, true, '非严格模式下，未在布隆过滤器中的 key 仍应调用 fallback')
  assert.ok(cm.bloomFilterBlocked > 0, 'blocked 计数应增加')
  assert.ok(cm.bloomFilterPassThrough > 0, 'passThrough 计数应增加')
  await cm.destroy()
})

runTest('CacheManager 严格模式布隆过滤器 - 不存在的 key 被拦截', async () => {
  const cm = new CacheManager({
    bloomFilter: { capacity: 100, errorRate: 0.001 },
    bloomFilterStrict: true,
    seedTtlByKey: false,
  })
  let fallbackCalled = false
  const fallback = async () => {
    fallbackCalled = true
    return undefined
  }
  await cm.get('unknown-key-xyz', fallback)
  assert.equal(fallbackCalled, false, '严格模式下，未在布隆过滤器中的 key 不应调用 fallback')
  await cm.destroy()
})

runTest('CacheManager 新创建的 key 加入布隆过滤器', async () => {
  const cm = new CacheManager({
    bloomFilter: { capacity: 1000, errorRate: 0.001 },
    bloomFilterStrict: true,
    seedTtlByKey: false,
  })
  cm.populateBloomFilter(['existing-key'])
  cm.addToBloomFilter('new-key')
  const bf = cm.getBloomFilter()
  assert.notEqual(bf, null)
  assert.equal(bf!.mightContain('existing-key'), true)
  assert.equal(bf!.mightContain('new-key'), true)
  await cm.destroy()
})

runTest('CacheManager null 值缓存避免重复查询', async () => {
  const cm = new CacheManager({ bloomFilter: false, seedTtlByKey: false })
  let fallbackCount = 0
  const fallback = async () => {
    fallbackCount++
    return undefined
  }
  await cm.get('null-key', fallback)
  await cm.get('null-key', fallback)
  await cm.get('null-key', fallback)
  assert.equal(fallbackCount, 1, 'null 值被缓存后不应重复调用 fallback')
  await cm.destroy()
})

runTest('CacheManager set 直接写入缓存', async () => {
  const cm = new CacheManager({ bloomFilter: false, seedTtlByKey: false })
  await cm.set('direct-key', 'direct-value')
  let fallbackCalled = false
  const result = await cm.get('direct-key', async () => {
    fallbackCalled = true
    return undefined
  })
  assert.equal(result, 'direct-value')
  assert.equal(fallbackCalled, false)
  await cm.destroy()
})

runTest('CacheManager invalidate 失效缓存', async () => {
  const cm = new CacheManager({ bloomFilter: false, seedTtlByKey: false })
  await cm.set('k', 'v')
  await cm.invalidate('k')
  let fallbackCalled = false
  await cm.get('k', async () => {
    fallbackCalled = true
    return 'new-v'
  })
  assert.equal(fallbackCalled, true)
  await cm.destroy()
})

runTest('CacheManager warmUp 预热批量数据', async () => {
  const cm = new CacheManager({ bloomFilter: false, seedTtlByKey: false })
  const entries = [
    { key: 'w1', value: { id: '1' } },
    { key: 'w2', value: { id: '2' } },
    { key: 'w3', value: { id: '3' } },
  ]
  await cm.warmUp(entries)
  for (const entry of entries) {
    let fallbackCalled = false
    const v = await cm.get(entry.key, async () => {
      fallbackCalled = true
      return undefined
    })
    assert.deepEqual(v, entry.value)
    assert.equal(fallbackCalled, false, `预热 key ${entry.key} 不应触发 fallback`)
  }
  await cm.destroy()
})

runTest('CacheManager warmUp 预热后 TTL 分散（不同 key 不同过期）', async () => {
  const cm = new CacheManager({ bloomFilter: false, seedTtlByKey: true })
  const entries: Array<{ key: string; value: number }> = []
  for (let i = 0; i < 50; i++) {
    entries.push({ key: `warm-${i}`, value: i })
  }
  await cm.warmUp(entries)
  assert.equal(cm.l1.size, 50)
  await cm.destroy()
})

runTest('CacheManager invalidateByPrefix 前缀失效', async () => {
  const cm = new CacheManager({ bloomFilter: false, seedTtlByKey: false })
  await cm.set('user:1', 'u1')
  await cm.set('user:2', 'u2')
  await cm.set('order:1', 'o1')
  const count = await cm.invalidateByPrefix('user:')
  assert.equal(count, 2)
  let fallbackCalled = false
  await cm.get('user:1', async () => { fallbackCalled = true; return undefined })
  assert.equal(fallbackCalled, true)
  fallbackCalled = false
  const orderVal = await cm.get('order:1', async () => { fallbackCalled = true; return undefined })
  assert.equal(orderVal, 'o1')
  assert.equal(fallbackCalled, false)
  await cm.destroy()
})

runTest('CacheManager TTL 种子模式 - 同一 key TTL 稳定', async () => {
  const cm = new CacheManager({
    bloomFilter: false,
    seedTtlByKey: true,
    l1TtlMs: 10000,
    l2TtlMs: 60000,
  })
  for (let i = 0; i < 10; i++) {
    await cm.set(`stable-${i}`, i)
  }
  await cm.destroy()
})

runTest('CacheManager getStats 返回正确结构', async () => {
  const cm = new CacheManager({ bloomFilter: { capacity: 100, errorRate: 0.001 } })
  cm.populateBloomFilter(['k1', 'k2'])
  await cm.set('k3', 'v3')
  const stats = cm.getStats()
  assert.ok(stats.l1)
  assert.ok(stats.l2)
  assert.equal(stats.bloomFilter.enabled, true)
  assert.equal(stats.bloomFilter.size >= 2, true)
  assert.ok('blocked' in stats.bloomFilter)
  assert.ok('passThrough' in stats.bloomFilter)
  assert.ok('strict' in stats.bloomFilter)
  await cm.destroy()
})

runTest('CacheManager destroy 释放资源', async () => {
  const cm = new CacheManager()
  await cm.set('k', 'v')
  await cm.destroy()
  assert.equal(cm.l1.size, 0)
})

// ========== 集成场景测试 ==========
console.log('\n=== Integration Scenario Tests ===')

runTest('场景: 新创建的二维码立即可查询（布隆过滤器 + 预热）', async () => {
  const cm = new CacheManager({
    bloomFilter: { capacity: 1000, errorRate: 0.001 },
    bloomFilterStrict: true,
    seedTtlByKey: false,
  })

  const newQr = { id: 'new-123', shortCode: 'NEW001', data: 'test' }
  const idKey = `qr:id:qrcode:${newQr.id}`
  const shortKey = `qr:short:qrcode:${newQr.shortCode}`

  cm.addToBloomFilter(idKey)
  cm.addToBloomFilter(shortKey)
  await cm.warmUp([
    { key: idKey, value: newQr },
    { key: shortKey, value: newQr },
  ])

  const bf = cm.getBloomFilter()!
  assert.equal(bf.mightContain(idKey), true, 'id key 应在布隆过滤器中')
  assert.equal(bf.mightContain(shortKey), true, 'shortCode key 应在布隆过滤器中')

  let fallbackCalled = false
  const byId = await cm.get(idKey, async () => { fallbackCalled = true; return undefined })
  assert.deepEqual(byId, newQr, '通过 id 应命中缓存')
  assert.equal(fallbackCalled, false, '不应触发 fallback')

  fallbackCalled = false
  const byShort = await cm.get(shortKey, async () => { fallbackCalled = true; return undefined })
  assert.deepEqual(byShort, newQr, '通过 shortCode 应命中缓存')
  assert.equal(fallbackCalled, false)

  await cm.destroy()
})

runTest('场景: 并发查询不存在的数据 - 只调用一次 fallback', async () => {
  const cm = new CacheManager({
    bloomFilter: false,
    seedTtlByKey: false,
    singleflight: { timeoutMs: 5000, cancelOnTimeout: false },
  })
  let fallbackCount = 0
  const fallback = async () => {
    fallbackCount++
    await new Promise((r) => setTimeout(r, 80))
    return undefined
  }
  const results = await Promise.all([
    cm.get('missing', fallback),
    cm.get('missing', fallback),
    cm.get('missing', fallback),
    cm.get('missing', fallback),
    cm.get('missing', fallback),
  ])
  assert.equal(fallbackCount, 1, `fallback 只应调用 1 次，实际 ${fallbackCount} 次`)
  for (const r of results) {
    assert.equal(r, undefined)
  }
  await cm.destroy()
})

runTest('场景: TTL 分散性验证 - 100 个 key 的 TTL 差异', () => {
  const baseTtl = 10000
  const ttls = new Set<number>()
  for (let i = 0; i < 100; i++) {
    ttls.add(jitterTtlWithSeed(baseTtl, `qr:key:${i}`, 0.5))
  }
  assert.ok(ttls.size >= 30, `TTL 应足够分散，实际只有 ${ttls.size} 个不同值`)
  const ttlArray = [...ttls]
  const min = Math.min(...ttlArray)
  const max = Math.max(...ttlArray)
  assert.ok(max - min > baseTtl * 0.3, `TTL 范围应足够大，实际 ${max - min}`)
})

runTest('场景: 预热大量数据时 TTL 均匀分布', () => {
  const base = 100000
  const ttls: number[] = []
  for (let i = 0; i < 100; i++) {
    ttls.push(staggeredTtl(base, i, 100, 0.5))
  }
  const buckets = new Array(10).fill(0)
  const min = Math.min(...ttls)
  const max = Math.max(...ttls)
  const range = max - min || 1
  for (const t of ttls) {
    const idx = Math.min(9, Math.floor(((t - min) / range) * 10))
    buckets[idx]++
  }
  for (let i = 0; i < 10; i++) {
    assert.ok(buckets[i] > 0, `第 ${i} 个 TTL 区间应有数据`)
  }
})

// ========== Summary ==========
setTimeout(() => {
  console.log('\n' + '='.repeat(50))
  console.log(`测试结果: 通过 ${passCount}, 失败 ${failCount}`)
  if (failures.length > 0) {
    console.log('\n失败详情:')
    failures.forEach((f) => console.log(`  - ${f}`))
    process.exit(1)
  } else {
    console.log('\n所有测试通过! 🎉')
    process.exit(0)
  }
}, 500)
