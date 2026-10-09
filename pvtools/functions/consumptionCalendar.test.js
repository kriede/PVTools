import { spawnSync } from 'node:child_process'
import { describe, expect, test } from 'vitest'
import { calculateConsumption } from './energyFlow.js'

const seasonEnds = ['03/21', '05/15', '09/15', '11/01', '12/31']
const profile = seasonEnds.map((till, index) => ({
  till,
  last: index === seasonEnds.length - 1,
  profileDays: Object.fromEntries(['weekdays', 'sat', 'sun', 'default'].map((kind, day) => [
    kind, Object.fromEntries(Array.from({ length: 24 }, (_, hour) => [hour, (index + 1) * 100 + day * 10 + hour])),
  ])),
}))
const calculate = (year, factorFunction) => calculateConsumption({
  year, consumptionYear: 1000, profileBase: 1000, profile, factorFunction,
})

describe('UTC household consumption calendar', () => {
  test.each([
    ['03/20', 1], ['03/21', 1], ['03/22', 2],
    ['05/14', 2], ['05/15', 2], ['05/16', 3],
    ['09/14', 3], ['09/15', 3], ['09/16', 4],
    ['10/31', 4], ['11/01', 4], ['11/02', 5], ['12/31', 5],
  ])('uses the expected season throughout UTC date %s', (date, season) => {
    // The current contract includes each `till` date; the following day
    // starts the next season, even across DST and weekend boundaries.
    const [month, day] = date.split('/').map(Number)
    const weekday = new Date(Date.UTC(2020, month - 1, day)).getUTCDay()
    const offset = weekday === 0 ? 20 : weekday === 6 ? 10 : 0
    const result = calculate(2020)
    for (let hour = 0; hour < 24; hour++) {
      const key = `2020${date.replace('/', '')}:${String(hour).padStart(2, '0')}`
      expect(result[key].P).toBe(season * 100 + offset + hour)
    }
  })

  test.each([[2019, 365], [2020, 366], [2021, 365]])(
    'numeric and string year %i have exactly %i days without overwriting January 1',
    (year, dayCount) => {
      for (const value of [year, String(year)]) {
        const ordinals = []
        const result = calculate(value, (day) => {
          ordinals.push(day)
          return day
        })
        const keys = Object.keys(result)
        expect(keys).toHaveLength(dayCount * 24)
        expect(keys[0]).toBe(`${year}0101:00`)
        expect(keys.at(-1)).toBe(`${year}1231:23`)
        expect(keys.every(key => key.startsWith(String(year)))).toBe(true)
        expect(result[`${year}0101:00`].P).toBe(1)
        expect(result[`${year}0101:23`].P).toBe(1)
        expect(result[`${year}1231:23`].P).toBe(dayCount)
        expect(result[`${year}0229:00`]?.P).toBe(dayCount === 366 ? 60 : undefined)
        expect(ordinals).toEqual(Array.from({ length: dayCount * 24 }, (_, hour) => Math.floor(hour / 24) + 1))
        expect(Object.values(result).reduce((sum, hour) => sum + hour.P, 0)).toBe(24 * dayCount * (dayCount + 1) / 2)
      }
      expect(calculate(String(year))).toEqual(calculate(year))
    },
  )

  test('complete profiles are identical in fresh UTC, Berlin and Los Angeles processes', () => {
    // Set TZ before Node starts: mutating process.env.TZ in a Vitest worker
    // does not reliably change native Date's timezone on every platform.
    const energyFlowUrl = new URL('./energyFlow.js', import.meta.url).href
    const slpUrl = new URL('./SLP.js', import.meta.url).href
    const script = `
      import { createHash } from 'node:crypto';
      import { calculateConsumption } from ${JSON.stringify(energyFlowUrl)};
      import { SLPH0, PROFILEBASE, factorFunction } from ${JSON.stringify(slpUrl)};
      const profiles = [2019, 2020, 2021].flatMap(year => [year, String(year)].map(value => {
        const result = calculateConsumption({ year: value, consumptionYear: 5000, profile: SLPH0, profileBase: PROFILEBASE, factorFunction });
        const keys = Object.keys(result);
        return { hours: keys.length, first: keys[0], last: keys.at(-1), digest: createHash('sha256').update(JSON.stringify(result)).digest('hex') };
      }));
      console.log(JSON.stringify({ profiles, offsets: [new Date(2020, 0, 1).getTimezoneOffset(), new Date(2020, 6, 1).getTimezoneOffset()] }));
    `
    const outputs = ['UTC', 'Europe/Berlin', 'America/Los_Angeles'].map(TZ => {
      const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        env: { ...process.env, TZ }, encoding: 'utf8', timeout: 15000,
      })
      expect(child.error, TZ).toBeUndefined()
      expect(child.status, `${TZ}: ${child.stderr}`).toBe(0)
      return JSON.parse(child.stdout)
    })
    expect(outputs.map(output => output.offsets)).toEqual([[0, 0], [-60, -120], [480, 420]])
    for (const output of outputs) {
      expect(output.profiles).toEqual(outputs[0].profiles)
      output.profiles.forEach((result, index) => {
        const year = [2019, 2020, 2021][Math.floor(index / 2)]
        expect(result.hours).toBe(year === 2020 ? 8784 : 8760)
        expect(result.first).toBe(`${year}0101:00`)
        expect(result.last).toBe(`${year}1231:23`)
      })
    }
  })
})