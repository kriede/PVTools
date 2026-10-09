import {
  mergePowerGeneration,
  normalizeHourlyRadiation,
  shiftUtcToGermanTime,
} from '../functions/energyFlow.js'

// PVGIS 5.3 (PVGIS-SARAH3) provides hourly data from 2005 to 2023
export const PVGIS_FIRST_YEAR = 2005
export const PVGIS_LAST_YEAR = 2023

/**
 * The backend relays requests to PVGIS and Nominatim: PVGIS does not allow
 * CORS and the user's IP address is not passed on to third parties.
 */
export async function relayRequest(url) {
  const response = await fetch(`${__API_BASE_URL__}/relay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, method: 'GET', body: {} }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(
      `Request failed with status code ${response.status}`,
    )
    error.response = { status: response.status, data }
    throw error
  }
  return data
}

/** Returns the first Nominatim result for the query or null */
export async function geocode(query) {
  const results = await relayRequest(
    'https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=' +
      encodeURIComponent(query),
  )
  if (!Array.isArray(results) || !results.length) return null
  const { lat, lon, display_name, address = {} } = results[0]
  const city =
    address.city || address.town || address.village || address.municipality
  return {
    lat,
    lon,
    display_name,
    shortName:
      [address.postcode, city].filter(Boolean).join(' ') || display_name,
  }
}

export function buildPvgisUrl({
  lat,
  lon,
  peakpower,
  loss,
  year,
  angle,
  aspect,
}) {
  const params = new URLSearchParams({
    pvcalculation: 1,
    outputformat: 'json',
    loss: loss ?? 12,
    lat,
    lon,
    startyear: year,
    endyear: year,
    peakpower, // kWp
    angle,
    aspect,
  })
  return `https://re.jrc.ec.europa.eu/api/v5_3/seriescalc?${params}`
}

/**
 * Fetches the hourly PV generation of all roofs and merges them.
 * Roofs store their peak power in Wp.
 */
export async function fetchGeneration({ roofs, lat, lon, loss, year }) {
  year = Number(year)
  if (!Number.isInteger(year) || year < PVGIS_FIRST_YEAR || year > PVGIS_LAST_YEAR) {
    throw new Error('Unsupported PVGIS year')
  }
  if (!Array.isArray(roofs) || !roofs.length) {
    throw new Error('No roofs to fetch')
  }
  const perRoof = await Promise.all(
    roofs.map(async (roof) => {
      const data = await relayRequest(
        buildPvgisUrl({
          lat,
          lon,
          loss,
          year,
          angle: roof.angle,
          aspect: roof.aspect,
          peakpower: roof.peakpower / 1000,
        }),
      )
      const radiation = data?.outputs?.hourly
      if (!Array.isArray(radiation) || !radiation.length) {
        throw new Error('PVGIS returned no hourly generation data')
      }
      // Validate the original UTC timestamps, not the local-time series:
      // shifting and wrapping New Year must not hide a wrong weather year.
      for (const row of radiation) {
        const time = row?.time
        if (typeof time !== 'string' || !/^\d{8}:\d{4}$/.test(time)) {
          throw new Error('PVGIS returned an invalid UTC timestamp')
        }
        const utcYear = Number(time.slice(0, 4))
        const month = Number(time.slice(4, 6))
        const day = Number(time.slice(6, 8))
        const hour = Number(time.slice(9, 11))
        const minute = Number(time.slice(11, 13))
        const date = new Date(Date.UTC(utcYear, month - 1, day, hour, minute))
        if (utcYear !== year || date.getUTCFullYear() !== year ||
          date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day ||
          hour > 23 || minute > 59 || !Number.isFinite(row.P) || row.P < 0) {
          throw new Error(`PVGIS returned invalid hourly data for requested UTC year ${year}`)
        }
      }
      // PVGIS uses UTC, the load profiles German local time
      const normalized = normalizeHourlyRadiation(radiation)
      if (!Object.keys(normalized).length) {
        throw new Error('PVGIS returned no usable hourly generation data')
      }
      const hourly = shiftUtcToGermanTime(
        normalized,
        year,
      )
      if (!Object.keys(hourly).length) {
        throw new Error('PVGIS returned no usable hourly generation data')
      }
      const generationYear =
        Object.values(hourly).reduce((sum, { P }) => sum + P, 0) / 1000
      return { hourly, roof: { ...roof, generationYear } }
    }),
  )
  return {
    mergedPower: mergePowerGeneration(perRoof.map((r) => r.hourly)),
    roofsData: perRoof.map((r) => r.roof),
  }
}
