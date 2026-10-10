import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import customConsumptionYaml from '../custom-consumption.yaml?raw'
import { addCustomConsumptions, parseCustomConsumptions, summarizeCustomConsumptions } from './customConsumption.js'

const { simulateBatterySizes, joinedProfiles, build, scaleToMonths } = vi.hoisted(() => ({
  simulateBatterySizes: vi.fn(),
  joinedProfiles: [],
  build: vi.fn(),
  scaleToMonths: vi.fn(),
}))

vi.mock('./simulation.js', () => ({ simulateBatterySizes }))
vi.mock('./consumptionProfiles.js', () => ({
  applyHouseholdBaseload: consumption => consumption,
  validateHouseholdProfile: vi.fn(),
  getConsumptionProfile: () => ({ build }),
  validMonthly: monthly => Array.isArray(monthly) && monthly.length === 12,
  scaleToMonths,
}))
vi.mock('./energyFlow.js', () => ({
  generateDayTimeValues: ({ consumption, powerGeneration }) => {
    joinedProfiles.push(consumption)
    return Object.entries(consumption).map(([dayTime, hour]) => ({
      dayTime,
      P: powerGeneration[dayTime]?.P || 0,
      consumption: hour.P,
    }))
  },
}))

function base(year, power = 100) {
  const result = {}
  for (let time = Date.UTC(year, 0, 1); time < Date.UTC(year + 1, 0, 1); time += 3600000) {
    const date = new Date(time)
    const key = `${year}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}:${String(date.getUTCHours()).padStart(2, '0')}`
    result[key] = { P: power }
  }
  return result
}

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  joinedProfiles.length = 0
  vi.stubGlobal('self', { postMessage: vi.fn() })
  simulateBatterySizes.mockReturnValue([{ consumptionYear: 99999, consumers: { heatPump: {}, ev: {} } }])
  await import('./simulation.worker.js')
})

afterEach(() => vi.unstubAllGlobals())

test.each([false, true])('adds bundled YAML after base/import selection before joining (imported=%s)', imported => {
  const original = base(2020)
  build.mockReturnValue(original)
  const input = { year: '2020', yearlyConsumption: 876, hourModel: 'loadDistribution', heatPumpEnabled: true, evEnabled: true }
  self.onmessage({ data: { mergedPower: {}, importedConsumption: imported ? original : undefined, input, batterySizes: [6000] } })

  const entries = parseCustomConsumptions(customConsumptionYaml)
  const customSummaries = summarizeCustomConsumptions(entries, 2020)
  const customKwh = customSummaries.reduce((sum, item) => sum + item.energyKwh, 0)
  expect(joinedProfiles[0]).toEqual(addCustomConsumptions(original, entries, 2020))
  expect(original['20200310:05'].P).toBe(100)
  expect(build).toHaveBeenCalledTimes(imported ? 0 : 1)
  const response = self.postMessage.mock.calls.at(-1)[0]
  expect(self.postMessage).toHaveBeenCalledWith({ type: 'progress', stage: 'preparing' })
  expect(Object.keys(response).sort()).toEqual(['consumptionSummary', 'hours', 'results'])
  expect(response.consumptionSummary).toEqual({ year: 2020, baseKwh: 878.4, customSummaries, customKwh, totalKwh: 878.4 + customKwh })
  expect(response.hours).toBe(8784)
  expect(response.consumptionSummary.totalKwh).not.toBe(response.results[0].consumptionYear)
  const params = simulateBatterySizes.mock.calls[0][0]
  params.onProgress({ completed: 1, total: 2, size: 6000 })
  expect(self.postMessage).toHaveBeenCalledWith({ type: 'progress', stage: 'simulating', completed: 1, total: 2, size: 6000 })
  expect(params.input).toBe(input)
  expect(params.batterySizes).toEqual([6000])
  expect(params.powerGenAndConsumption.reduce((sum, row) => sum + row.consumption, 0) / 1000).toBeCloseTo(response.consumptionSummary.totalKwh, 6)
})

test('summary uses the monthly-scaled base without rescaling YAML', () => {
  const monthly = Array(12).fill(200)
  build.mockReturnValue(base(2020, 1))
  scaleToMonths.mockReturnValue(base(2020, 200))
  self.onmessage({ data: { mergedPower: {}, input: { year: 2020, monthlyConsumptionEnabled: true, monthlyConsumption: monthly }, batterySizes: [] } })
  expect(build).toHaveBeenCalledWith({ year: 2020, consumptionYear: 2400, sigma: 1 })
  expect(scaleToMonths).toHaveBeenCalledWith(expect.any(Object), Array(12).fill(200000))
  expect(self.postMessage.mock.calls.at(-1)[0].consumptionSummary.baseKwh).toBe(1756.8)
  expect(joinedProfiles[0]['20200310:05'].P).toBe(2700)
})

test('missing imported hours surface the stable custom consumption error instead of partial results', () => {
  self.onmessage({ data: { mergedPower: {}, importedConsumption: {}, input: { year: 2020 }, batterySizes: [] } })
  expect(self.postMessage).toHaveBeenCalledWith({ error: expect.stringContaining('Custom consumption:') })
  expect(simulateBatterySizes).not.toHaveBeenCalled()
})

test.each([false, true])('sigma is forwarded only for generated consumption (imported=%s)', imported => {
  const original = base(2020)
  build.mockReturnValue(original)
  self.onmessage({ data: {
    mergedPower: {}, importedConsumption: imported ? original : null,
    input: { year: 2020, yearlyConsumption: 1000, householdSigma: 0.4, householdBaseloadW: 50 },
    batterySizes: [],
  } })
  if (imported) expect(build).not.toHaveBeenCalled()
  else expect(build).toHaveBeenCalledWith({ year: 2020, consumptionYear: 1000, sigma: 0.4 })
})