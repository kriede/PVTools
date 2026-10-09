import { readFileSync } from 'node:fs'
import { createRenderer, h, ref, reactive, nextTick } from 'vue'
import { parse, compileScript, compileTemplate } from 'vue/compiler-sfc'
import { expect, test } from 'vitest'
import { isoWeek, indexEnergyFlow, chartBuckets } from './energyChart.js'

const source = name => readFileSync(new URL(`../components/${name}.vue`, import.meta.url), 'utf8')
const { descriptor } = parse(source('EnergyFlowChart'))
const script = descriptor.script.content
  .replace("import BarChart from './BarChart.vue'", 'const BarChart = {}')
  .replace("import { indexEnergyFlow, chartBuckets, isoWeek } from '../functions/energyChart.js'", 'const { indexEnergyFlow, chartBuckets, isoWeek } = helpers')
  .replace("import { ENERGY_COLORS } from '../lib/chartTheme.js'", "const ENERGY_COLORS = { feedin: 'blue', pv: 'orange', battery: 'green', grid: 'red' }")
  .replace('export default', 'return')
const options = new Function('helpers', script)({ indexEnergyFlow, chartBuckets, isoWeek })
options.render = () => null
// Vue 3's custom renderer exercises component reactivity without a DOM/canvas dependency.
const renderer = createRenderer({
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {},
  parentNode: () => null, nextSibling: () => null,
})
function mount(props) {
  const state = reactive(props)
  const instance = ref()
  const events = []
  const app = renderer.createApp({
    render: () => h(options, { ...state, ref: instance, onYearChange: year => events.push(year) }),
  })
  app.mount({})
  return { vm: instance.value, state, events, unmount: () => app.unmount() }
}

test('chart components and results integration compile using Vue 3', () => {
  for (const name of ['EnergyFlowChart', 'BarChart', 'results/ResultsView']) {
    const { descriptor, errors } = parse(source(name))
    expect(errors).toEqual([])
    const script = compileScript(descriptor, { id: name })
    expect(compileTemplate({
      source: descriptor.template.content, filename: `${name}.vue`, id: name,
      compilerOptions: { bindingMetadata: script.bindings },
    }).errors).toEqual([])
  }
  expect(source('EnergyFlowChart')).not.toContain('<b-')
  expect(source('BarChart')).not.toContain('vue-chartjs/legacy')
})

function row(dayTime, value = 1000) {
  return { dayTime, feedInEnergyGrid: value, selfUsedEnergyPV: value * 2, selfUsedEnergyBattery: value * 3, gridUsedEnergy: value * 4 }
}

test('warns when excessive feed-in hides consumption without altering energy data', async () => {
  const normal = row('20230101:12')
  const { vm, state, unmount } = mount({ energyFlow: [normal], batteryCapacity: 10000 })
  expect(vm.feedInDominates).toBe(false)
  state.energyFlow = [{ ...normal, feedInEnergyGrid: 12000000 }]
  await nextTick()
  expect(vm.feedInDominates).toBe(true)
  expect(vm.datasets.slice(0, 4).map(dataset => dataset.data[0])).toEqual([-12000, 2, 3, 4])
  state.energyFlow = []
  await nextTick()
  expect(vm.feedInDominates).toBe(false)
  unmount()
})

test('ISO weeks handle week-year boundaries and week 53', () => {
  expect(isoWeek('2021-01-01')).toEqual({ key: '2020-W53', start: '2020-12-28' })
  expect(isoWeek('2019-12-30')).toEqual({ key: '2020-W01', start: '2019-12-30' })
  expect(isoWeek('2021-01-04')).toEqual({ key: '2021-W01', start: '2021-01-04' })
})

test('daily chart orders hours and distinguishes missing data from zero', () => {
  const index = indexEnergyFlow([row('20200229:23'), row('20200229:00', 0)])
  const buckets = chartBuckets(index, 'day', '2020-02-29')
  expect(buckets).toHaveLength(24)
  expect(buckets[0].values.gridUsedEnergy).toBe(0)
  expect(buckets[1].values).toBeNull()
  expect(buckets[23]).toEqual({ date: '2020-02-29', label: '23:00', soc: null, values: {
    feedInEnergyGrid: 1000, selfUsedEnergyPV: 2000, selfUsedEnergyBattery: 3000, gridUsedEnergy: 4000
  } })
})

test('calendar weeks show 168 ordered hourly buckets with missing hours blank', () => {
  const index = indexEnergyFlow([row('20200101:00'), row('20200102:00')])
  const buckets = chartBuckets(index, 'week', '2020-01-01')
  expect(buckets).toHaveLength(168)
  expect(buckets[0].values).toBeNull()
  expect(buckets[0].label).toBe('Mo 00:00')
  expect(buckets[48].values.feedInEnergyGrid).toBe(1000)
  expect(buckets[49].values).toBeNull()
  expect(buckets[72].values.feedInEnergyGrid).toBe(1000)
  expect(buckets[167].label).toBe('So 23:00')
  expect(buckets[167].values).toBeNull()
})

