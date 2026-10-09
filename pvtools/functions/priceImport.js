import Papa from 'papaparse'
import { generateDayTimeOrder } from './energyFlow.js'

/** Explicit local wall-clock labels avoid silently shifting or summing prices at DST. */
export function importDayAheadPrices(csv) {
  const parsed = Papa.parse(csv.trim(), { header: true, skipEmptyLines: 'greedy' })
  if (parsed.errors.length || !parsed.meta.fields?.includes('dayTime') || !parsed.meta.fields.includes('price')) {
    throw new Error('CSV benötigt die Spalten dayTime und price (EUR/MWh).')
  }
  if (!parsed.data.length) throw new Error('Die Preisdatei enthält keine Stunden.')
  const year = Number(parsed.data[0].dayTime?.slice(0, 4))
  if (!Number.isInteger(year) || year < 2005 || year > 2023) throw new Error('Preisjahr muss zwischen 2005 und 2023 liegen.')
  const expected = generateDayTimeOrder(year)
  const valid = new Set(expected)
  const prices = {}
  for (const row of parsed.data) {
    const key = row.dayTime?.trim()
    const raw = row.price?.trim()
    const price = Number(raw?.replace(',', '.'))
    if (!valid.has(key) || Object.hasOwn(prices, key) || !raw || !Number.isFinite(price)) {
      throw new Error(`Ungültige oder doppelte Preisstunde: ${key || '(leer)'}. Format: YYYYMMDD:HH, Preis in EUR/MWh.`)
    }
    prices[key] = price
  }
  if (expected.some(key => !Object.hasOwn(prices, key))) {
    throw new Error(`Die Preisdatei muss alle ${expected.length} Stunden des Jahres ${year} enthalten.`)
  }
  return { year, prices }
}