const DAY = 86400000
const fields = ['feedInPowerGrid', 'selfUsagePowerPv', 'selfUsagePowerBattery', 'consumptionGrid']

function dateKey(time) {
  return `${time.slice(0, 4)}-${time.slice(4, 6)}-${time.slice(6, 8)}`
}
function isoWeek(date) {
  const day = new Date(`${date}T00:00:00Z`)
  const monday = new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY)
  const year = new Date(monday.getTime() + 3 * DAY).getUTCFullYear()
  const january4 = new Date(Date.UTC(year, 0, 4))
  const firstMonday = january4.getTime() - ((january4.getUTCDay() + 6) % 7) * DAY
  const week = 1 + Math.round((monday.getTime() - firstMonday) / (7 * DAY))
  return { key: `${year}-W${String(week).padStart(2, '0')}`, start: monday.toISOString().slice(0, 10) }
}
function sum(rows) {
  return Object.fromEntries(fields.map(field => [field, rows.reduce((total, row) => total + (row[field] || 0), 0)]))
}
// State of charge is a state, not energy: use the last available hour in each bucket.
function endSoc(rows) {
  const last = [...rows].sort((a, b) => a.dayTime.localeCompare(b.dayTime)).pop()
  return last && Number.isFinite(last.newBatterySoc) ? last.newBatterySoc : null
}
function indexEnergyFlow(rows) {
  const days = {}
  rows.forEach(row => {
    const date = dateKey(row.dayTime)
    if (!days[date]) days[date] = []
    days[date].push(row)
  })
  const dates = Object.keys(days).sort()
  const weeks = []
  dates.forEach(date => {
    const week = isoWeek(date)
    if (!weeks.length || weeks[weeks.length - 1].key !== week.key) weeks.push(week)
  })
  return { days, dates, weeks }
}
function chartBuckets(index, mode, selectedDate) {
  if (mode === 'day') {
    const hours = index.days[selectedDate] || []
    return Array.from({ length: 24 }, (_, hour) => {
      const rows = hours.filter(row => Number(row.dayTime.slice(9, 11)) === hour)
      return { date: selectedDate, label: `${String(hour).padStart(2, '0')}:00`, values: rows.length ? sum(rows) : null, soc: endSoc(rows) }
    })
  }
  if (mode === 'week') {
    const start = new Date(`${isoWeek(selectedDate).start}T00:00:00Z`).getTime()
    return Array.from({ length: 7 }, (_, day) => {
      const date = new Date(start + day * DAY).toISOString().slice(0, 10)
      const label = new Date(`${date}T00:00:00Z`).toLocaleDateString('de-DE', { weekday: 'short', timeZone: 'UTC' }).replace('.', '')
      return chartBuckets(index, 'day', date).map(bucket => ({
        ...bucket, label: `${label} ${bucket.label}`
      }))
    }).flat()
  }
  if (mode === 'month') {
    const month = selectedDate.slice(0, 7)
    const start = new Date(`${month}-01T00:00:00Z`)
    const length = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate()
    return Array.from({ length }, (_, day) => {
      const date = new Date(start.getTime() + day * DAY).toISOString().slice(0, 10)
      const rows = index.days[date]
      return { date, label: date.slice(8, 10), values: rows ? sum(rows) : null, soc: endSoc(rows || []) }
    })
  }
  return [...new Set(index.dates.map(date => date.slice(0, 7)))].map(month => ({
    month,
    label: new Date(`${month}-01T00:00:00Z`).toLocaleDateString('de-DE', { month: 'short', timeZone: 'UTC' }),
    values: sum(index.dates.filter(date => date.startsWith(month)).flatMap(date => index.days[date])),
    soc: endSoc(index.dates.filter(date => date.startsWith(month)).flatMap(date => index.days[date]))
  }))
}
module.exports = { isoWeek, indexEnergyFlow, chartBuckets }