import {
  calculateConsumption,
  generateDayTimeValues,
  normalizeHourlyRadiation,
} from './energyFlow.js'
import {
  checkEnergyBalance,
  paybackYears,
  resolveLimits,
  simulateBatterySizes,
} from './simulation.js'
import { factorFunction, PROFILEBASE, SLPH0 } from './SLP.js'
import regressionDb from './regression.json'
import seriescalc from './seriescalc.json'

const input = {
  yearlyConsumption: 5000,
  consumptionCosts: 0.32,
  feedInCompensation: 0.086,
  installationCostsWithoutBattery: 10000,
  batteryCostsPerKwh: 500,
  batteryLoadEfficiency: 99,
  batteryUnloadEfficiency: 99,
  batterySocMinPercent: 10,
  year: 2020,
  maxPowerGenerationInverter: 5000,
  maxPowerGenerationBattery: 0,
  maxPowerLoadBattery: 0,
  maxPowerFeedIn: 0,
  amortizationYears: 20,
  linearDegrationModules: 0.5,
  linearConsumptionChange: 0.5,
  linearConsumptionCostsChange: 0,
  linearSelfUseRateChange: 0,
}

const powerGenAndConsumption = generateDayTimeValues({
  consumption: calculateConsumption({
    year: 2020,
    consumptionYear: input.yearlyConsumption,
    profile: SLPH0,
    profileBase: PROFILEBASE,
    factorFunction,
  }),
  powerGeneration: normalizeHourlyRadiation(seriescalc.outputs.hourly),
  year: 2020,
})

const results = simulateBatterySizes({
  powerGenAndConsumption,
  input,
  batterySizes: [2000, 6000, 12000],
  regressionDb,
})

const KEYS = [
  'size',
  'generationYear',
  'consumptionYear',
  'selfUsedEnergy',
  'fedInPower',
  'gridUsedEnergy',
  'selfSufficiencyRate',
  'selfUseRate',
  'costSavings',
  'amortization',
  'costSavingsBattery',
  'batteryAmortization',
]

describe('simulateBatterySizes', () => {
  test('annual consumption matches an independent UTC calendar calculation', () => {
    // Inclusive SLP season ends in leap-year day ordinals, independent of
    // calculateConsumption's date parsing and iteration. No day 367 exists.
    const seasonEnds = [81, 136, 259, 306, 366]
    let expectedWh = 0
    for (let day = 1; day <= 366; day++) {
      const weekday = new Date(Date.UTC(2020, 0, day)).getUTCDay()
      const kind = weekday === 0 ? 'sun' : weekday === 6 ? 'sat' : 'weekdays'
      const season = SLPH0[seasonEnds.findIndex(end => day <= end)]
      const multiplier = -0.000000000392 * day ** 4 + 0.00000032 * day ** 3
        - 0.0000702 * day ** 2 + 0.0021 * day + 1.24
      for (let hour = 0; hour < 24; hour++) {
        expectedWh += season.profileDays[kind][hour] * 5 * multiplier
      }
    }
    expect(powerGenAndConsumption).toHaveLength(8784)
    expect(powerGenAndConsumption[0].dayTime).toBe('20200101:00')
    expect(powerGenAndConsumption.at(-1).dayTime).toBe('20201231:23')
    expect(expectedWh / 1000).toBeCloseTo(5001.352239139398, 9)
    for (const result of results) {
      expect(result.consumptionYear).toBeCloseTo(expectedWh / 1000, 9)
    }
  })

  test('returns one result per size plus the case without battery', () => {
    expect(results.map((r) => r.size)).toEqual([1, 2000, 6000, 12000])
  })

  test('energy balance holds for every size', () => {
    results.forEach((r) => {
      expect(r.selfUsedEnergy + r.gridUsedEnergy).toBeCloseTo(
        r.consumptionYear,
        6,
      )
      expect(r.energyFlow).toHaveLength(powerGenAndConsumption.length)
      expect(r.monthlyData).toHaveLength(12)
    })
  })

  test('a bigger battery increases self sufficiency', () => {
    for (let i = 1; i < results.length; i++) {
      expect(results[i].selfSufficiencyRate).toBeGreaterThan(
        results[i - 1].selfSufficiencyRate,
      )
    }
  })

  test('key figures stay unchanged', () => {
    const rounded = results.map((r) =>
      Object.fromEntries(KEYS.map((k) => [k, Number(r[k].toFixed(4))])),
    )
    expect(rounded).toMatchSnapshot()
  })
})

