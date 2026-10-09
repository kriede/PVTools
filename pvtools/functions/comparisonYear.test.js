import { readFileSync } from 'node:fs'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ fetchGeneration: vi.fn(), buildConsumption: vi.fn(), loadDayAheadPrices: vi.fn() }))
vi.mock('../lib/dayAheadPrices.js', () => ({ loadDayAheadPrices: mocks.loadDayAheadPrices }))
vi.mock('../lib/api.js', () => ({
  fetchGeneration: mocks.fetchGeneration, geocode: vi.fn(),
  PVGIS_FIRST_YEAR: 2005, PVGIS_LAST_YEAR: 2023,
}))
vi.mock('./consumptionImport.js', () => ({
  analyzeConsumptionCsv: vi.fn(), buildConsumption: mocks.buildConsumption,
}))

let calculator, workers
const deferred = () => {
  let resolve, reject
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}
const generation = () => ({ mergedPower: { '20200101:00': { P: 1000 } }, roofsData: [{ generationYear: 1 }] })
const reply = (worker, overrides = {}) => worker.onmessage({ data: {
  results: [1, ...worker.payload.batterySizes].map((size) => ({
    size, consumptionYear: 6200, costSavings: size > 1 ? 400 : 0,
    gridUsedEnergy: size > 1 ? 2000 : 3000, fedInPower: 1000, balance: { ok: true },
  })),
  hours: 8760,
  consumptionSummary: { year: Number(worker.payload.input.year), baseKwh: 5000,
    customSummaries: [{ name: 'Heating', energyKwh: 1000 }], customKwh: 1000, totalKwh: 6000 },
  ...overrides,
} })
const flush = async () => { await Promise.resolve(); await Promise.resolve() }
async function complete() {
  const pending = calculator.calculate()
  await flush()
  reply(workers.at(-1))
  await pending
}

