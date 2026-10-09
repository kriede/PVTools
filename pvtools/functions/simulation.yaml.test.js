import { expect, test } from 'vitest'
import { parseCustomConsumptions, addCustomConsumptions, summarizeCustomConsumptions } from './customConsumption.js'
import { generateDayTimeValues } from './energyFlow.js'
import { simulateBatterySizes } from './simulation.js'
import regressionDb from './regression.json'

test('YAML enters household energy, upstream loads remain separate and monthly battery throughput is finite', () => {
  const base = {}
  const generation = {}
  for (let t = Date.UTC(2020, 0, 1); t < Date.UTC(2021, 0, 1); t += 3600000) {
    const date = new Date(t)
    const key = `2020${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}:${String(date.getUTCHours()).padStart(2, '0')}`
    base[key] = { P: 100 }
    generation[key] = { P: date.getUTCHours() >= 10 && date.getUTCHours() < 16 ? 2000 : 0, temperature: 5 }
  }
  const entries = parseCustomConsumptions('consumptions:\n  - name: Heater\n    type: heating\n    power: 500\n    schedule: "06:00-08:00"\n    start-date: "2024-01-01"\n    end-date: "2024-12-31"')
  const consumption = addCustomConsumptions(base, entries, 2020)
  const householdKwh = 878.4 + summarizeCustomConsumptions(entries, 2020)[0].energyKwh
  const input = {
    year: 2020, hourModel: 'loadDistribution', batterySocMinPercent: 10,
    batteryLoadEfficiency: 90, batteryUnloadEfficiency: 90,
    consumptionCosts: 0.32, feedInCompensation: 0.08,
    installationCostsWithoutBattery: 10000, batteryCostsPerKwh: 500,
    amortizationYears: 1, linearConsumptionChange: 0, linearSelfUseRateChange: 0,
    linearConsumptionCostsChange: 0, linearDegrationModules: 0,
    heatPumpEnabled: true, heatPumpMode: 'consumption', heatPumpConsumption: 500,
    evEnabled: true, evKmPerYear: 1000, evConsumption: 20, evHomeShare: 100,
    evPower: 3600, evBatteryKwh: 50, evPresence: 'home', evChargingMode: 'immediate',
  }
  const results = simulateBatterySizes({
    powerGenAndConsumption: generateDayTimeValues({ consumption, powerGeneration: generation, year: 2020 }),
    input, batterySizes: [6000], regressionDb,
  })
  for (const result of results) {
    expect(result.balance.ok).toBe(true)
    expect(result.consumers.household.consumption).toBeCloseTo(householdKwh, 6)
    expect(result.consumers.heatPump.consumption).toBeGreaterThan(0)
    expect(result.consumers.ev.consumption).toBeGreaterThan(0)
    expect(result.consumptionYear).toBeCloseTo(householdKwh + result.consumers.heatPump.consumption + result.consumers.ev.consumption, 6)
    for (const month of result.monthlyData) {
      expect(Number.isFinite(month.batteryLoad)).toBe(true)
      const rows = result.energyFlow.filter(row => Number(row.dayTime.slice(4, 6)) === month.month)
      expect(month.batteryLoad).toBeCloseTo(rows.reduce((sum, row) => sum + row.batteryCharge + row.batteryDischarge, 0), 6)
    }
    expect(result.monthlyData.reduce((sum, month) => sum + month.batteryLoad, 0) / 1000).toBeCloseTo(result.batteryCharge + result.batteryDischarge, 6)
  }
  expect(results[0].monthlyData.every(month => month.batteryLoad === 0)).toBe(true)
  expect(results[1].batteryCharge).toBeGreaterThan(0)
  expect(results[1].batteryDischarge).toBeGreaterThan(0)
})