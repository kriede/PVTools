import { energyFlow } from './energyFlow.js'
import { planChargingSocTarget } from './gridFriendlyCharging.js'
import { simulateBatterySizes } from './simulation.js'
import regressionDb from './regression.json'

const defaults = {
  consumptionCosts: 0.32, feedInCompensation: 0.08,
  installationCostsWithoutBattery: 1000, batteryCostsPerKwh: 500,
  batteryLoadEfficiency: 100, batteryUnloadEfficiency: 100,
  batterySocMinPercent: 0, amortizationYears: 1,
  linearDegrationModules: 0, linearConsumptionChange: 0,
  linearConsumptionCostsChange: 0, linearSelfUseRateChange: 0,
}
const rowsOf = (powers) => powers.map((P, i) => ({
  P, consumption: 0,
  dayTime: `202001${String(1 + Math.floor(i / 24)).padStart(2, '0')}:${String(i % 24).padStart(2, '0')}`,
}))
const run = (rows, settings = {}, batterySizes = [1000]) => simulateBatterySizes({
  powerGenAndConsumption: rows, input: { ...defaults, ...settings },
  batterySizes, regressionDb,
})
const enabled = (rows, stressed = [1]) => ({
  gridFriendlyChargingEnabled: true,
  gridFriendlyPriceThreshold: 0,
  gridFriendlyPrices: Object.fromEntries(rows.map((row, i) => [row.dayTime, stressed.includes(i) ? 0 : 100])),
})

describe.each(['loadDistribution', 'legacyRegression'])('%s grid-friendly dispatch', (hourModel) => {
  test('reserves before stress and absorbs during stress instead of greedy charging', () => {
    const rows = rowsOf([1000, 1000])
    const greedy = run(rows, { hourModel })
    const smart = run(rows, { hourModel, ...enabled(rows) })
    expect(greedy[1].energyFlow.map(row => row.batteryCharge)).toEqual([1000, 0])
    expect(smart[1].energyFlow.map(row => row.batteryCharge)).toEqual([0, 1000])
    expect(smart[1].gridFriendlyCharging).toEqual({ active: true, stressedHours: 1, feedInDuringStressKwh: 0 })
    expect(smart[0].gridFriendlyCharging).toEqual({ active: false, stressedHours: 1, feedInDuringStressKwh: 1 })
    const { gridFriendlyCharging, ...baseline } = smart[0]
    expect(baseline).toEqual(greedy[0])
    expect(smart[1].costSavings).toBe(greedy[1].costSavings)
  })

  test('disabled results are byte identical, even with invalid wholesale inputs', () => {
    const rows = rowsOf([1000, 1000, 300])
    rows[2].consumption = 400
    const original = run(rows, { hourModel })
    const disabled = run(rows, { hourModel, gridFriendlyChargingEnabled: false,
      gridFriendlyPriceThreshold: NaN, gridFriendlyPrices: { invalid: Infinity } })
    expect(JSON.stringify(disabled)).toBe(JSON.stringify(original))
    expect(disabled[1]).not.toHaveProperty('gridFriendlyCharging')
  })

  test('24-row horizon sees offset 23 but not offset 24', () => {
    const rows = rowsOf([1000, ...new Array(23).fill(0), 1000])
    const outside = run(rows, { hourModel, ...enabled(rows, [24]) })[1]
    expect(outside.energyFlow[0].batteryCharge).toBe(1000)
    rows[23].P = 1000
    const inside = run(rows, { hourModel, ...enabled(rows, [23]) })[1]
    expect(inside.energyFlow[0].batteryCharge).toBe(0)
  })

  test('literal zero pauses charging without clipping existing SOC or blocking discharge', () => {
    const params = { energyGeneration: 1000, energyConsumption: 0,
      batterySoc: 500, batterySocMin: 100, batterySocMax: 1000,
      chargingSocTarget: 0, hourModel, regressionDb }
    const paused = energyFlow(params)
    expect(paused.batteryCharge).toBe(0)
    expect(paused.newBatterySoc).toBe(500)
    expect(paused.feedInEnergyGrid).toBe(1000)
    expect(energyFlow({ ...params, chargingSocTarget: undefined }).batteryCharge).toBe(500)
    const discharged = energyFlow({ ...params, energyGeneration: 50, energyConsumption: 400 })
    expect(discharged.batteryDischarge).toBeGreaterThan(0)
    expect(discharged.newBatterySoc).toBeGreaterThanOrEqual(100)
    expect(discharged.batteryCharge).toBe(0)
    expect(discharged.feedInEnergyGrid).toBeLessThanOrEqual(50)
    const night = energyFlow({ ...params, energyGeneration: 0, energyConsumption: 400 })
    expect(night.batteryCharge).toBe(0)
    expect(night.feedInEnergyGrid).toBe(0)
    expect(night.batteryDischarge).toBeGreaterThan(0)
  })

  test('power, efficiency, SOC, curtailment and per-hour energy conservation', () => {
    const rows = rowsOf([2000, 2000, 200])
    rows[2].consumption = 500
    const results = run(rows, { hourModel, ...enabled(rows),
      batterySocMinPercent: 20, batteryLoadEfficiency: 80,
      batteryUnloadEfficiency: 90, maxPowerLoadBattery: 500,
      maxPowerGenerationBattery: 300, maxPowerGenerationInverter: 1500,
      feedInMode: 'zero' })
    expect(results[1].energyFlow[0].batteryCharge).toBe(500)
    expect(results[1].energyFlow[1].batteryCharge).toBe(500)
    expect(results[1].energyFlow[1].newBatterySoc).toBe(1000)
    for (const result of results) {
      expect(result.balance.ok).toBe(true)
      for (const row of result.energyFlow) {
        expect(row.batteryCharge).toBeLessThanOrEqual(500)
        expect(row.newBatterySoc).toBeGreaterThanOrEqual(result.size === 1 ? 1 : 200)
        expect(row.newBatterySoc).toBeLessThanOrEqual(result.size)
        expect(row.powerProduction).toBeCloseTo(row.missedInverterPower + row.selfUsedEnergyPV
          + row.lossesPvGeneration + row.batteryCharge + row.feedInEnergyGrid + row.missedFeedInPowerGrid, 8)
        expect(row.newBatterySoc).toBeCloseTo(row.batterySoc + row.batteryCharge
          - row.lossesLoadBattery - row.batteryDischarge, 8)
        expect(row.energyConsumption).toBeCloseTo(row.selfUsedEnergy + row.gridUsedEnergy, 8)
      }
    }
  })

  test('forecast uses configured heat-pump and EV loads, not gross generation', () => {
    const rows = rowsOf(new Array(14).fill(5000))
    const settings = { hourModel, ...enabled(rows, [12]),
      heatPumpEnabled: true, heatPumpMode: 'consumption', heatPumpConsumption: 10,
      evEnabled: true, evChargingMode: 'surplus', evPresence: 'home',
      evKmPerYear: 15000, evConsumption: 20, evHomeShare: 100,
      evPower: 3000, evBatteryKwh: 60 }
    const results = run(rows, settings, [10000])
    const flow = results[0].energyFlow[12]
    expect(flow.flatConsumption).toBeGreaterThan(0)
    expect(flow.pvDirectConsumption).toBeGreaterThan(0)
    const surplus = flow.feedInEnergyGrid + flow.missedFeedInPowerGrid
    expect(surplus).toBeLessThan(5000)
    // The baseline is also the planner's cache, after EV direct consumption.
    expect(planChargingSocTarget({ index: 0, noBatteryFlows: results[0].energyFlow,
      stressedHours: rows.map((_, i) => i === 12), batterySocMin: 0,
      batterySocMax: 10000 })).toBeCloseTo(10000 - surplus, 8)
    const first = results[0].energyFlow[0]
    expect(results[1].energyFlow[0].batteryCharge).toBeCloseTo(Math.min(
      first.feedInEnergyGrid + first.missedFeedInPowerGrid, 10000 - surplus,
    ), 8)
    expect(results[1].balance.ok).toBe(true)
    expect(results[1].consumers).toEqual(expect.objectContaining({
      heatPump: expect.any(Object), ev: expect.any(Object),
    }))
  })
})

