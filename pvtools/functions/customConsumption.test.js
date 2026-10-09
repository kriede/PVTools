import { expect, test } from 'vitest'
import customConsumptionYaml from '../custom-consumption.yaml?raw'
import { parseCustomConsumptions, addCustomConsumptions, summarizeCustomConsumptions } from './customConsumption.js'
import { calculateConsumption, generateDayTimeValues, energyFlow } from './energyFlow.js'
import { SLPH0, PROFILEBASE, factorFunction } from './SLP.js'
import regressionDb from './regression.json'

function base(year, power = 100) {
  const result = {}
  for (let t = Date.UTC(year, 0, 1); t < Date.UTC(year + 1, 0, 1); t += 3600000) {
    const date = new Date(t)
    const key = `${year}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}:${String(date.getUTCHours()).padStart(2, '0')}`
    result[key] = { P: power }
  }
  return result
}
function heater(overrides = {}) {
  return { name: 'Heater', type: 'heating', power: 2500, schedule: '05:30-07:15',
    'start-date': '2024-04-01', 'end-date': '2024-04-02', ...overrides }
}
function car(overrides = {}) {
  return { name: 'Car', type: 'electric-car', power: 11000, capacity: 50000,
    starts: 'monday:20%,20:00', ...overrides }
}
function parse(entries) { return parseCustomConsumptions(JSON.stringify({ consumptions: entries })) }
function total(profile) { return Object.values(profile).reduce((sum, hour) => sum + hour.P, 0) }

test('parses actual YAML and combines every configured consumer with household load', () => {
  const entries = parseCustomConsumptions(customConsumptionYaml)
  expect(entries).toHaveLength(5)
  const original = base(2020)
  const profile = addCustomConsumptions(original, entries, 2020)
  const energyKwh = summarizeCustomConsumptions(entries, 2020).reduce((sum, item) => sum + item.energyKwh, 0)
  expect(total(profile) - total(original)).toBeCloseTo(energyKwh * 1000, 3)
  expect(original['20200401:05'].P).toBe(100)
})

test('recurring heating includes both dates and prorates partial hours', () => {
  const profile = addCustomConsumptions(base(2020), parse([heater()]), '2020')
  expect(profile['20200401:05'].P).toBe(1350)
  expect(profile['20200402:06'].P).toBe(2600)
  expect(profile['20200402:07'].P).toBe(725)
  expect(profile['20200403:06'].P).toBe(100)
  expect(total(profile) - total(base(2020))).toBe(8750)
})

test('summaries report annual sessions, scheduled days, operating hours and kWh', () => {
  const entries = parse([
    heater({ schedule: '05:00-22:00', 'end-date': '2024-05-31' }),
    heater({ schedule: '08:00-19:00', 'start-date': '2024-06-01', 'end-date': '2024-08-31' }),
    heater({ schedule: '05:00-22:00', 'start-date': '2024-09-01', 'end-date': '2024-10-31' }),
    car({ starts: 'monday:20%,20:00,tuesday:20%,20:00,wednesday:20%,08:00,friday:20%,08:00' }),
    car({ starts: 'monday:20%,20:00,wednesday:20%,08:00,friday:20%,15:00' })
  ])
  const summaries = summarizeCustomConsumptions(entries, '2020')
  expect(summaries[0]).toEqual({ name: entries[0].name, type: 'heating', count: 61, hours: 1037, energyKwh: 2592.5 })
  expect(summaries[1].count).toBe(92)
  expect(summaries[2].count).toBe(61)
  expect(summaries[3].count).toBe(209)
  expect(summaries[3].energyKwh).toBeCloseTo(2090)
  expect(summaries[4].count).toBe(157)
  expect(summaries[4].energyKwh).toBeCloseTo(1570)
  const profile = addCustomConsumptions(base(2020, 0), entries, 2020)
  expect(summaries.reduce((sum, item) => sum + item.energyKwh, 0)).toBeCloseTo(total(profile) / 1000, 4)
})