describe('battery usage', () => {
  test('full cycles are the discharged energy divided by the capacity', () => {
    results.slice(1).forEach((r) => {
      expect(r.fullCycles).toBeCloseTo((r.batteryDischarge * 1000) / r.size, 9)
      expect(r.fullCycles).toBeGreaterThan(0)
    })
    expect(results[0].fullCycles).toBe(0)
  })

  test('state of charge stays between the minimum and the capacity', () => {
    results.slice(1).forEach((r) => {
      expect(r.socMinPercent).toBeGreaterThanOrEqual(
        input.batterySocMinPercent - 1e-9,
      )
      expect(r.socMaxPercent).toBeLessThanOrEqual(100 + 1e-9)
      expect(r.socMaxPercent).toBeGreaterThan(r.socMinPercent)
    })
  })

  test('every hour has the state of charge before and after', () => {
    const rows = results[1].energyFlow
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].batterySoc).toBe(rows[i - 1].newBatterySoc)
    }
    expect(Object.keys(rows[0]).slice(0, 3)).toEqual([
      'dayTime',
      'batterySoc',
      'newBatterySoc',
    ])
  })
})

describe('energy balance', () => {
  test('holds for every battery size', () => {
    results.forEach((r) => {
      expect(r.balance.ok).toBe(true)
    })
  })

  test('detects energy that got lost', () => {
    const rows = results[2].energyFlow.map((row) => ({ ...row }))
    rows[4000] = {
      ...rows[4000],
      feedInEnergyGrid: rows[4000].feedInEnergyGrid + 50,
    }
    expect(checkEnergyBalance(rows, 2000 * 0.1).ok).toBe(false)
  })

  test('battery charge and discharge are reported', () => {
    expect(results[0].batteryCharge).toBe(0)
    expect(results[1].batteryCharge).toBeGreaterThan(0)
    expect(results[1].batteryDischarge).toBeGreaterThan(0)
  })
})

describe('limits', () => {
  const roofs = [{ peakpower: 8000 }, { peakpower: 4000 }]

  test('inverter: auto uses the installed PV power', () => {
    expect(resolveLimits({ roofs, inverterMode: 'auto' }).inverterPower).toBe(
      12000,
    )
    expect(
      resolveLimits({
        roofs,
        inverterMode: 'manual',
        maxPowerGenerationInverter: 5000,
      }).inverterPower,
    ).toBe(5000)
    expect(resolveLimits({ roofs, inverterMode: 'none' }).inverterPower).toBe(0)
  })

  test('feed-in: none, fixed, percent and zero', () => {
    expect(resolveLimits({ roofs, feedInMode: 'none' }).feedInLimit).toBe(
      Infinity,
    )
    expect(
      resolveLimits({ roofs, feedInMode: 'watt', maxPowerFeedIn: 800 })
        .feedInLimit,
    ).toBe(800)
    expect(
      resolveLimits({ roofs, feedInMode: 'percent', feedInPercent: 60 })
        .feedInLimit,
    ).toBe(7200)
    expect(resolveLimits({ roofs, feedInMode: 'zero' }).feedInLimit).toBe(0)
  })

  test('inputs saved before the modes existed keep their meaning', () => {
    expect(
      resolveLimits({ roofs, maxPowerGenerationInverter: 5000 }).inverterPower,
    ).toBe(5000)
    expect(resolveLimits({ roofs, maxPowerFeedIn: 0 }).feedInLimit).toBe(
      Infinity,
    )
    expect(resolveLimits({ roofs, maxPowerFeedIn: 4600 }).feedInLimit).toBe(
      4600,
    )
  })

  test('zero feed-in never feeds into the grid', () => {
    const [, withBattery] = simulateBatterySizes({
      powerGenAndConsumption,
      input: { ...input, roofs, feedInMode: 'zero' },
      batterySizes: [6000],
      regressionDb,
    })
    expect(withBattery.fedInPower).toBe(0)
    expect(withBattery.missedFeedInPowerGrid).toBeGreaterThan(0)
    expect(withBattery.balance.ok).toBe(true)
  })
})

describe('payback', () => {
  test('is Infinity without savings', () => {
    expect(paybackYears(1000, 0)).toBe(Infinity)
    expect(paybackYears(1000, -50)).toBe(Infinity)
    expect(paybackYears(1000, 100)).toBe(10)
  })
})

describe('legacy hour model', () => {
  test('key figures stay unchanged', () => {
    const legacy = simulateBatterySizes({
      powerGenAndConsumption,
      input: { ...input, hourModel: 'legacyRegression' },
      batterySizes: [2000, 6000, 12000],
      regressionDb,
    })
    legacy.forEach((r) => expect(r.balance.ok).toBe(true))
    const rounded = legacy.map((r) =>
      Object.fromEntries(KEYS.map((k) => [k, Number(r[k].toFixed(4))])),
    )
    expect(rounded).toMatchSnapshot()
  })
})
