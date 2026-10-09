import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { generateDayTimeOrder } from './energyFlow.js'
import { loadDayAheadPrices } from '../lib/dayAheadPrices.js'

const key = year => `pvtools:dayAheadPrices:v1:DE-LU:${year}`
const first = year => Date.UTC(year, 0, 1, -1) / 1000
function payload(year = 2023) {
  const count = generateDayTimeOrder(year).length
  return {
    unix_seconds: Array.from({ length: count }, (_, i) => first(year) + i * 3600),
    price: Array(count).fill(-10), unit: 'EUR / MWh',
    license_info: { license: 'CC BY 4.0', source: 'ENTSO-E', attribution: 'Energy-Charts' },
  }
}
function respond(data = payload()) {
  fetch.mockResolvedValue({ ok: true, status: 200, json: vi.fn().mockResolvedValue(data) })
}

let storage
beforeEach(() => {
  vi.stubGlobal('__API_BASE_URL__', 'http://localhost:8082');
  storage = new Map()
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(name => storage.get(name) ?? null),
    setItem: vi.fn((name, value) => storage.set(name, value)),
  })
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

test.each([2005, 2020, 2023])('loads exact Berlin labels, leap coverage and attribution for %s', async year => {
  const data = payload(year)
  respond(data)
  const result = await loadDayAheadPrices(year)
  expect(Object.keys(result.prices)).toEqual(generateDayTimeOrder(year))
  expect(result.prices[`${year}0101:00`]).toBe(-10)
  expect(result.prices[`${year}1231:23`]).toBe(-10)
  expect(result).toMatchObject({ year, cached: false, license: { name: 'CC BY', info: data.license_info } })
  expect(result.source).toContain('Energy-Charts')
  expect(Number.isFinite(Date.parse(result.fetchedAt))).toBe(true)
  expect(fetch).toHaveBeenCalledWith(`${__API_BASE_URL__}/relay`, {
    method: 'POST', signal: expect.any(AbortSignal),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: `https://api.energy-charts.info/price?bzn=DE-LU&start=${year}-01-01&end=${year}-12-31`, method: 'GET', body: {} }),
  })
  expect(JSON.parse(storage.get(key(year)))).toEqual(result)
})

test('averages the repeated autumn hour and interpolates only the spring DST hour', async () => {
  const data = payload()
  const put = (iso, price) => { data.price[data.unix_seconds.indexOf(Date.parse(iso) / 1000)] = price }
  put('2023-03-26T00:00:00Z', 20) // 01:00 CET
  put('2023-03-26T01:00:00Z', 40) // 03:00 CEST
  put('2023-10-29T00:00:00Z', -20) // first 02:00
  put('2023-10-29T01:00:00Z', 60) // repeated 02:00
  respond(data)
  const { prices } = await loadDayAheadPrices(2023)
  expect(prices['20230326:01']).toBe(20)
  expect(prices['20230326:02']).toBe(30)
  expect(prices['20230326:03']).toBe(40)
  expect(prices['20231029:02']).toBe(20)
})

test.each(['2023-03-26T00:00:00Z', '2023-10-29T00:00:00Z', '2023-10-29T01:00:00Z'])(
  'rejects missing actual instant %s even at DST transitions', async iso => {
    const data = payload()
    const index = data.unix_seconds.indexOf(Date.parse(iso) / 1000)
    data.unix_seconds.splice(index, 1)
    data.price.splice(index, 1)
    respond(data)
    await expect(loadDayAheadPrices(2023)).rejects.toThrow('Netzdienliches Laden:')
  },
)

test.each(['ENTSO-E: CC BY 4.0', [{ source: 'ENTSO-E', license: 'CC BY 4.0' }]])(
  'preserves API attribution metadata without imposing its object shape (%#)', async info => {
    const data = payload()
    data.license_info = info
    respond(data)
    expect((await loadDayAheadPrices(2023)).license.info).toEqual(info)
    expect((await loadDayAheadPrices(2023)).cached).toBe(true)
  },
)

