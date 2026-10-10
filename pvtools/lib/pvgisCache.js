const PREFIX = 'pvtools:pvgis:v1:'

// The complete request URL includes the PVGIS API version and every parameter.
const cacheKey = url => `${PREFIX}${url}`

function completeYear(rows, year) {
  const start = Date.UTC(year, 0, 1)
  const count = (Date.UTC(year + 1, 0, 1) - start) / 3600000
  if (!Array.isArray(rows) || rows.length !== count) return false
  return rows.every((row, index) => {
    const date = new Date(start + index * 3600000)
    const hour = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}:${String(date.getUTCHours()).padStart(2, '0')}`
    return typeof row?.time === 'string' && row.time.length === 13
      && row.time.slice(0, 11) === hour && /^\d{2}$/.test(row.time.slice(11))
      && Number(row.time.slice(11)) < 60 && Number.isFinite(row.P) && row.P >= 0
      && (row.T2m === undefined || Number.isFinite(row.T2m))
  })
}

export function readPvgisCache(url, year) {
  try {
    const stored = JSON.parse(localStorage.getItem(cacheKey(url)))
    if (stored?.url === url && stored.year === year && completeYear(stored.hourly, year)) {
      return stored.hourly
    }
  } catch { /* Storage is optional; malformed or unavailable entries are ignored. */ }
  return null
}

export function writePvgisCache(url, year, rows) {
  // Never persist partial years or malformed data. Retain only simulation fields
  // to reduce localStorage usage while preserving heat-pump weather inputs.
  if (!completeYear(rows, year)) return
  try {
    localStorage.setItem(cacheKey(url), JSON.stringify({
      url, year, fetchedAt: new Date().toISOString(),
      hourly: rows.map(({ time, P, T2m }) => ({ time, P, T2m })),
    }))
  } catch { /* A full or blocked storage must not prevent calculation. */ }
}