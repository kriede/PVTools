const { parse } = require('yaml')

const HOUR = 3600000
const DAY = 24 * HOUR
const EV_TOP_UP_POWER = 3600
const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function fail(message) {
  // Keep this prefix stable: the parent form uses it to recognize these errors.
  throw new Error(`Custom consumption: ${message}`)
}

function positive(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) fail(`${field} muss eine positive Zahl sein`)
  return value
}

function minutes(value, allowMidnight = false) {
  if (typeof value !== 'string') fail('Die Uhrzeit muss im Format H:MM oder HH:MM angegeben werden')
  const parts = value.trim().split(':')
  if (parts.length !== 2 || !/^\d{1,2}$/.test(parts[0]) || !/^\d{2}$/.test(parts[1])) fail(`Ungültige Uhrzeit: ${value}`)
  const hour = Number(parts[0])
  const minute = Number(parts[1])
  if (allowMidnight && hour === 24 && minute === 0) return 1440
  if (hour > 23 || minute > 59) fail(`Ungültige Uhrzeit: ${value}`)
  return hour * 60 + minute
}

function monthDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('Datumsangaben müssen als Zeichenfolgen in Anführungszeichen im Format JJJJ-MM-TT angegeben werden')
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) fail(`Ungültiges Datum: ${value}`)
  return month * 100 + day
}

function parseCustomConsumptions(text) {
  let config
  try { config = parse(text, { uniqueKeys: true, maxAliasCount: 0 }) } catch (error) {
    const position = error.linePos && error.linePos[0]
    fail(`Ungültiges YAML${position ? ` in Zeile ${position.line}, Spalte ${position.col}` : ''}: Bitte Syntax, doppelte Schlüssel und unzulässige Aliase prüfen`)
  }
  if (!config || !Array.isArray(config.consumptions)) fail('consumptions muss eine Liste sein')
  return config.consumptions.map((entry, index) => {
    if (!entry || typeof entry.name !== 'string' || !entry.name.trim()) fail(`Eintrag ${index + 1} benötigt einen Namen`)
    const power = positive(entry.power, `${entry.name}.power`)
    if (entry.type === 'heating') {
      if (typeof entry.schedule !== 'string') fail(`${entry.name} benötigt einen Zeitplan (schedule)`)
      const parts = entry.schedule.split('-')
      if (parts.length !== 2) fail(`${entry.name} benötigt einen Zeitplan im Format Start-Ende`)
      const start = minutes(parts[0])
      const end = minutes(parts[1], true)
      if (start === end) fail(`${entry.name} hat einen leeren Zeitplan; für einen ganzen Tag bitte 00:00-24:00 verwenden`)
      return { name: entry.name, type: entry.type, power, start, end,
        startDate: monthDay(entry['start-date']), endDate: monthDay(entry['end-date']) }
    }
    if (entry.type !== 'electric-car') fail(`${entry.name} benötigt den Typ (type) heating oder electric-car`)
    const capacity = positive(entry.capacity, `${entry.name}.capacity`)
    if (typeof entry.starts !== 'string' || !entry.starts.trim()) fail(`${entry.name} benötigt Ladebeginn-Angaben (starts)`)
    const parts = entry.starts.split(',').map(part => part.trim())
    if (parts.length % 2) fail(`${entry.name} hat einen unvollständigen Ladevorgang`)
    const events = []
    for (let i = 0; i < parts.length; i += 2) {
      const pair = parts[i].split(':')
      const day = weekdays.indexOf(pair[0])
      if (pair.length !== 2 || day < 0 || !pair[1].endsWith('%')) fail(`${entry.name} hat einen ungültigen Ladevorgang; erwartet wird Wochentag:Prozent% mit englischem Wochentagsnamen`)
      const percentText = pair[1].slice(0, -1)
      if (!/^\d+(\.\d+)?$/.test(percentText)) fail(`${entry.name} hat eine ungültige Prozentangabe`)
      const percent = Number(percentText)
      if (percent <= 0 || percent > 100) fail(`${entry.name}: Die Prozentangabe muss größer als 0 und höchstens 100 sein`)
      const start = minutes(parts[i + 1])
      // Replenish the missing percentage to 100%, switching power at 80% SOC.
      const fastEnergy = capacity * Math.max(percent - 20, 0) / 100
      const topUpEnergy = capacity * Math.min(percent, 20) / 100
      const topUpPower = Math.min(power, EV_TOP_UP_POWER)
      const stages = [
        { power, duration: fastEnergy / power * HOUR },
        { power: topUpPower, duration: topUpEnergy / topUpPower * HOUR }
      ].filter(stage => stage.duration > 0)
      events.push({ day, start, stages, duration: stages.reduce((sum, stage) => sum + stage.duration, 0) })
    }
    events.sort((a, b) => (a.day * DAY + a.start * 60000) - (b.day * DAY + b.start * 60000))
    events.forEach((event, i) => {
      const next = events[(i + 1) % events.length]
      const gap = next.day * DAY + next.start * 60000 + (i === events.length - 1 ? 7 * DAY : 0) - event.day * DAY - event.start * 60000
      if (event.duration > gap) fail(`${entry.name} hat sich überschneidende Ladevorgänge`)
    })
    return { name: entry.name, type: entry.type, power, events }
  })
}