test('summaries include partial hours, leap-day schedules and empty configurations', () => {
  expect(summarizeCustomConsumptions(parse([heater()]), 2020)[0]).toEqual({
    name: 'Heater', type: 'heating', count: 2, hours: 3.5, energyKwh: 8.75
  })
  const entries = parse([heater({ schedule: '00:00-24:00', 'start-date': '2024-02-29', 'end-date': '2024-02-29' })])
  expect(summarizeCustomConsumptions(entries, 2019)[0]).toMatchObject({ count: 0, hours: 0, energyKwh: 0 })
  expect(summarizeCustomConsumptions(entries, 2020)[0]).toMatchObject({ count: 1, hours: 24, energyKwh: 60 })
  expect(summarizeCustomConsumptions([], 2020)).toEqual([])
  expect(() => summarizeCustomConsumptions([], 'invalid')).toThrow('Ungültiges Berechnungsjahr')
})

test('summaries count in-year starts but clip energy and hours at New Year', () => {
  const entries = parse([
    heater({ schedule: '23:00-01:00', 'start-date': '2024-12-31', 'end-date': '2024-01-01' }),
    car({ starts: 'tuesday:60%,22:00' })
  ])
  const summaries = summarizeCustomConsumptions(entries, 2020)
  expect(summaries[0]).toMatchObject({ count: 2, hours: 4, energyKwh: 10 })
  expect(summaries[1].count).toBe(52)
  expect(summaries[1].energyKwh).toBeCloseTo(total(addCustomConsumptions(base(2020, 0), [entries[1]], 2020)) / 1000, 4)
  expect(summaries[1].energyKwh).toBeGreaterThan(52 * 30)
})

test('overnight heating continues after the final active start date', () => {
  const profile = addCustomConsumptions(base(2020, 0), parse([heater({ schedule: '22:30-01:30', 'end-date': '2024-04-01' })]), 2020)
  expect(profile['20200401:22'].P).toBe(1250)
  expect(profile['20200402:00'].P).toBe(2500)
  expect(profile['20200402:01'].P).toBe(1250)
  expect(total(profile)).toBe(7500)
})

test('winter ranges wrap around New Year and retain previous-year overnight load', () => {
  const profile = addCustomConsumptions(base(2020, 0), parse([heater({ schedule: '23:00-01:00', 'start-date': '2024-12-31', 'end-date': '2024-01-01' })]), 2020)
  expect(profile['20200101:00'].P).toBe(2500)
  expect(profile['20201231:23'].P).toBe(2500)
  expect(total(profile)).toBe(10000)
  expect(Object.keys(profile)).toHaveLength(8784)
})

test('February 29 runs only in leap years', () => {
  const entries = parse([heater({ schedule: '00:00-24:00', 'start-date': '2024-02-29', 'end-date': '2024-02-29' })])
  expect(total(addCustomConsumptions(base(2020, 0), entries, 2020))).toBe(60000)
  expect(total(addCustomConsumptions(base(2019, 0), entries, 2019))).toBe(0)
})

test('German wall-clock schedules keep their output hour across DST transitions without a second shift', () => {
  const entries = parse([heater({ schedule: '08:00-09:00', 'start-date': '2024-01-01', 'end-date': '2024-12-31' })])
  const profile = addCustomConsumptions(base(2020, 0), entries, 2020)
  for (const day of ['20200101', '20200329', '20200701', '20201025', '20201231']) {
    expect(profile[`${day}:07`].P).toBe(0)
    expect(profile[`${day}:08`].P).toBe(2500)
    expect(profile[`${day}:09`].P).toBe(0)
  }
  expect(total(profile)).toBe(366 * 2500)
})

test('carry-in and carry-out are clipped to each non-leap or leap calculation year', () => {
  const entries = parse([car({ starts: 'tuesday:60%,22:00' })])
  for (const year of [2019, 2020, 2021]) {
    const profile = addCustomConsumptions(base(year, 0), entries, year)
    const summary = summarizeCustomConsumptions(entries, year)[0]
    expect(Object.keys(profile)).toHaveLength(year === 2020 ? 8784 : 8760)
    expect(Object.keys(profile).every(key => key.startsWith(String(year)))).toBe(true)
    expect(total(profile) / 1000).toBeCloseTo(summary.energyKwh, 6)
  }
})

