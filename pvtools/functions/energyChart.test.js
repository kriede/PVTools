const { isoWeek, indexEnergyFlow, chartBuckets } = require('./energyChart')
const fs = require('fs')
const path = require('path')
const Vue = require('vue')
const compiler = require('vue-template-compiler')

function row(dayTime, value = 1000) {
  return { dayTime, feedInPowerGrid: value, selfUsagePowerPv: value * 2, selfUsagePowerBattery: value * 3, consumptionGrid: value * 4 }
}

test('ISO weeks handle week-year boundaries and week 53', () => {
  expect(isoWeek('2021-01-01')).toEqual({ key: '2020-W53', start: '2020-12-28' })
  expect(isoWeek('2019-12-30')).toEqual({ key: '2020-W01', start: '2019-12-30' })
  expect(isoWeek('2021-01-04')).toEqual({ key: '2021-W01', start: '2021-01-04' })
})

test('daily chart orders hours and distinguishes missing data from zero', () => {
  const index = indexEnergyFlow([row('20200229:23'), row('20200229:00', 0)])
  const buckets = chartBuckets(index, 'day', '2020-02-29')
  expect(buckets).toHaveLength(24)
  expect(buckets[0].values.consumptionGrid).toBe(0)
  expect(buckets[1].values).toBeNull()
  expect(buckets[23]).toEqual({ date: '2020-02-29', label: '23:00', soc: null, values: {
    feedInPowerGrid: 1000, selfUsagePowerPv: 2000, selfUsagePowerBattery: 3000, consumptionGrid: 4000
  } })
})

test('calendar weeks show 168 ordered hourly buckets with missing hours blank', () => {
  const index = indexEnergyFlow([row('20200101:00'), row('20200102:00')])
  const buckets = chartBuckets(index, 'week', '2020-01-01')
  expect(buckets).toHaveLength(168)
  expect(buckets[0].values).toBeNull()
  expect(buckets[0].label).toBe('Mo 00:00')
  expect(buckets[48].values.feedInPowerGrid).toBe(1000)
  expect(buckets[49].values).toBeNull()
  expect(buckets[72].values.feedInPowerGrid).toBe(1000)
  expect(buckets[167].label).toBe('So 23:00')
  expect(buckets[167].values).toBeNull()
})

test('month views include every calendar day including leap days and gaps', () => {
  const index = indexEnergyFlow([row('20200201:00'), row('20200201:01'), row('20200229:23')])
  const buckets = chartBuckets(index, 'month', '2020-02-01')
  expect(buckets).toHaveLength(29)
  expect(buckets[0].values.feedInPowerGrid).toBe(2000)
  expect(buckets[1].values).toBeNull()
  expect(buckets[28].label).toBe('29')
  expect(buckets[28].date).toBe('2020-02-29')
  expect(buckets[28].values.feedInPowerGrid).toBe(1000)
  expect(chartBuckets(index, 'month', '2021-02-01')).toHaveLength(28)
  expect(chartBuckets(index, 'month', '2020-04-01')).toHaveLength(30)
  expect(chartBuckets(index, 'month', '2020-01-01')).toHaveLength(31)
})

test('all period aggregations conserve hourly energy over a leap year', () => {
  const rows = []
  for (let t = Date.UTC(2020, 0, 1); t < Date.UTC(2021, 0, 1); t += 3600000) {
    const date = new Date(t).toISOString()
    rows.push(row(`${date.slice(0, 10).split('-').join('')}:${date.slice(11, 13)}`))
  }
  const index = indexEnergyFlow(rows.reverse())
  expect(index.dates).toHaveLength(366)
  expect(index.weeks).toHaveLength(53)
  const totals = buckets => buckets.reduce((total, bucket) => total + (bucket.values ? bucket.values.feedInPowerGrid : 0), 0)
  expect(totals(chartBuckets(index, 'year', index.dates[0]))).toBe(8784000)
  expect([...new Set(index.dates.map(date => date.slice(0, 7)))].reduce((total, month) => total + totals(chartBuckets(index, 'month', `${month}-01`)), 0)).toBe(8784000)
  expect(index.dates.reduce((total, date) => total + totals(chartBuckets(index, 'day', date)), 0)).toBe(8784000)
  expect(index.weeks.reduce((total, week) => total + totals(chartBuckets(index, 'week', week.start)), 0)).toBe(8784000)
})

test('empty simulations have no selectable periods', () => {
  expect(indexEnergyFlow([])).toEqual({ days: {}, dates: [], weeks: [] })
  expect(chartBuckets(indexEnergyFlow([]), 'year', '')).toEqual([])
})

