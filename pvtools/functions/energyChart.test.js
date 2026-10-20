import { readFileSync } from 'node:fs'
import { createRenderer, h, ref, reactive, nextTick } from 'vue'
import { parse, compileScript, compileTemplate } from 'vue/compiler-sfc'
import { expect, test } from 'vitest'
import { isoWeek, indexEnergyFlow, chartBuckets } from './energyChart.js'
import { ENERGY_COLORS, energyBarStyle } from '../lib/chartTheme.js'

const source = name => readFileSync(new URL(`../components/${name}.vue`, import.meta.url), 'utf8')
const { descriptor } = parse(source('EnergyFlowChart'))
const script = descriptor.script.content
  .replace("import BarChart from './BarChart.vue'", 'const BarChart = {}')
  .replace("import HelpToggle from './ui/HelpToggle.vue'", 'const HelpToggle = {}')
  .replace("import { indexEnergyFlow, chartBuckets, isoWeek } from '../functions/energyChart.js'", 'const { indexEnergyFlow, chartBuckets, isoWeek } = helpers')
  .replace("import { ENERGY_COLORS, energyBarStyle } from '../lib/chartTheme.js'", 'const { ENERGY_COLORS, energyBarStyle } = helpers')
  .replace('export default', 'return')
const options = new Function('helpers', script)({ indexEnergyFlow, chartBuckets, isoWeek, ENERGY_COLORS, energyBarStyle })
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
  const batteryEvents = []
  const app = renderer.createApp({
    render: () => h(options, { ...state, ref: instance, onYearChange: year => events.push(year), onBatteryChange: size => batteryEvents.push(size) }),
  })
  app.mount({})
  return { vm: instance.value, state, events, batteryEvents, unmount: () => app.unmount() }
}