function timeKey(time) {
  const date = new Date(time)
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}:${String(date.getUTCHours()).padStart(2, '0')}`
}

function calculationYear(year) {
  year = Number(year)
  if (!Number.isInteger(year) || year < 1000 || year > 9998) fail('Ungültiges Berechnungsjahr')
  return year
}

// Share scheduling between hourly loads and their annual summaries.
function forEachConsumptionInterval(entries, year, addInterval, onStart = () => {}) {
  const yearStart = Date.UTC(year, 0, 1)
  const yearEnd = Date.UTC(year + 1, 0, 1)
  entries.forEach(entry => {
    // Include the previous week so recurring events crossing New Year are retained.
    for (let day = yearStart - 7 * DAY; day < yearEnd; day += DAY) {
      const date = new Date(day)
      if (entry.type === 'heating') {
        const md = (date.getUTCMonth() + 1) * 100 + date.getUTCDate()
        const active = entry.startDate <= entry.endDate
          ? md >= entry.startDate && md <= entry.endDate
          : md >= entry.startDate || md <= entry.endDate
        if (active) {
          const start = day + entry.start * 60000
          onStart(start)
          addInterval(start, day + (entry.end > entry.start ? entry.end : entry.end + 1440) * 60000, entry.power)
        }
      } else {
        entry.events.filter(event => event.day === date.getUTCDay()).forEach(event => {
          let start = day + event.start * 60000
          onStart(start)
          event.stages.forEach(stage => {
            const end = start + stage.duration
            addInterval(start, end, stage.power)
            start = end
          })
        })
      }
    }
  })
}

// P is average watts over each one-hour step, numerically equal to Wh.
function addCustomConsumptions(baseProfile, entries, year) {
  year = calculationYear(year)
  const profile = Object.fromEntries(Object.entries(baseProfile).map(([key, value]) => [key, { ...value }]))
  const yearStart = Date.UTC(year, 0, 1)
  const yearEnd = Date.UTC(year + 1, 0, 1)
  forEachConsumptionInterval(entries, year, (start, end, power) => {
    start = Math.max(start, yearStart)
    end = Math.min(end, yearEnd)
    for (let hour = Math.floor(start / HOUR) * HOUR; hour < end; hour += HOUR) {
      const key = timeKey(hour)
      if (!profile[key]) fail(`Im Haushaltsprofil fehlt der Zeitpunkt ${key}`)
      profile[key].P += power * (Math.min(end, hour + HOUR) - Math.max(start, hour)) / HOUR
    }
  })
  return profile
}

function summarizeCustomConsumptions(entries, year) {
  year = calculationYear(year)
  const yearStart = Date.UTC(year, 0, 1)
  const yearEnd = Date.UTC(year + 1, 0, 1)
  return entries.map(entry => {
    const summary = { name: entry.name, type: entry.type, count: 0, hours: 0, energyKwh: 0 }
    forEachConsumptionInterval([entry], year, (start, end, power) => {
      const hours = Math.max(0, Math.min(end, yearEnd) - Math.max(start, yearStart)) / HOUR
      summary.hours += hours
      summary.energyKwh += hours * power / 1000
    }, start => {
      if (start >= yearStart && start < yearEnd) summary.count += 1
    })
    return summary
  })
}

module.exports = { parseCustomConsumptions, addCustomConsumptions, summarizeCustomConsumptions }