describe('standalone complete price validation', () => {
  test.each([undefined, null, NaN, Infinity, -Infinity, '0'])('rejects non-finite/non-numeric price %s even for baseline only', (price) => {
    const rows = rowsOf([0, 0])
    const settings = enabled(rows)
    settings.gridFriendlyPrices[rows[1].dayTime] = price
    expect(() => run(rows, settings, [])).toThrow(rows[1].dayTime)
  })
  test('rejects missing and inherited values, and checks rows beyond forecast horizon', () => {
    const rows = rowsOf(new Array(30).fill(0))
    const settings = enabled(rows)
    delete settings.gridFriendlyPrices[rows[29].dayTime]
    expect(() => run(rows, settings, [])).toThrow('20200102:05')
    settings.gridFriendlyPrices = Object.create(enabled(rows).gridFriendlyPrices)
    expect(() => run(rows, settings, [])).toThrow(rows[0].dayTime)
    expect(() => run(rows, { gridFriendlyChargingEnabled: true }, [])).toThrow('EUR/MWh')
  })
  test('threshold is inclusive, defaults to zero, supports negative prices', () => {
    const rows = rowsOf([1000, 1000, 1000])
    const settings = enabled(rows, [1, 2])
    delete settings.gridFriendlyPriceThreshold
    settings.gridFriendlyPrices[rows[2].dayTime] = -50
    expect(run(rows, settings)[1].gridFriendlyCharging.stressedHours).toBe(2)
    expect(run(rows, { ...settings, gridFriendlyPriceThreshold: -50 })[1].gridFriendlyCharging.stressedHours).toBe(1)
    expect(() => run(rows, { ...settings, gridFriendlyPriceThreshold: Infinity })).toThrow('Preisschwelle')
  })
})

test('planner caps summed future gains by usable capacity and ignores future deficits conservatively', () => {
  const noBatteryFlows = [0, 5000, 5000].map(feedInEnergyGrid => ({
    feedInEnergyGrid, missedFeedInPowerGrid: 0, gridUsedEnergy: 10000,
  }))
  const params = { index: 0, noBatteryFlows, stressedHours: [false, true, true],
    batterySocMin: 200, batterySocMax: 1000, batteryLoadEfficiency: 0.8 }
  expect(planChargingSocTarget(params)).toBe(200)
  expect(planChargingSocTarget({ ...params, maxPowerLoadBattery: 100 })).toBe(840)
  expect(planChargingSocTarget({ ...params, stressedHours: null })).toBe(Infinity)
  expect(planChargingSocTarget({ ...params, index: 1 })).toBe(Infinity)
  expect(planChargingSocTarget({ ...params, index: 2, stressedHours: [false, false, false] })).toBe(1000)
})