test('chart components and results integration compile using Vue 3', () => {
  for (const name of ['EnergyFlowChart', 'BarChart', 'results/ResultsView', 'inputs/AdvancedSettings']) {
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

test('all energy chart periods use the Home Assistant energy palette', () => {
  const { vm, unmount } = mount({ energyFlow: [row('20230101:12')], batteryCapacity: 10000 })
  for (const mode of ['year', 'month', 'week', 'day']) {
    vm.mode = mode
    const alpha = mode === 'week' ? '99' : '7F'
    expect(vm.datasets.slice(0, 5).map(dataset => dataset.backgroundColor)).toEqual(
      ['#8353d1', '#ff9800', '#4db6ac', '#488fc2', '#f06292'].map(color => `${color}${alpha}`),
    )
    expect(vm.datasets.slice(0, 5).map(dataset => dataset.borderColor)).toEqual([
      '#8353d1', '#ff9800', '#4db6ac', '#488fc2', '#f06292',
    ])
    expect(vm.datasets.slice(0, 5).every(dataset => dataset.borderWidth === (mode === 'week' ? 0 : 1))).toBe(true)
    if (mode === 'week') {
      expect(vm.datasets.slice(0, 5).every(dataset => dataset.hoverBorderWidth === 0)).toBe(true)
    }
    expect(vm.showBatterySoc).toBe(true)
    expect(vm.datasets.slice(5).every(dataset => dataset.borderColor === '#f06292')).toBe(true)
  }
  unmount()
})

test('battery charging is aggregated and stacked pink below feed-in in every period', () => {
  const { vm, unmount } = mount({ batteryCapacity: 10000, energyFlow: [
    { ...row('20230102:12'), batteryCharge: 500, newBatterySoc: 400 },
    { ...row('20230102:13'), batteryCharge: 1500, newBatterySoc: 1600 },
    row('20230102:14'),
  ] })
  for (const mode of ['year', 'month', 'week', 'day']) {
    vm.mode = mode
    const feedIn = vm.datasets.find(dataset => dataset.label === 'Netzeinspeisung')
    const charging = vm.datasets.find(dataset => dataset.label === 'Batterieladung')
    expect(charging.backgroundColor).toBe(mode === 'week' ? '#f0629299' : '#f062927F')
    expect(charging.borderColor).toBe('#f06292')
    expect(charging.stack).toBe(feedIn.stack)
    expect(charging.yAxisID).toBe(feedIn.yAxisID)
    expect(vm.datasets.indexOf(charging)).toBeGreaterThan(vm.datasets.indexOf(feedIn))
    expect(charging.data.reduce((total, value) => total + (value ?? 0), 0)).toBe(-2)
    expect(charging.data.every(value => value == null || value <= 0)).toBe(true)
    if (mode === 'day') {
      expect(charging.data[11]).toBeNull()
      expect(charging.data[12]).toBe(-0.5)
      expect(charging.data[13]).toBe(-1.5)
      expect(charging.data[14]).toBe(-0)
    }
  }
  unmount()
})

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
    feedInEnergyGrid: 1000, selfUsedEnergyPV: 2000, selfUsedEnergyBattery: 3000, gridUsedEnergy: 4000, batteryCharge: 0
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

test('SOC lines, axis and hint appear in every view only with a battery', () => {
  const wrapper = mount({ batteryCapacity: 1000, energyFlow: [{ ...row('20200229:23'), newBatterySoc: 500 }] })
  for (const mode of ['year', 'month', 'week', 'day', 'month', 'year']) {
    wrapper.vm.mode = mode
    expect(wrapper.vm.showBatterySoc).toBe(true)
    expect(wrapper.vm.datasets.filter(dataset => dataset.yAxisID === 'soc')).toHaveLength(1)
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

test('annual SOC shows only the average of all finite hourly states, not daily endpoints', () => {
  const wrapper = mount({ batteryCapacity: 1000, energyFlow: [
    { ...row('20200101:23'), newBatterySoc: 100 },
    { ...row('20200101:00'), newBatterySoc: 900 },
    { ...row('20200102:00'), newBatterySoc: 200 },
    { ...row('20200102:01'), newBatterySoc: NaN },
    row('20200201:00'),
  ] })
  const socLines = wrapper.vm.datasets.filter(dataset => dataset.yAxisID === 'soc')
  expect(socLines).toHaveLength(1)
  expect(socLines[0].label).toBe('Mittlerer Ladezustand (%)')
  expect(socLines[0].data).toEqual([40, null])
  wrapper.unmount()
})

test('monthly hourly SOC aligns within daily bars and preserves gaps and leap days', () => {
  const wrapper = mount({ batteryCapacity: 1000, energyFlow: [
    { ...row('20200201:00'), newBatterySoc: 0 },
    { ...row('20200201:23'), newBatterySoc: 1000 },
    { ...row('20200229:23'), newBatterySoc: 500 },
    { ...row('20200301:00'), newBatterySoc: 700 },
  ] })
  wrapper.vm.mode = 'month'
  expect(wrapper.vm.buckets).toHaveLength(29)
  expect(wrapper.vm.datasets[0].data[0]).toBe(-2)
  const hourly = wrapper.vm.datasets.find(dataset => dataset.yAxisID === 'soc')
  expect(hourly.xAxisID).toBe('socTime')
  expect(hourly.data).toHaveLength(29 * 24)
  expect(hourly.data[0]).toEqual({ x: -0.5 + 0.5 / 24, y: 0, hourLabel: '2020-02-01 00:00' })
  expect(hourly.data[1].y).toBeNull()
  expect(hourly.data[23].y).toBe(100)
  expect(hourly.data.at(-1)).toEqual({ x: 28 - 0.5 + 23.5 / 24, y: 50, hourLabel: '2020-02-29 23:00' })
  expect(hourly.spanGaps).toBe(false)
  wrapper.unmount()
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
  expect(vm.datasets.find(dataset => dataset.yAxisID === 'soc').data[23]).toBe(50)
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

test('week labels omit years and clip both boundary weeks to the simulation year', () => {
  const wrapper = mount({ energyFlow: [row('20220101:00'), row('20221231:00')] })
  expect(wrapper.vm.weekOptions.map(week => week.text)).toEqual([
    'KW52 01.01. - 02.01.', 'KW52 26.12. - 31.12.'
  ])
  expect(new Set(wrapper.vm.weekOptions.map(week => week.value)).size).toBe(2)
  expect(source('EnergyFlowChart')).not.toContain('v-if="mode === \'year\'"')
  wrapper.unmount()
})

test('year and battery changes preserve detail and date, including leap-day fallback', async () => {
  const wrapper = mount({
    energyFlow: [row('20200229:00')], years: [2019, 2020],
    batteryCapacity: 5000, batterySizes: [1, 5000, 10000]
  })
  wrapper.vm.mode = 'day'
  wrapper.vm.requestYear(2019)
  expect(wrapper.events).toEqual([2019])
  wrapper.state.energyFlow = [row('20190101:00'), row('20190228:00')]
  await nextTick()
  expect(wrapper.vm.mode).toBe('day')
  expect(wrapper.vm.selectedDate).toBe('2019-02-28')
  wrapper.vm.mode = 'week'
  wrapper.state.energyFlow = [row('20200101:00'), row('20200228:00')]
  await nextTick()
  expect(wrapper.vm.mode).toBe('week')
  expect(wrapper.vm.selectedDate).toBe('2020-02-28')
  wrapper.vm.requestBattery('10000')
  wrapper.vm.requestBattery('9999')
  expect(wrapper.batteryEvents).toEqual([10000])
  wrapper.state.batteryCapacity = 10000
  wrapper.state.energyFlow = [row('20200101:00'), row('20200228:00', 2)]
  await nextTick()
  expect(wrapper.vm.mode).toBe('week')
  expect(wrapper.vm.selectedDate).toBe('2020-02-28')
  wrapper.state.busy = true
  await nextTick()
  wrapper.vm.requestBattery(1)
  expect(wrapper.batteryEvents).toEqual([10000])
  expect(source('results/ResultsView')).toContain('@battery-change="selectedSize = $event"')
  wrapper.unmount()
})

test('calendar separators mark Mondays in months and midnight in weeks only', () => {
  const { vm, unmount } = mount({ energyFlow: [row('20230101:00')] })
  vm.mode = 'month'
  expect(vm.separatorIndices).toEqual([1, 8, 15, 22, 29])
  vm.mode = 'week'
  expect(vm.separatorIndices).toEqual([24, 48, 72, 96, 120, 144])
  for (const mode of ['year', 'day']) {
    vm.mode = mode
    expect(vm.separatorIndices).toEqual([])
  }
  unmount()
})

test('month bars have 15% width gaps and weekly bars have one pixel gaps, preserving day/year widths', () => {
  // Recreate the chart per mode: vue-chartjs updates data in place but does not
  // remove old dataset options when switching back to annual defaults.
  expect(source('EnergyFlowChart')).toContain('<BarChart :key="mode"')
  const wrapper = mount({ energyFlow: [row('20230101:00')] })
  for (const mode of ['month', 'day', 'week', 'year']) {
    wrapper.vm.mode = mode
    for (const dataset of wrapper.vm.datasets.slice(0, 4)) {
      if (mode === 'year') {
        expect(dataset.categoryPercentage).toBeUndefined()
        expect(dataset.barPercentage).toBeUndefined()
      } else {
        expect(dataset.categoryPercentage).toBe(1)
        expect(dataset.grouped).toBe(mode === 'month' ? false : undefined)
        if (mode === 'week' || mode === 'month') {
          for (const spacing of [2, 4.5, 10]) {
            const chart = { scales: { x: { getPixelForValue: index => 50 + index * spacing } } }
            const width = dataset.barThickness({ chart })
            if (mode === 'week') expect(spacing - width).toBeCloseTo(1)
            else expect((spacing - width) / width).toBeCloseTo(0.15)
          }
        } else {
          expect(dataset.barThickness).toBe('flex')
          expect((1 - dataset.barPercentage) / dataset.barPercentage).toBeCloseTo(mode === 'month' ? 0.15 : 0.25)
        }
      }
    }
  }
  wrapper.unmount()
})