test('chart controls drill down, navigate and select ISO weeks', () => {
  const source = compiler.parseComponent(fs.readFileSync(path.join(__dirname, '../components/EnergyFlowChart.vue'), 'utf8'))
  expect(compiler.compile(source.template.content).errors).toEqual([])
  const script = source.script.content
    .replace("import BarChart from './BarChart'", 'const BarChart = {}')
    .replace("import { indexEnergyFlow, chartBuckets, isoWeek } from '../functions/energyChart'", 'const { indexEnergyFlow, chartBuckets, isoWeek } = helpers')
    .replace('export default', 'return')
  const options = new Function('helpers', script)({ indexEnergyFlow, chartBuckets, isoWeek })
  const vm = new (Vue.extend(options))({ propsData: {
    energyFlow: ['20200101:00', '20200201:00', '20200229:00', '20200301:00'].map(time => row(time))
  } })
  vm.drillDown(1)
  expect(vm.selectedDate).toBe('2020-02-01')
  expect(vm.mode).toBe('month')
  expect(vm.buckets).toHaveLength(29)
  vm.move(1)
  expect(vm.selectedDate).toBe('2020-03-01')
  vm.move(1)
  expect(vm.selectedDate).toBe('2020-03-01')
  vm.selectMonth('2020-02')
  expect(vm.selectedDate).toBe('2020-02-01')
  vm.mode = 'day'
  vm.selectDate('2020-02-29')
  expect(vm.datasets[0].data[0]).toBe(-1)
  vm.move(1)
  expect(vm.selectedDate).toBe('2020-03-01')
  vm.move(1)
  expect(vm.selectedDate).toBe('2020-03-01')
  vm.mode = 'week'
  expect(vm.buckets).toHaveLength(168)
  vm.move(-1)
  expect(vm.weekKey).toBe('2020-W05')
  vm.selectWeek('2020-W09')
  expect(vm.weekKey).toBe('2020-W09')
  vm.mode = 'year'
  vm.mode = 'day'
  expect(vm.selectedDate).toBe('2020-02-29')
  vm.$destroy()
})

test('SOC uses end-of-period state rather than sum, including unordered inputs', () => {
  const index = indexEnergyFlow([
    { ...row('20200229:23'), newBatterySoc: 500 },
    { ...row('20200229:00'), newBatterySoc: 100 }
  ])
  expect(chartBuckets(index, 'day', '2020-02-29')[23].soc).toBe(500)
  expect(chartBuckets(index, 'month', '2020-02-29')[28].soc).toBe(500)
  expect(chartBuckets(index, 'year', '2020-02-29')[0].soc).toBe(500)
  expect(chartBuckets(index, 'day', '2020-02-29')[1].soc).toBeNull()
})

test('chart drills down to matching week/day, drills out and emits year requests', () => {
  const source = compiler.parseComponent(fs.readFileSync(path.join(__dirname, '../components/EnergyFlowChart.vue'), 'utf8'))
  const script = source.script.content
    .replace("import BarChart from './BarChart'", 'const BarChart = {}')
    .replace("import { indexEnergyFlow, chartBuckets, isoWeek } from '../functions/energyChart'", 'const { indexEnergyFlow, chartBuckets, isoWeek } = helpers')
    .replace('export default', 'return')
  const options = new Function('helpers', script)({ indexEnergyFlow, chartBuckets, isoWeek })
  const vm = new (Vue.extend(options))({ propsData: {
    batteryCapacity: 1000,
    energyFlow: [{ ...row('20200229:23'), newBatterySoc: 500 }]
  } })
  vm.drillDown(0)
  expect(vm.mode).toBe('month')
  vm.drillDown(0) // Missing day does not drill down.
  expect(vm.mode).toBe('month')
  vm.drillDown(28)
  expect(vm.mode).toBe('week')
  expect(vm.weekKey).toBe('2020-W09')
  vm.drillDown(143)
  expect(vm.mode).toBe('day')
  expect(vm.selectedDate).toBe('2020-02-29')
  expect(vm.datasets[4].data[23]).toBe(50)
  expect(vm.datasets[4].yAxisID).toBe('soc')
  for (const mode of ['week', 'month', 'year']) {
    vm.drillOut()
    expect(vm.mode).toBe(mode)
    expect(vm.selectedDate).toBe('2020-02-29')
  }
  const handler = jest.fn()
  vm.$on('year-change', handler)
  vm.requestYear(2019)
  expect(handler).toHaveBeenCalledWith(2019)
  vm.requestYear(2020)
  expect(handler).toHaveBeenCalledTimes(1)
  vm.$destroy()
})