test('month views include every calendar day including leap days and gaps', () => {
  const index = indexEnergyFlow([row('20200201:00'), row('20200201:01'), row('20200229:23')])
  const buckets = chartBuckets(index, 'month', '2020-02-01')
  expect(buckets).toHaveLength(29)
  expect(buckets[0].values.feedInEnergyGrid).toBe(2000)
  expect(buckets[1].values).toBeNull()
  expect(buckets[28].label).toBe('29')
  expect(buckets[28].date).toBe('2020-02-29')
  expect(buckets[28].values.feedInEnergyGrid).toBe(1000)
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
  const periods = [
    chartBuckets(index, 'year', index.dates[0]),
    [...new Set(index.dates.map(date => date.slice(0, 7)))].flatMap(month => chartBuckets(index, 'month', `${month}-01`)),
    index.dates.flatMap(date => chartBuckets(index, 'day', date)),
    index.weeks.flatMap(week => chartBuckets(index, 'week', week.start)),
  ]
  for (const buckets of periods) {
    for (const [field, multiplier] of Object.entries({ feedInEnergyGrid: 1, selfUsedEnergyPV: 2, selfUsedEnergyBattery: 3, gridUsedEnergy: 4 })) {
      expect(buckets.reduce((total, bucket) => total + (bucket.values?.[field] ?? 0), 0)).toBe(8784000 * multiplier)
    }
  }
})

test('empty simulations have no selectable periods', () => {
  expect(indexEnergyFlow([])).toEqual({ days: {}, dates: [], weeks: [] })
  expect(chartBuckets(indexEnergyFlow([]), 'year', '')).toEqual([])
})

test('chart controls drill down, navigate and select ISO weeks', () => {
  const wrapper = mount({
    energyFlow: ['20200101:00', '20200201:00', '20200229:00', '20200301:00'].map(time => row(time))
  })
  const vm = wrapper.vm
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
  wrapper.unmount()
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

test('SOC line, axis and hint appear only in week/day views with a battery', () => {
  const wrapper = mount({ batteryCapacity: 1000, energyFlow: [{ ...row('20200229:23'), newBatterySoc: 500 }] })
  for (const mode of ['year', 'month', 'week', 'day', 'month', 'year']) {
    wrapper.vm.mode = mode
    const visible = mode === 'week' || mode === 'day'
    expect(wrapper.vm.showBatterySoc).toBe(visible)
    expect(wrapper.vm.datasets.some(dataset => dataset.yAxisID === 'soc')).toBe(visible)
  }
  wrapper.unmount()
  const withoutBattery = mount({ batteryCapacity: 1, energyFlow: [row('20200229:23')] })
  withoutBattery.vm.mode = 'day'
  expect(withoutBattery.vm.showBatterySoc).toBe(false)
  expect(withoutBattery.vm.datasets).toHaveLength(4)
  withoutBattery.unmount()
  expect(source('EnergyFlowChart')).toContain(':show-battery-axis="showBatterySoc"')
  expect(source('EnergyFlowChart')).toContain('v-if="showBatterySoc"')
})

test('chart drills down to matching week/day, drills out and emits year requests', () => {
  const wrapper = mount({
    batteryCapacity: 1000,
    years: [2019, 2020],
    energyFlow: [{ ...row('20200229:23'), newBatterySoc: 500 }]
  })
  const vm = wrapper.vm
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
  vm.requestYear('2019')
  expect(wrapper.events).toEqual([2019])
  vm.requestYear(2020)
  vm.requestYear(1900)
  expect(wrapper.events).toEqual([2019])
  wrapper.unmount()
})

test('busy blocks drill/navigation and year requests; new results select a valid date', async () => {
  const wrapper = mount({ energyFlow: [row('20200229:00')], years: [2019, 2020], busy: true })
  const vm = wrapper.vm
  vm.drillDown(0)
  vm.requestYear(2019)
  expect(vm.mode).toBe('year')
  expect(wrapper.events).toEqual([])
  wrapper.state.busy = false
  wrapper.state.energyFlow = [row('20190201:00')]
  await nextTick()
  expect(vm.selectedDate).toBe('2019-02-01')
  expect(vm.simulationYear).toBe(2019)
  vm.drillDown(0)
  expect(vm.mode).toBe('month')
  wrapper.state.busy = true
  await nextTick()
  vm.drillOut()
  vm.move(1)
  expect(vm.mode).toBe('month')
  wrapper.unmount()
})