test('EV energy equals replenishment percentage and splits across midnight', () => {
  const profile = addCustomConsumptions(base(2020, 0), parse([car({ starts: 'monday:20%,23:30' })]), 2020)
  expect(profile['20200106:23'].P).toBeCloseTo(1800)
  expect(profile['20200107:00'].P).toBeCloseTo(3600)
  expect(profile['20200107:01'].P).toBeCloseTo(3600)
  expect(profile['20200107:02'].P).toBeCloseTo(1000, 4)
  expect(total(profile)).toBeCloseTo(52 * 10000, 3)
})

test('weekly charging carries across New Year and independent vehicles add', () => {
  const profile = addCustomConsumptions(base(2020, 0), parse([car({ starts: 'tuesday:20%,23:30' }), car({ starts: 'tuesday:20%,23:30' })]), 2020)
  expect(profile['20200101:00'].P).toBeCloseTo(7200, 4)
  expect(profile['20200101:02'].P).toBeCloseTo(2000, 4)
  expect(profile['20200107:23'].P).toBeCloseTo(3600)
})

test('60% replenishment charges from 40% to 80% at full power then tops up at 3.6 kW', () => {
  const entries = parse([car({ starts: 'monday:60%,20:00' })])
  const [event] = entries[0].events
  expect(event.stages[0].power).toBe(11000)
  expect(event.stages[0].duration / 3600000).toBeCloseTo(20000 / 11000)
  expect(event.stages[1].power).toBe(3600)
  expect(event.stages[1].duration / 3600000).toBeCloseTo(10000 / 3600)
  const profile = addCustomConsumptions(base(2020, 0), entries, 2020)
  expect(profile['20200106:20'].P).toBeCloseTo(11000)
  // The 80% transition happens part-way through the next hourly bucket.
  expect(profile['20200106:21'].P).toBeCloseTo(9000 + 3600 * (1 - 9 / 11), 3)
  expect(profile['20200106:22'].P).toBeCloseTo(3600)
  expect(profile['20200107:00'].P).toBeCloseTo(3600 * (20000 / 11000 + 10000 / 3600 - 4), 3)
  expect(total(profile)).toBeCloseTo(52 * 30000, 3)
})

test.each([10, 20, 100])('conserves energy for %i percent replenishment', percent => {
  const entries = parse([car({ starts: `monday:${percent}%,20:00` })])
  expect(entries[0].events[0].stages).toHaveLength(percent <= 20 ? 1 : 2)
  expect(total(addCustomConsumptions(base(2020, 0), entries, 2020))).toBeCloseTo(52 * 50000 * percent / 100, 3)
})

test('top-up power never exceeds a lower configured charger power', () => {
  const entries = parse([car({ power: 2000, starts: 'monday:60%,00:00' })])
  expect(entries[0].events[0].stages.map(stage => stage.power)).toEqual([2000, 2000])
  expect(entries[0].events[0].duration / 3600000).toBe(15)
  expect(total(addCustomConsumptions(base(2020, 0), entries, 2020))).toBe(52 * 30000)
})

test('overlap validation includes the slower top-up phase and allows back-to-back events', () => {
  expect(() => parse([car({ starts: 'monday:20%,20:00,monday:20%,21:00' })])).toThrow('überschneidende Ladevorgänge')
  expect(() => parse([car({ starts: 'saturday:20%,22:00,sunday:20%,00:00' })])).toThrow('überschneidende Ladevorgänge')
  expect(() => parse([car({ capacity: 36000, starts: 'monday:20%,20:00,monday:20%,22:00' })])).not.toThrow()
})

test('a two-stage event carries its slower phase across New Year', () => {
  const entries = parse([car({ starts: 'tuesday:60%,22:00' })])
  const profile = addCustomConsumptions(base(2020, 0), entries, 2020)
  expect(profile['20200101:00'].P).toBeCloseTo(3600)
  expect(profile['20200101:01'].P).toBeCloseTo(3600)
  expect(profile['20200101:02'].P).toBeCloseTo(3600 * (20000 / 11000 + 10000 / 3600 - 4), 3)
})