async function restoreInput(savedInput) {
  localStorage.getItem.mockImplementation((key) => key === 'storedInput'
    ? JSON.stringify(savedInput) : null)
  vi.resetModules()
  calculator = (await import('../composables/useCalculator.js')).useCalculator()
  calculator.address.value = { lat: '50.9', lon: '6.9', shortName: 'Cologne' }
  calculator.input.roofs = [{ aspect: 0, angle: 30, peakpower: 10000 }]
  calculator.batterySizes.value = [5000, 10000]
}

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  workers = []
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key) => key === 'storedInput'
      ? JSON.stringify({ batteryCostsFixed: 1700, batteryCostsPerKwh: 400 }) : null),
    setItem: vi.fn(),
  })
  vi.stubGlobal('Worker', class {
    constructor() { workers.push(this) }
    terminate = vi.fn()
    postMessage(payload) { this.payload = structuredClone(payload) }
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.fetchGeneration.mockResolvedValue(generation())
  mocks.loadDayAheadPrices.mockRejectedValue(new Error('Netzdienliches Laden: Preisdienst nicht erreichbar.'))
  mocks.buildConsumption.mockImplementation((analysis, year) => ({
    [`${year}0101:00`]: { P: analysis.values.get('source') },
  }))
  calculator = (await import('../composables/useCalculator.js')).useCalculator()
  calculator.address.value = { lat: '50.9', lon: '6.9', shortName: 'Cologne' }
  calculator.input.roofs = [{ aspect: 0, angle: 30, peakpower: 1000 }]
  calculator.batterySizes.value = [5000, 10000]
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

test('HomePage wires ResultsView event, busy state and German summary', () => {
  const source = readFileSync(new URL('../pages/HomePage.vue', import.meta.url), 'utf8')
  expect(source).toContain('@comparison-year-change="changeComparisonYear"')
  expect(source).toContain(':busy="busy"')
  expect(source).toContain('consumptionSummary.year')
  expect(source).toContain('zusätzlich zu YAML')
})
test('grid-friendly charging defaults off and stops before PVGIS when price retrieval fails', async () => {
  expect(calculator.input.gridFriendlyChargingEnabled).toBe(false)
  calculator.input.gridFriendlyChargingEnabled = true
  await calculator.calculate()
  expect(mocks.fetchGeneration).not.toHaveBeenCalled()
  expect(workers).toHaveLength(0)
  expect(calculator.error.value).toContain('Netzdienliches Laden')
  expect(calculator.status.value).toBe('idle')
})

test('automatically downloads prices using the pre-await year snapshot without making results stale', async () => {
  const { generateDayTimeOrder } = await import('./energyFlow.js')
  const prices = Object.fromEntries(generateDayTimeOrder(2020).map(key => [key, 50]))
  mocks.loadDayAheadPrices.mockResolvedValue({ year: 2020, prices })
  calculator.input.gridFriendlyChargingEnabled = true
  const pending = calculator.calculate()
  await flush()
  await flush()
  expect(mocks.loadDayAheadPrices).toHaveBeenCalledWith(2020)
  expect(workers[0].payload.input.gridFriendlyPrices['20200101:00']).toBe(50)
  reply(workers[0])
  await pending
  expect(calculator.input.gridFriendlyPrices).toBeNull()
  expect(calculator.isStale.value).toBe(false)
})

test('snapshots other inputs and year before awaiting automatic prices', async () => {
  const { generateDayTimeOrder } = await import('./energyFlow.js')
  const request = deferred()
  mocks.loadDayAheadPrices.mockReturnValue(request.promise)
  calculator.input.gridFriendlyChargingEnabled = true
  const pending = calculator.calculate()
  calculator.input.year = 2023
  calculator.input.gridFriendlyPriceThreshold = -10
  request.resolve({ year: 2020, prices: Object.fromEntries(generateDayTimeOrder(2020).map(key => [key, 50])) })
  await flush()
  await flush()
  expect(workers[0].payload.input.year).toBe(2020)
  expect(workers[0].payload.input.gridFriendlyPriceThreshold).toBe(0)
  reply(workers[0])
  await pending
  expect(calculator.isStale.value).toBe(true)
  expect(calculator.priceInfo.value).toBeNull()
})

test('successful manual refresh clears CSV but failed refresh preserves it', async () => {
  const original = { '20200101:00': 123 }
  calculator.input.gridFriendlyPrices = original
  await expect(calculator.refreshPrices()).rejects.toThrow('Preisdienst')
  expect(calculator.input.gridFriendlyPrices).toEqual(original)
  expect(calculator.priceLoading.value).toBe(false)
  mocks.loadDayAheadPrices.mockResolvedValue({ year: 2020, prices: {} })
  await calculator.refreshPrices()
  expect(mocks.loadDayAheadPrices).toHaveBeenLastCalledWith(2020, { force: true })
  expect(calculator.input.gridFriendlyPrices).toBeNull()
})

test('snapshots day-ahead prices before awaiting generation', async () => {
  const { generateDayTimeOrder } = await import('./energyFlow.js')
  calculator.input.gridFriendlyChargingEnabled = true
  calculator.input.gridFriendlyPrices = Object.fromEntries(generateDayTimeOrder(2020).map(key => [key, 50]))
  const request = deferred()
  mocks.fetchGeneration.mockReturnValue(request.promise)
  const pending = calculator.calculate()
  calculator.input.gridFriendlyPrices['20200101:00'] = -20
  calculator.input.gridFriendlyPriceThreshold = -10
  request.resolve(generation())
  await flush()
  expect(workers[0].payload.input.gridFriendlyPrices['20200101:00']).toBe(50)
  expect(workers[0].payload.input.gridFriendlyPriceThreshold).toBe(0)
  reply(workers[0])
  await pending
  expect(calculator.isStale.value).toBe(true)
  expect(mocks.loadDayAheadPrices).not.toHaveBeenCalled()
})

test('migrates fork fixed costs to upstream base costs', () => {
  expect(calculator.input.batteryBaseCosts).toBe(1700)
  expect(calculator.input.batteryCostsFixed).toBeUndefined()
})
test('calculates successfully with a saved string year and a numeric worker summary', async () => {
  await restoreInput({ year: '2020' })
  const request = deferred()
  mocks.fetchGeneration.mockReturnValue(request.promise)
  const pending = calculator.calculate()
  expect(mocks.fetchGeneration.mock.calls[0][0].year).toBe(2020)
  calculator.input.year = 2019
  request.resolve(generation())
  await flush()
  expect(workers[0].payload.input.year).toBe(2020)
  reply(workers[0])
  await pending
  expect(calculator.error.value).toBeNull()
  expect(calculator.results.value.meta.year).toBe(2020)
  expect(calculator.consumptionSummary.value.year).toBe(2020)
  expect(calculator.results.value.economics.input.year).toBe(2020)
  expect(calculator.status.value).toBe('idle')
})
test.each([2004, 2024, '2004', '2024', 2019.5, '2019.5', 'invalid', null, {}, true, [2020]])(
  'calculate rejects unsupported year %j before fetching or starting a worker', async (year) => {
    calculator.input.year = year
    await calculator.calculate()
    expect(mocks.fetchGeneration).not.toHaveBeenCalled()
    expect(workers).toHaveLength(0)
    expect(calculator.results.value).toBeNull()
    expect(calculator.error.value).toBeTruthy()
    expect(calculator.status.value).toBe('idle')
  },
)
test.each([5000, '5000', 3000])('preserves legacy inverter cap %j as manual rather than roof power', async (power) => {
  await restoreInput({ maxPowerGenerationInverter: power })
  expect(calculator.input.inverterMode).toBe('manual')
  expect(calculator.totalPeakPower.value).toBe(10000)
  expect(calculator.limits.value.inverterPower).toBe(Number(power))
  await complete()
  expect(workers[0].payload.input.inverterMode).toBe('manual')
  expect(workers[0].payload.input.maxPowerGenerationInverter).toBe(power)
})
test.each([0, '0'])('migrates legacy zero inverter cap %j to no limit', async (power) => {
  await restoreInput({ maxPowerGenerationInverter: power })
  expect(calculator.input.inverterMode).toBe('none')
  expect(calculator.limits.value.inverterPower).toBe(0)
})
test.each([{}, { inverterMode: 'auto', maxPowerGenerationInverter: 5000 }])(
  'keeps automatic roof sizing for new inputs or an explicit auto mode: %j', async (savedInput) => {
    await restoreInput(savedInput)
    expect(calculator.input.inverterMode).toBe('auto')
    expect(calculator.limits.value.inverterPower).toBe(10000)
  },
)
test('year switch validates PVGIS range, numeric input and busy state, and awaits completion', async () => {
  for (const value of [2004, 2024, 2019.5, 'invalid', null, {}, true, 2020]) {
    await calculator.changeComparisonYear(value)
  }
  expect(mocks.fetchGeneration).not.toHaveBeenCalled()
  let settled = false
  const pending = calculator.changeComparisonYear('2019').then(() => { settled = true })
  await flush()
  expect(calculator.input.year).toBe(2019)
  expect(settled).toBe(false)
  await calculator.changeComparisonYear(2018)
  expect(calculator.input.year).toBe(2019)
  reply(workers[0])
  await pending
  expect(settled).toBe(true)
  expect(calculator.results.value.meta.year).toBe(2019)
  expect(calculator.consumptionSummary.value.year).toBe(2019)
  expect(calculator.status.value).toBe('idle')
})
test('snapshots nested input, roofs, address, offers, CSV and effective sizes before fetching', async () => {
  calculator.input.batteryPriceMode = 'offers'
  calculator.input.monthlyConsumption = Array(12).fill(400)
  calculator.consumptionMode.value = 'csv'
  calculator.csvImport.value = { fileName: 'load.csv', analysis: {
    errors: [], year: 2022, values: new Map([['source', 250]]),
  } }
  const request = deferred()
  mocks.fetchGeneration.mockReturnValue(request.promise)
  const pending = calculator.calculate()
  calculator.input.year = 2018
  calculator.input.roofs[0].peakpower = 9000
  calculator.input.roofs.push({ aspect: 90, angle: 45, peakpower: 2000 })
  calculator.input.monthlyConsumption[0] = 900
  calculator.input.batteryOffers[0] = { kwh: 30, price: 99000 }
  calculator.input.consumptionCosts = 2
  calculator.input.heatPumpEnabled = true
  calculator.input.evEnabled = true
  calculator.address.value.lat = '1'
  calculator.address.value.shortName = 'Changed'
  calculator.batterySizes.value.splice(0, 2, 20000)
  calculator.csvImport.value.analysis.values.set('source', 999)
  calculator.consumptionMode.value = 'profile'
  calculator.fillMethod.value = 'zero'
  request.resolve(generation())
  await flush()
  const worker = workers[0]
  expect(worker.payload.input.year).toBe(2020)
  expect(worker.payload.input.roofs).toEqual([{ aspect: 0, angle: 30, peakpower: 1000 }])
  expect(worker.payload.input.monthlyConsumption[0]).toBe(400)
  expect(worker.payload.input.batteryOffers[0]).toEqual({ kwh: 5, price: 3000 })
  expect(worker.payload.input.consumptionCosts).toBe(0.32)
  expect(worker.payload.input.heatPumpEnabled).toBe(false)
  expect(worker.payload.input.evEnabled).toBe(false)
  expect(worker.payload.batterySizes).toEqual([5000, 10000, 15000])
  expect(worker.payload.importedConsumption).toEqual({ '20200101:00': { P: 250 } })
  expect(mocks.fetchGeneration.mock.calls[0][0]).toMatchObject({ lat: '50.9', year: 2020 })
  reply(worker)
  await pending
  expect(calculator.results.value.meta).toMatchObject({ year: 2020, location: 'Cologne', peakPower: 1000, consumptionProfile: null })
  expect(calculator.results.value.economics.input).toEqual(worker.payload.input)
  expect(calculator.isStale.value).toBe(true)
})
test('preserves selected size, commits summary atomically and detects changed imported content', async () => {
  await complete()
  calculator.selectedSize.value = 10000
  const previous = calculator.results.value
  const pending = calculator.changeComparisonYear(2019)
  await flush()
  expect(calculator.results.value).toBe(previous)
  expect(calculator.consumptionSummary.value).toBe(previous.consumptionSummary)
  reply(workers.at(-1))
  await pending
  expect(calculator.selectedSize.value).toBe(10000)
  expect(calculator.isStale.value).toBe(false)
  expect(calculator.consumptionSummary.value).toBe(calculator.results.value.consumptionSummary)
  calculator.csvImport.value = { fileName: 'same.csv', analysis: { errors: [], values: new Map([['source', 1]]) } }
  await complete()
  calculator.csvImport.value = { fileName: 'same.csv', analysis: { errors: [], values: new Map([['source', 2]]) } }
  expect(calculator.isStale.value).toBe(true)
})
test.each(['fetch', 'worker', 'balance', 'summary', 'empty'])('failure (%s) retains prior result, summary and selection; finally clears busy', async (failure) => {
  await complete()
  calculator.selectedSize.value = 10000
  const previous = calculator.results.value
  const request = deferred()
  mocks.fetchGeneration.mockReturnValue(request.promise)
  const pending = calculator.changeComparisonYear(2019)
  expect(calculator.status.value).toBe('fetching')
  expect(calculator.results.value).toBe(previous)
  if (failure === 'fetch') request.reject(new Error('network failure'))
  else {
    request.resolve(generation())
    await flush()
    expect(calculator.status.value).toBe('simulating')
    const worker = workers.at(-1)
    if (failure === 'worker') worker.onerror({ message: 'Custom consumption: Invalid YAML' })
    if (failure === 'balance') reply(worker, { results: [{ size: 1, balance: { ok: false } }] })
    if (failure === 'summary') reply(worker, { consumptionSummary: { year: 2018 } })
    if (failure === 'empty') reply(worker, { results: [] })
  }
  await pending
  expect(calculator.results.value).toBe(previous)
  expect(calculator.consumptionSummary.value).toBe(previous.consumptionSummary)
  expect(calculator.selectedSize.value).toBe(10000)
  expect(calculator.error.value).toContain('Vorhandene Ergebnisse bleiben unverändert')
  expect(calculator.status.value).toBe('idle')
})

test('stalled worker times out after 120 seconds, retains results and ignores late messages', async () => {
  vi.useFakeTimers()
  await complete()
  calculator.selectedSize.value = 10000
  const previous = calculator.results.value
  const pending = calculator.changeComparisonYear(2019)
  await flush()
  const worker = workers.at(-1)
  const lateMessage = worker.onmessage
  expect(calculator.status.value).toBe('simulating')
  expect(vi.getTimerCount()).toBe(1)
  await vi.advanceTimersByTimeAsync(119999)
  expect(calculator.status.value).toBe('simulating')
  expect(worker.terminate).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  await pending
  expect(worker.terminate).toHaveBeenCalledTimes(1)
  expect(worker.onmessage).toBeNull()
  expect(worker.onerror).toBeNull()
  expect(worker.onmessageerror).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
  expect(calculator.status.value).toBe('idle')
  expect(calculator.canCalculate.value).toBe(true)
  expect(calculator.results.value).toBe(previous)
  expect(calculator.consumptionSummary.value).toBe(previous.consumptionSummary)
  expect(calculator.selectedSize.value).toBe(10000)
  expect(calculator.error.value).toContain('120 Sekunden wegen Zeitüberschreitung')
  expect(calculator.error.value).toContain('Vorhandene Ergebnisse bleiben unverändert')
  const timeoutError = calculator.error.value
  reply({ payload: worker.payload, onmessage: lateMessage })
  await flush()
  expect(calculator.results.value).toBe(previous)
  expect(calculator.error.value).toBe(timeoutError)
  expect(calculator.status.value).toBe('idle')
  expect(worker.terminate).toHaveBeenCalledTimes(1)
  await complete()
  const recovered = calculator.results.value
  reply({ payload: worker.payload, onmessage: lateMessage })
  await flush()
  expect(calculator.results.value).toBe(recovered)
  expect(calculator.results.value.meta.year).toBe(2019)
  expect(calculator.error.value).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
})

test.each(['success', 'worker error', 'error reply', 'message decode error', 'postMessage throw'])(
  'worker cleanup clears timeout and handlers on %s', async (exit) => {
    vi.useFakeTimers()
    await complete()
    calculator.selectedSize.value = 10000
    const previous = calculator.results.value
    if (exit === 'postMessage throw') {
      vi.spyOn(Worker.prototype, 'postMessage').mockImplementation(() => {
        throw new Error('postMessage failed')
      })
    }
    const pending = calculator.changeComparisonYear(2019)
    await flush()
    const worker = workers.at(-1)
    if (exit !== 'postMessage throw') {
      expect(vi.getTimerCount()).toBe(1)
      if (exit === 'success') reply(worker)
      if (exit === 'worker error') worker.onerror({ message: 'worker failed' })
      if (exit === 'error reply') reply(worker, { error: 'simulation failed' })
      if (exit === 'message decode error') worker.onmessageerror({})
    }
    await pending
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    expect(worker.onmessage).toBeNull()
    expect(worker.onerror).toBeNull()
    expect(worker.onmessageerror).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    expect(calculator.status.value).toBe('idle')
    expect(calculator.selectedSize.value).toBe(10000)
    if (exit === 'success') {
      expect(calculator.results.value).not.toBe(previous)
      expect(calculator.error.value).toBeNull()
    } else {
      expect(calculator.results.value).toBe(previous)
      expect(calculator.consumptionSummary.value).toBe(previous.consumptionSummary)
      expect(calculator.error.value).toContain('Vorhandene Ergebnisse bleiben unverändert')
      if (exit === 'message decode error') {
        expect(calculator.error.value).toContain('Ergebnisse der Simulation konnten nicht gelesen werden')
      }
      if (exit === 'postMessage throw') expect(calculator.error.value).toContain('postMessage failed')
    }
    const finalResult = calculator.results.value
    const finalError = calculator.error.value
    await vi.advanceTimersByTimeAsync(120000)
    expect(calculator.results.value).toBe(finalResult)
    expect(calculator.error.value).toBe(finalError)
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  },
)