test('uses annual cache offline without a fetch', async () => {
  respond()
  const initial = await loadDayAheadPrices(2023)
  fetch.mockRejectedValue(new Error('offline'))
  expect(await loadDayAheadPrices(2023)).toEqual({ ...initial, cached: true })
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('force bypasses cache, replaces it on success and preserves it on failure', async () => {
  respond()
  await loadDayAheadPrices(2023)
  const updated = payload()
  updated.price.fill(42)
  respond(updated)
  expect((await loadDayAheadPrices(2023, { force: true })).prices['20230101:00']).toBe(42)
  const saved = storage.get(key(2023))
  fetch.mockRejectedValue(new Error('offline'))
  await expect(loadDayAheadPrices(2023, { force: true })).rejects.toThrow('Netzdienliches Laden:')
  expect(storage.get(key(2023))).toBe(saved)
  expect((await loadDayAheadPrices(2023)).cached).toBe(true)
})

test.each([
  value => { delete value.prices['20230101:00'] },
  value => { value.prices['20230101:00'] = null },
  value => { value.prices['20230101:00'] = '10' },
  value => { delete value.prices['20230101:00']; value.prices['20220101:00'] = 1 },
  value => { value.prices.extra = 1 },
  value => { value.year = 2020 },
  value => { value.source = '' },
  value => { value.license = null },
  value => { value.license.info = {} },
  value => { value.license.name = 'unknown' },
  value => { value.fetchedAt = 'not a date' },
  value => { value.cached = 'false' },
])('ignores invalid cached labels, values or metadata (%#)', async corrupt => {
  respond()
  const result = await loadDayAheadPrices(2023)
  corrupt(result)
  storage.set(key(2023), JSON.stringify(result))
  expect((await loadDayAheadPrices(2023)).cached).toBe(false)
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('ignores malformed cache JSON', async () => {
  storage.set(key(2023), '{broken')
  respond()
  expect((await loadDayAheadPrices(2023)).cached).toBe(false)
})

test('storage access and write failures are nonfatal', async () => {
  vi.stubGlobal('localStorage', { getItem() { throw new Error('denied') }, setItem() { throw new Error('quota') } })
  respond()
  expect((await loadDayAheadPrices(2023)).cached).toBe(false)
  vi.stubGlobal('localStorage', undefined)
  expect((await loadDayAheadPrices(2023)).cached).toBe(false)
})

describe('strict API validation', () => {
  test.each([
    data => { data.price[100] = null },
    data => { data.price[100] = NaN },
    data => { data.price[100] = Infinity },
    data => { data.price[100] = -Infinity },
    data => { data.price[100] = '10' },
    data => { data.unix_seconds[100] = null },
    data => { data.unix_seconds[100] = '1672531200' },
    data => { data.unix_seconds[100] += 1 },
    data => { data.unix_seconds[100] = data.unix_seconds[99] },
    data => { data.unix_seconds.reverse() },
    data => { data.unix_seconds = data.unix_seconds.map(time => time + 3600) },
    data => { data.unix_seconds = data.unix_seconds.map(time => time - 3600) },
    data => { data.unix_seconds.pop(); data.price.pop() },
    data => { data.price.pop() },
    data => { data.unix_seconds.splice(2000, 1); data.price.splice(2000, 1) },
    data => { data.unit = 'USD / MWh' },
    data => { data.unit = 'EUR / kWh' },
    data => { data.license_info = null },
  ])('rejects missing, nonfinite, wrong-unit or invalid year coverage (%#)', async corrupt => {
    const data = payload()
    corrupt(data)
    respond(data)
    await expect(loadDayAheadPrices(2023)).rejects.toThrow('Netzdienliches Laden:')
    expect(storage.has(key(2023))).toBe(false)
  })
})

test.each([2004, 2024, 2023.5, '2023', null, NaN, Infinity])('rejects invalid year %s without network or cache access', async year => {
  await expect(loadDayAheadPrices(year)).rejects.toThrow('Netzdienliches Laden:')
  expect(fetch).not.toHaveBeenCalled()
  expect(localStorage.getItem).not.toHaveBeenCalled()
})

test.each([429, 500])('reports HTTP %s without retry', async status => {
  fetch.mockResolvedValue({ ok: false, status, json: vi.fn() })
  await expect(loadDayAheadPrices(2023)).rejects.toThrow(`HTTP ${status}`)
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('reports offline and JSON failures with the German prefix and allows a later retry', async () => {
  fetch.mockRejectedValue(new Error('offline'))
  await expect(loadDayAheadPrices(2023)).rejects.toThrow('Netzdienliches Laden:')
  fetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.reject(new Error('bad JSON')) })
  await expect(loadDayAheadPrices(2023)).rejects.toThrow('Netzdienliches Laden:')
  respond()
  expect((await loadDayAheadPrices(2023)).cached).toBe(false)
})

test.each(['fetch', 'json'])('30-second timeout includes %s, aborts and cleans up', async stage => {
  vi.useFakeTimers()
  const never = new Promise(() => {})
  if (stage === 'fetch') fetch.mockReturnValue(never)
  else fetch.mockResolvedValue({ ok: true, status: 200, json: () => never })
  const request = loadDayAheadPrices(2023)
  const rejection = expect(request).rejects.toThrow('Netzdienliches Laden: Zeitüberschreitung')
  const signal = fetch.mock.calls[0][1].signal
  await vi.advanceTimersByTimeAsync(29999)
  expect(signal.aborted).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  await rejection
  expect(signal.aborted).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
  expect(storage.size).toBe(0)
  respond()
  await loadDayAheadPrices(2023)
  expect(vi.getTimerCount()).toBe(0)
})

test('clears timeout after successful fetch and after HTTP failure', async () => {
  vi.useFakeTimers()
  respond()
  await loadDayAheadPrices(2023)
  expect(vi.getTimerCount()).toBe(0)
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(false)
  fetch.mockResolvedValue({ ok: false, status: 500 })
  await expect(loadDayAheadPrices(2020)).rejects.toThrow('HTTP 500')
  expect(vi.getTimerCount()).toBe(0)
})

test('deduplicates concurrent requests per year including force, but separates years', async () => {
  let release
  fetch.mockImplementation((url, options) => new Promise(resolve => {
    if (JSON.parse(options.body).url.includes('2023-01-01')) release = () => resolve({ ok: true, status: 200, json: async () => payload() })
    else resolve({ ok: true, status: 200, json: async () => payload(2020) })
  }))
  const one = loadDayAheadPrices(2023)
  const two = loadDayAheadPrices(2023, { force: true })
  const three = loadDayAheadPrices(2023)
  const leap = loadDayAheadPrices(2020)
  expect(fetch).toHaveBeenCalledTimes(2)
  release()
  const results = await Promise.all([one, two, three, leap])
  expect(results[0]).toBe(results[1])
  expect(results[0]).toBe(results[2])
  expect(results[3].year).toBe(2020)
})

test('ordinary and forced callers join an in-flight forced refresh instead of using stale cache', async () => {
  respond()
  await loadDayAheadPrices(2023)
  let release
  const fresh = payload()
  fresh.price.fill(99)
  fetch.mockImplementation(() => new Promise(resolve => {
    release = () => resolve({ ok: true, status: 200, json: async () => fresh })
  }))
  const forced = loadDayAheadPrices(2023, { force: true })
  const ordinary = loadDayAheadPrices(2023)
  const forcedAgain = loadDayAheadPrices(2023, { force: true })
  expect(fetch).toHaveBeenCalledTimes(2)
  release()
  for (const result of await Promise.all([forced, ordinary, forcedAgain])) {
    expect(result.cached).toBe(false)
    expect(result.prices['20230101:00']).toBe(99)
  }
})