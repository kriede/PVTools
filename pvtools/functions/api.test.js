import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { fetchGeneration, relayRequest, PVGIS_FIRST_YEAR, PVGIS_LAST_YEAR } from '../lib/api.js'

const roofs = [{ aspect: 0, angle: 30, peakpower: 1000 }]
const params = { roofs, lat: 50, lon: 6, loss: 12, year: 2019 }
const row = (time = '20190101:0010', P = 1000) => ({ time, P })
const response = (hourly) => ({ outputs: { hourly } })
beforeEach(() => {
  vi.stubGlobal('__API_BASE_URL__', '/api')
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
const serve = (data) => fetch.mockResolvedValue({ ok: true, json: async () => data })

test.each(['request', 'body'])('times out a stalled %s and aborts the network request', async (stage) => {
  vi.useFakeTimers()
  const stalled = new Promise(() => {})
  fetch.mockReturnValue(stage === 'request' ? stalled : Promise.resolve({
    ok: true, json: () => stalled,
  }))
  const pending = relayRequest('https://example.test')
  const rejected = expect(pending).rejects.toThrow('Zeitüberschreitung')
  await vi.advanceTimersByTimeAsync(30000)
  await rejected
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})

test('successful requests clear their timeout', async () => {
  vi.useFakeTimers()
  serve({ ok: true })
  await expect(relayRequest('https://example.test')).resolves.toEqual({ ok: true })
  expect(vi.getTimerCount()).toBe(0)
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(false)
})

test('requests matching years and kWp, accepts UTC New Year before timezone shifting', async () => {
  serve(response([row(), row('20191231:2310', 0), row('20190701:1210', 2000)]))
  const result = await fetchGeneration(params)
  const url = new URL(JSON.parse(fetch.mock.calls[0][1].body).url)
  expect(url.searchParams.get('startyear')).toBe('2019')
  expect(url.searchParams.get('endyear')).toBe('2019')
  expect(url.searchParams.get('peakpower')).toBe('1')
  expect(result.roofsData[0].generationYear).toBe(3)
  expect(result.mergedPower['20190701:14'].P).toBe(2000)
})
test.each([
  ['wrong year', response([row('20180101:0010')])],
  ['mixed years', response([row(), row('20180101:0010')])],
  ['empty', response([])], ['missing', {}], ['null', null],
  ['invalid month', response([row('20191301:0010')])],
  ['invalid day', response([row('20190229:0010')])],
  ['invalid hour', response([row('20190101:2410')])],
  ['invalid minute', response([row('20190101:0060')])],
  ['invalid timestamp', response([row('not a date')])],
  ['invalid power', response([row(undefined, NaN)])],
  ['negative power', response([row(undefined, -1)])],
])('rejects %s before normalization can hide invalid data', async (_, data) => {
  serve(data)
  await expect(fetchGeneration(params)).rejects.toThrow('PVGIS')
})
test('rejects unsupported years and empty roof sets without fetching', async () => {
  for (const year of [PVGIS_FIRST_YEAR - 1, PVGIS_LAST_YEAR + 1, 2019.5, NaN]) {
    await expect(fetchGeneration({ ...params, year })).rejects.toThrow('year')
  }
  await expect(fetchGeneration({ ...params, roofs: [] })).rejects.toThrow('roofs')
  expect(fetch).not.toHaveBeenCalled()
})
test('one failed roof rejects the entire generation request', async () => {
  fetch.mockResolvedValueOnce({ ok: true, json: async () => response([row()]) })
    .mockResolvedValueOnce({ ok: true, json: async () => response([row('20180101:0010')]) })
  await expect(fetchGeneration({ ...params, roofs: [...roofs, ...roofs] })).rejects.toThrow('UTC year')
})