import { generateDayTimeOrder } from '../functions/energyFlow.js'

const PREFIX = 'Netzdienliches Laden:'
const SOURCE = 'Energy-Charts (Fraunhofer ISE), https://energy-charts.info; underlying source credited in license.info'
const pending = new Map()
const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', hourCycle: 'h23',
})

function fail(message) {
  return new Error(`${PREFIX} ${message}`)
}

function label(seconds) {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(seconds * 1000))
    .map(part => [part.type, part.value]))
  return `${parts.year}${parts.month}${parts.day}:${parts.hour}`
}

function validInfo(info) {
  return (typeof info === 'string' && info.trim().length > 0)
    || (Array.isArray(info) && info.length > 0 && info.every(validInfo))
    || (info !== null && typeof info === 'object' && !Array.isArray(info) && Object.keys(info).length > 0)
}

function validCache(value, year, order) {
  return value?.year === year && value.source === SOURCE
    && value.license?.name === 'CC BY' && validInfo(value.license.info)
    && typeof value.fetchedAt === 'string' && Number.isFinite(Date.parse(value.fetchedAt))
    && new Date(value.fetchedAt).toISOString() === value.fetchedAt
    && value.cached === false && value.prices !== null && typeof value.prices === 'object'
    && !Array.isArray(value.prices) && Object.keys(value.prices).length === order.length
    && order.every(key => Object.hasOwn(value.prices, key) && Number.isFinite(value.prices[key]))
}

function normalize(payload, year, order) {
  if (typeof payload?.unit !== 'string' || payload.unit.replaceAll(' ', '') !== 'EUR/MWh') {
    throw fail('Die Preise müssen in EUR/MWh angegeben sein.')
  }
  if (!validInfo(payload.license_info)) throw fail('Quellen- und Lizenzinformationen fehlen.')
  const times = payload.unix_seconds
  const values = payload.price
  // Berlin is UTC+1 at both annual boundaries. Validate real instants before wall-clock normalization.
  const start = Date.UTC(year, 0, 1, -1) / 1000
  const end = Date.UTC(year + 1, 0, 1, -1) / 1000
  if (!Array.isArray(times) || !Array.isArray(values)
    || times.length !== order.length || values.length !== times.length) {
    throw fail(`Unvollständige Preisdaten für das Jahr ${year}.`)
  }
  const prices = {}
  const springGaps = new Set()
  let previous
  for (let i = 0; i < times.length; i += 1) {
    if (!Number.isSafeInteger(times[i]) || times[i] !== start + i * 3600
      || times[i] >= end || !Number.isFinite(values[i])) {
      throw fail('Ungültige Preise, Zeitstempel oder Lücken in der stündlichen Jahresabdeckung.')
    }
    const key = label(times[i])
    if (previous?.endsWith(':01') && key === `${previous.slice(0, 8)}:03`) {
      springGaps.add(`${previous.slice(0, 8)}:02`)
    }
    prices[key] = Object.hasOwn(prices, key) ? prices[key] / 2 + values[i] / 2 : values[i]
    previous = key
  }
  for (let i = 0; i < order.length; i += 1) {
    const key = order[i]
    if (!Object.hasOwn(prices, key)) {
      if (!springGaps.has(key)) throw fail(`Fehlende Preisstunde: ${key}.`)
      prices[key] = prices[order[i - 1]] / 2 + prices[order[i + 1]] / 2
    }
    if (!Number.isFinite(prices[key])) throw fail(`Ungültige Preisstunde: ${key}.`)
  }
  return Object.fromEntries(order.map(key => [key, prices[key]]))
}

async function fetchYear(year, order, key) {
  const controller = new AbortController()
  let timer
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      reject(fail('Zeitüberschreitung nach 30 Sekunden beim Laden der Preisdaten.'))
      controller.abort()
    }, 30000)
  })
  try {
    const payload = await Promise.race([timeout, (async () => {
      const response = await fetch(`${__API_BASE_URL__}/relay`, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `https://api.energy-charts.info/price?bzn=DE-LU&start=${year}-01-01&end=${year}-12-31`,
          method: 'GET', body: {},
        }),
      })
      if (response.status === 429) throw fail('Energy-Charts hat das Anfragelimit erreicht (HTTP 429). Bitte später erneut versuchen.')
      if (!response.ok) throw fail(`Energy-Charts antwortet mit HTTP ${response.status}.`)
      return response.json()
    })()])
    const result = {
      year, prices: normalize(payload, year, order), source: SOURCE,
      // Preserve the API attribution, including the underlying provider, rather than replacing it.
      license: { name: 'CC BY', info: payload.license_info },
      fetchedAt: new Date().toISOString(), cached: false,
    }
    try { globalThis.localStorage.setItem(key, JSON.stringify(result)) } catch { /* Storage is optional. */ }
    return result
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(PREFIX)) throw error
    throw fail(`Preisdaten konnten nicht geladen werden: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    clearTimeout(timer)
  }
}

/** Complete annual EUR/MWh prices, indexed by Berlin wall-clock hour (YYYYMMDD:HH). */
export async function loadDayAheadPrices(year, { force = false } = {}) {
  if (!Number.isInteger(year) || year < 2005 || year > 2023) {
    throw fail('Preisjahr muss zwischen 2005 und 2023 liegen.')
  }
  // A forced refresh joins an existing network request; ordinary callers also join a running refresh.
  if (pending.has(year)) return pending.get(year)
  const order = generateDayTimeOrder(year)
  const key = `pvtools:dayAheadPrices:v1:DE-LU:${year}`
  if (!force) {
    try {
      const cached = JSON.parse(globalThis.localStorage.getItem(key))
      if (validCache(cached, year, order)) return { ...cached, cached: true }
    } catch { /* Corrupt or inaccessible cache: fetch instead. */ }
  }
  const request = fetchYear(year, order, key)
  pending.set(year, request)
  try {
    return await request
  } finally {
    pending.delete(year)
  }
}