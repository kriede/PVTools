import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { fetchGeneration } from '../lib/api.js'
import { readPvgisCache, writePvgisCache } from '../lib/pvgisCache.js'

const params = { roofs: [{ aspect: 0, angle: 30, peakpower: 1000 }], lat: 50, lon: 6, loss: 12, year: 2023 }
function annual(year = 2023) {
  const start = Date.UTC(year, 0, 1)
  const count = (Date.UTC(year + 1, 0, 1) - start) / 3600000
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(start + i * 3600000)
    const day = date.toISOString().slice(0, 10).replaceAll('-', '')
    return { time: `${day}:${date.toISOString().slice(11, 13)}10`, P: i % 24 * 10, T2m: 15, extra: 'unused' }
  })
}
let storage
beforeEach(() => {
  storage = new Map()
  vi.stubGlobal('__API_BASE_URL__', '/api')
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(key => storage.get(key) ?? null),
    setItem: vi.fn((key, value) => storage.set(key, value)),
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ outputs: { hourly: annual() } }) }))
})
afterEach(() => vi.unstubAllGlobals())

test('reuses persistent roof data after module reload without network, preserving temperature and output', async () => {
  const initial = await fetchGeneration(params)
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(storage.size).toBe(1)
  expect([...storage.keys()][0]).toContain('pvtools:pvgis:v1:https://re.jrc.ec.europa.eu/api/v5_3/seriescalc?')
  expect([...storage.values()][0]).not.toContain('unused')
  vi.resetModules()
  fetch.mockRejectedValue(new Error('offline'))
  const reloaded = await import('../lib/api.js')
  expect(await reloaded.fetchGeneration(params)).toEqual(initial)
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(Object.values(initial.mergedPower)[0].temperature).toBe(15)
})

test.each([
  { lat: 51 }, { lon: 7 }, { loss: 10 }, { year: 2020 },
  { roofs: [{ ...params.roofs[0], angle: 40 }] },
  { roofs: [{ ...params.roofs[0], aspect: 90 }] },
  { roofs: [{ ...params.roofs[0], peakpower: 2000 }] },
])('separates requests with changed parameters %j', async changed => {
  await fetchGeneration(params)
  const next = { ...params, ...changed }
  fetch.mockResolvedValue({ ok: true, json: async () => ({ outputs: { hourly: annual(next.year) } }) })
  await fetchGeneration(next)
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(storage.size).toBe(2)
})

test('reuses unchanged roofs when another roof is added', async () => {
  await fetchGeneration(params)
  await fetchGeneration({ ...params, roofs: [...params.roofs, { aspect: 90, angle: 30, peakpower: 1000 }] })
  expect(fetch).toHaveBeenCalledTimes(2)
})

test.each(['invalid JSON', 'missing hour', 'negative power', 'invalid temperature', 'wrong year', 'wrong URL'])(
  'ignores corrupted cache: %s', async kind => {
    await fetchGeneration(params)
    const [key, text] = [...storage.entries()][0]
    const value = JSON.parse(text)
    if (kind === 'missing hour') value.hourly.pop()
    if (kind === 'negative power') value.hourly[0].P = -1
    if (kind === 'invalid temperature') value.hourly[0].T2m = null
    if (kind === 'wrong year') value.year = 2020
    if (kind === 'wrong URL') value.url = 'different'
    storage.set(key, kind === 'invalid JSON' ? '{' : JSON.stringify(value))
    await fetchGeneration(params)
    expect(fetch).toHaveBeenCalledTimes(2)
  },
)

test('full or blocked storage does not prevent simulation', async () => {
  localStorage.getItem.mockImplementation(() => { throw new Error('blocked') })
  localStorage.setItem.mockImplementation(() => { throw new Error('quota') })
  const result = await fetchGeneration(params)
  expect(result.roofsData).toHaveLength(1)
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('only stores complete valid years, including leap day', () => {
  writePvgisCache('url', 2020, annual(2020))
  expect(readPvgisCache('url', 2020)).toHaveLength(8784)
  const incomplete = annual().slice(1)
  writePvgisCache('partial', 2023, incomplete)
  expect(readPvgisCache('partial', 2023)).toBeNull()
  expect(storage.size).toBe(1)
})