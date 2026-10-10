import { describe, expect, test } from 'vitest'
import {
  applyHouseholdBaseload,
  addVariability,
  CONSUMPTION_PROFILES,
  DEFAULT_CONSUMPTION_PROFILE,
  getConsumptionProfile,
  monthlySums,
  scaleToMonths,
  validMonthly,
  validateHouseholdProfile,
} from './consumptionProfiles.js'
import { calculateConsumption } from './energyFlow.js'
import { HOUR_MODELS } from './hourModels/index.js'
import { factorFunction, PROFILEBASE, SLPH0 } from './SLP.js'

const sum = (consumption) =>
  Object.values(consumption).reduce((total, { P }) => total + P, 0)

const daySums = (consumption) => {
  const days = {}
  for (const [key, { P }] of Object.entries(consumption)) {
    const day = key.slice(0, 8)
    days[day] = (days[day] ?? 0) + P
  }
  return days
}

describe('registry', () => {
  test('ids are unique and the default exists', () => {
    const ids = CONSUMPTION_PROFILES.map((profile) => profile.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain(DEFAULT_CONSUMPTION_PROFILE)
  })

  test('unknown ids fall back to the default', () => {
    expect(getConsumptionProfile('unknown').id).toBe(
      DEFAULT_CONSUMPTION_PROFILE,
    )
  })

  test('every hour model names an existing profile', () => {
    for (const model of HOUR_MODELS) {
      expect(getConsumptionProfile(model.consumptionProfile).id).toBe(
        model.consumptionProfile,
      )
    }
  })

  test('the classic model keeps the plain H0 profile', () => {
    expect(
      HOUR_MODELS.find((model) => model.id === 'legacyRegression')
        .consumptionProfile,
    ).toBe('h0')
  })
})

describe.each(CONSUMPTION_PROFILES)('profile $id', (profile) => {
  const consumption = profile.build({ year: 2020, consumptionYear: 5000000 })

  test('covers every hour of the year', () => {
    expect(Object.keys(consumption)).toHaveLength(8784)
  })

  test('keeps the yearly consumption', () => {
    expect(sum(consumption)).toBeCloseTo(
      sum(
        calculateConsumption({
          year: 2020,
          consumptionYear: 5000000,
          profile: SLPH0,
          profileBase: PROFILEBASE,
          factorFunction,
        }),
      ),
      3,
    )
  })

  test('has no negative hours', () => {
    expect(Object.values(consumption).every(({ P }) => P >= 0)).toBe(true)
  })
})

describe('h0 calibrated', () => {
  const h0 = getConsumptionProfile('h0').build({
    year: 2020,
    consumptionYear: 5000000,
  })
  const calibrated = getConsumptionProfile('h0Calibrated').build({
    year: 2020,
    consumptionYear: 5000000,
  })

  test('every day keeps its energy from H0', () => {
    const before = daySums(h0)
    const after = daySums(calibrated)
    for (const day of Object.keys(before)) {
      expect(after[day]).toBeCloseTo(before[day], 6)
    }
  })

  test('varies much more from hour to hour than H0', () => {
    const spread = (consumption) => {
      const values = Object.values(consumption).map(({ P }) => P)
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      const variance =
        values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
      return Math.sqrt(variance) / mean
    }
    expect(spread(calibrated)).toBeGreaterThan(2 * spread(h0))
  })

  test('is reproducible', () => {
    expect(addVariability(h0)).toEqual(calibrated)
  })
})

describe('monthly consumption', () => {
  const h0 = getConsumptionProfile('h0').build({
    year: 2021,
    consumptionYear: 4000000,
  })
  const monthly = [500, 450, 400, 300, 250, 200, 200, 220, 260, 330, 400, 490]

  test('monthlySums adds the hours of each month', () => {
    const sums = monthlySums(h0)
    expect(sums).toHaveLength(12)
    expect(sums.reduce((a, b) => a + b, 0)).toBeCloseTo(sum(h0), 3)
    expect(sums[0]).toBeGreaterThan(sums[5])
  })

  test('scaleToMonths hits every monthly value', () => {
    const scaled = scaleToMonths(
      h0,
      monthly.map((kwh) => kwh * 1000),
    )
    monthlySums(scaled).forEach((value, i) =>
      expect(value).toBeCloseTo(monthly[i] * 1000, 6),
    )
    expect(Object.keys(scaled)).toEqual(Object.keys(h0))
  })

  test('the shape within a month stays the same', () => {
    const scaled = scaleToMonths(h0, new Array(12).fill(1000))
    const ratio = (c) => c['20210115:12'].P / c['20210115:03'].P
    expect(ratio(scaled)).toBeCloseTo(ratio(h0), 9)
  })

  test('validMonthly needs 12 values that are not all 0', () => {
    expect(validMonthly(monthly)).toBe(true)
    expect(validMonthly(monthly.slice(1))).toBe(false)
    expect(validMonthly(new Array(12).fill(0))).toBe(false)
    expect(validMonthly([-1, ...monthly.slice(1)])).toBe(false)
    expect(validMonthly(null)).toBe(false)
  })
})

describe('advanced household profile settings', () => {
  const profile = (year, sigma = 1) => getConsumptionProfile('h0Calibrated').build({
    year, consumptionYear: 6000, sigma,
  })

  test('sigma zero gives smooth H0 and custom sigma remains reproducible', () => {
    const smooth = getConsumptionProfile('h0').build({ year: 2023, consumptionYear: 6000 })
    expect(profile(2023, 0)).toEqual(smooth)
    expect(profile(2023, 0.4)).toEqual(profile(2023, 0.4))
    expect(profile(2023, 0.4)).not.toEqual(profile(2023))
    const before = daySums(smooth)
    for (const [day, energy] of Object.entries(daySums(profile(2023, 0.4))))
      expect(energy).toBeCloseTo(before[day], 6)
  })

  test.each([2020, 2023])('baseload preserves the annual budget and hourly floor in %s', year => {
    const consumption = profile(year)
    const result = applyHouseholdBaseload(consumption, {
      year, yearlyConsumption: 6000, householdBaseloadW: 500,
    })
    expect(sum(result)).toBeCloseTo(6000000, 6)
    expect(Object.values(result).every(({ P }) => Number.isFinite(P) && P >= 500)).toBe(true)
    expect(applyHouseholdBaseload(consumption, { year, yearlyConsumption: 6000, householdBaseloadW: 0 })).toBe(consumption)
  })

  test('monthly budgets reserve baseload using actual leap-year hours', () => {
    const monthly = Array(12).fill(600)
    monthly[1] = 348 // 696 hours at exactly 500 W
    const input = { year: 2020, householdBaseloadW: 500, monthlyConsumptionEnabled: true, monthlyConsumption: monthly }
    const result = applyHouseholdBaseload(profile(2020), input)
    monthlySums(result).forEach((energy, month) => expect(energy).toBeCloseTo(monthly[month] * 1000, 6))
    expect(Object.entries(result).filter(([key]) => key.startsWith('202002')).every(([, { P }]) => P === 500)).toBe(true)
    monthly[1] = 347
    expect(() => applyHouseholdBaseload(profile(2020), input)).toThrow('2020-02')
  })

  test('rejects impossible annual or zero-month budgets and invalid settings', () => {
    expect(() => validateHouseholdProfile({ year: 2023, yearlyConsumption: 4000, householdBaseloadW: 500 })).toThrow('Höchstens möglich:')
    expect(() => validateHouseholdProfile({ year: 2023, householdBaseloadW: 1, monthlyConsumptionEnabled: true, monthlyConsumption: [0, ...Array(11).fill(600)] })).toThrow('2023-01')
    for (const householdSigma of [-1, Infinity, NaN, 6])
      expect(() => validateHouseholdProfile({ year: 2023, yearlyConsumption: 6000, householdSigma })).toThrow('Sigma')
    expect(() => validateHouseholdProfile({ year: 2023, yearlyConsumption: 6000, householdBaseloadW: -1 })).toThrow('Grundlast')
  })
})
