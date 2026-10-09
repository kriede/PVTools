import { expect, test } from 'vitest'
import { generateDayTimeOrder } from './energyFlow.js'
import { importDayAheadPrices } from './priceImport.js'

const csv = year => `dayTime,price\n${generateDayTimeOrder(year).map(key => `${key},-10`).join('\n')}`

test.each([2023, 2020])('imports complete local hourly prices for %s without shifting labels', year => {
  const imported = importDayAheadPrices(csv(year))
  expect(imported.year).toBe(year)
  expect(Object.keys(imported.prices)).toHaveLength(year === 2020 ? 8784 : 8760)
  expect(imported.prices[`${year}0101:00`]).toBe(-10)
})

test('rejects missing, duplicate, mixed-year and nonfinite price hours', () => {
  const complete = csv(2023)
  for (const value of [complete.slice(0, complete.lastIndexOf('\n')), `${complete}\n20230101:00,5`, complete.replace('20230101:00', '20220101:00'), complete.replace(',-10', ',Infinity'), complete.replace(',-10', ',')]) {
    expect(() => importDayAheadPrices(value)).toThrow()
  }
})

test('supports semicolon CSV with decimal commas but rejects ambiguous timestamps', () => {
  const complete = csv(2023).replaceAll(',', ';').replaceAll('-10', '-10,5')
  expect(importDayAheadPrices(complete).prices['20230101:00']).toBe(-10.5)
  expect(() => importDayAheadPrices('timestamp,price\n2023-01-01T00:00Z,5')).toThrow()
})