test.each([
  heater({ name: '' }), heater({ type: undefined }), heater({ type: 'unknown' }),
  heater({ power: '2500' }), heater({ power: 0 }), heater({ schedule: '25:00-26:00' }),
  heater({ schedule: '06:00-06:00' }), heater({ 'start-date': '2024-02-30' }),
  car({ capacity: -1 }), car({ starts: 'monday:101%,20:00' }),
  car({ starts: 'monday:0%,20:00' }), car({ starts: 'monday:%,20:00' }),
  car({ starts: 'montag:20%,20:00' }), car({ starts: 'monday:20%' }),
  car({ starts: 'monday:20%,20:00,monday:20%,20:30' }),
  car({ starts: 'saturday:20%,23:30,sunday:20%,00:00' }),
  car({ power: 1 })
])('rejects invalid entry %#', entry => {
  expect(() => parse([entry])).toThrow('Custom consumption:')
})

test('rejects invalid YAML and accepts an empty consumer list', () => {
  expect(() => parseCustomConsumptions('consumptions: [')).toThrow('Ungültiges YAML')
  expect(() => parseCustomConsumptions('consumptions: []\nconsumptions: []')).toThrow('Ungültiges YAML')
  expect(() => parseCustomConsumptions('consumptions: {}')).toThrow('consumptions muss eine Liste sein')
  expect(parse([])).toEqual([])
})

test.each([
  [heater({ name: '' }), 'Eintrag 1 benötigt einen Namen'],
  [heater({ power: 0 }), 'Heater.power muss eine positive Zahl sein'],
  [heater({ schedule: '25:00-26:00' }), 'Ungültige Uhrzeit: 25:00'],
  [heater({ 'start-date': '2024-02-30' }), 'Ungültiges Datum: 2024-02-30'],
  [car({ starts: 'montag:20%,20:00' }), 'mit englischem Wochentagsnamen'],
  [car({ starts: 'monday:101%,20:00' }), 'Die Prozentangabe muss größer als 0 und höchstens 100 sein']
])('uses German validation messages while preserving configuration identifiers %#', (entry, message) => {
  expect(() => parse([entry])).toThrow(message)
  expect(() => parse([entry])).toThrow('Custom consumption:')
})

test('YAML syntax errors use German diagnostics with a source position', () => {
  expect(() => parseCustomConsumptions('consumptions: [')).toThrow(
    'Custom consumption: Ungültiges YAML in Zeile 1, Spalte 16: Bitte Syntax, doppelte Schlüssel und unzulässige Aliase prüfen'
  )
})

test('missing household hours use a German diagnostic', () => {
  expect(() => addCustomConsumptions({}, parse([heater()]), 2020)).toThrow(
    'Custom consumption: Im Haushaltsprofil fehlt der Zeitpunkt 20200401:05'
  )
})

test.each(['loadDistribution', 'legacyRegression'])('household and custom consumption conserve energy with %s', hourModel => {
  const profile = calculateConsumption({ year: '2020', consumptionYear: 5000, profile: SLPH0, profileBase: PROFILEBASE, factorFunction })
  expect(Object.keys(profile)).toHaveLength(8784)
  expect(profile['20200101:00'].P).toBeCloseTo(factorFunction(1, SLPH0[0].profileDays.weekdays[0] * 5))
  const combined = addCustomConsumptions(profile, parse([heater()]), 2020)
  const generation = base(2020, 0)
  const joined = generateDayTimeValues({ consumption: combined, powerGeneration: generation, year: 2020 })
  expect(joined).toHaveLength(8784)
  const flows = joined.map(hour => energyFlow({ energyGeneration: hour.P, energyConsumption: hour.consumption,
    batterySoc: 0, batterySocMax: 0, batterySocMin: 0, dayTime: hour.dayTime, hourModel, regressionDb }))
  flows.forEach((flow, index) => {
    expect(flow.dayTime).toBe(joined[index].dayTime)
    expect(flow.powerProduction).toBe(0)
    expect(flow.selfUsedEnergy).toBe(0)
    expect(flow.gridUsedEnergy).toBeCloseTo(joined[index].consumption, 6)
  })
  expect(flows.reduce((sum, flow) => sum + flow.gridUsedEnergy + flow.selfUsedEnergy, 0)).toBeCloseTo(total(combined), 4)
  expect(total(combined) - total(profile)).toBeCloseTo(8750, 4)
})