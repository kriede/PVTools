const fs = require('fs')
const path = require('path')
const compiler = require('vue-template-compiler')
const flow = require('./energyFlow')
const slp = require('./SLP')
const custom = require('./customConsumption')

// Load the actual page script without Nuxt's component and raw-loader imports.
const source = fs.readFileSync(path.join(__dirname, '../pages/index.vue'), 'utf8')
const sfc = compiler.parseComponent(source)
const script = sfc.script.content
  .replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '')
  .replace('export default', 'return')
const dependencies = {
  Chart: {}, EnergyFlowChart: {}, FAQ: {}, ...flow, ...slp, ...custom,
  customConsumptionYaml: fs.readFileSync(path.join(__dirname, '../custom-consumption.yaml'), 'utf8')
}
const page = new Function(...Object.keys(dependencies), script)(...Object.values(dependencies))

function instance() {
  const vm = page.data()
  Object.entries(page.methods).forEach(([key, method]) => { vm[key] = method.bind(vm) })
  vm.adressData = { lat: '50.9', lon: '6.9' }
  vm.input.roofs = [{ aspect: 0, angle: 30, peakpower: 1000 }]
  vm.batterySizes = [5000, 10000]
  vm.$axios = { post: jest.fn() }
  return vm
}

function radiation(year, power = 1000) {
  return { data: { outputs: { hourly: [
    { time: `${year}0101:0010`, P: power },
    { time: `${year}0701:1210`, P: power * 2 }
  ] } } }
}

function results(vm) {
  return {
    displayData: vm.displayData, roofsData: vm.roofsData,
    customConsumptionSummary: vm.customConsumptionSummary,
    customConsumptionYear: vm.customConsumptionYear,
    householdConsumptionKwh: vm.householdConsumptionKwh,
    totalConsumptionKwh: vm.totalConsumptionKwh, timeNeeded: vm.timeNeeded
  }
}

beforeEach(() => {
  global.localStorage = { getItem: jest.fn(() => null), setItem: jest.fn() }
})

test('page template compiles and wires chart year changes to the simulation handler', () => {
  expect(compiler.compile(sfc.template.content).errors).toEqual([])
  expect(sfc.template.content).toContain('@year-change="changeComparisonYear"')
  expect(sfc.template.content).toContain(':battery-capacity="row.item.size"')
  expect(sfc.template.content).toContain(':busy="isCalculating"')
})

test('year-change validates supported years, sets a numeric year and awaits generation', async () => {
  const vm = instance()
  let finish
  vm.generateData = jest.fn(() => new Promise(resolve => { finish = resolve }))
  let settled = false
  const pending = vm.changeComparisonYear('2019').then(() => { settled = true })
  expect(vm.input.year).toBe(2019)
  expect(vm.generateData).toHaveBeenCalledTimes(1)
  await Promise.resolve()
  expect(settled).toBe(false)
  finish()
  await pending
  expect(settled).toBe(true)
  await vm.changeComparisonYear(2021)
  await vm.changeComparisonYear('invalid')
  vm.isCalculating = true
  await vm.changeComparisonYear(2018)
  expect(vm.input.year).toBe(2019)
  expect(vm.generateData).toHaveBeenCalledTimes(1)
})

test('actual simulation recomputes two comparison years and retains expanded details by size', async () => {
  const vm = instance()
  vm.$axios.post.mockImplementation((route, body) => {
    const year = Number(new URL(body.url).searchParams.get('startyear'))
    return Promise.resolve(radiation(year, year === 2020 ? 1000 : 2000))
  })
  await vm.generateData()
  expect(vm.customConsumptionYear).toBe(2020)
  expect(vm.roofsData[0].generationYear).toBe(3)
  const previousFlow = vm.displayData[1].energyFlow
  const previousSummary = vm.customConsumptionSummary
  vm.displayData[1]._showDetails = true
  vm.batterySizes = [10000, 5000]
  await vm.changeComparisonYear(2019)
  expect(vm.customConsumptionYear).toBe(2019)
  expect(vm.roofsData[0].generationYear).toBe(6)
  expect(vm.displayData.find(row => row.size === 5000)._showDetails).toBe(true)
  expect(vm.displayData.find(row => row.size === 10000)._showDetails).toBe(false)
  expect(vm.displayData[1].energyFlow).not.toEqual(previousFlow)
  expect(vm.displayData.every(row => row.energyFlow.every(hour => hour.dayTime.startsWith('2019')))).toBe(true)
  expect(vm.customConsumptionSummary).not.toBe(previousSummary)
  expect(vm.$axios.post.mock.calls.map(([, body]) => {
    const params = new URL(body.url).searchParams
    expect(params.get('startyear')).toBe(params.get('endyear'))
    return params.get('startyear')
  })).toEqual(['2020', '2019'])
  expect(vm.isCalculating).toBe(false)
})

test('input, nested roofs, address, and battery sizes are snapshotted across requests', async () => {
  const vm = instance()
  const baseline = instance()
  baseline.$axios.post.mockResolvedValue(radiation(2020))
  await baseline.generateData()
  let finish
  vm.$axios.post.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const pending = vm.generateData()
  expect(vm.isCalculating).toBe(true)
  vm.input.year = 2018
  vm.input.yearlyConsumption = 9000
  vm.input.consumptionCosts = 2
  vm.input.batterySocMinPercent = 90
  vm.input.amortizationYears = 1
  vm.input.roofs[0].peakpower = 9000
  vm.input.roofs.push({ aspect: 90, angle: 45, peakpower: 2000 })
  vm.adressData.lat = '1'
  vm.batterySizes.splice(0, 2, 20000)
  finish(radiation(2020))
  await pending
  expect(vm.displayData).toEqual(baseline.displayData)
  expect(vm.roofsData).toEqual(baseline.roofsData)
  expect(vm.customConsumptionSummary).toEqual(baseline.customConsumptionSummary)
  expect(vm.totalConsumptionKwh).toBe(baseline.totalConsumptionKwh)
  expect(vm.customConsumptionYear).toBe(2020)
  const params = new URL(vm.$axios.post.mock.calls[0][1].url).searchParams
  expect(params.get('lat')).toBe('50.9')
  expect(params.get('peakpower')).toBe('1')
  expect(params.get('startyear')).toBe('2020')
  expect(JSON.parse(localStorage.setItem.mock.calls.find(([key]) => key === 'storedInput')[1]).year).toBe(2020)
})

test.each([
  ['wrong year', radiation(2018)],
  ['mixed years', { data: { outputs: { hourly: [...radiation(2019).data.outputs.hourly, ...radiation(2018).data.outputs.hourly] } } }],
  ['empty hourly data', { data: { outputs: { hourly: [] } } }],
  ['no matching timestamps', { data: { outputs: { hourly: [{ time: '20191301:0010', P: 1000 }] } } }],
  ['invalid response', { data: {} }]
])('failed comparison preserves all prior results: %s', async (label, response) => {
  const vm = instance()
  vm.$axios.post.mockResolvedValue(radiation(2020))
  await vm.generateData()
  vm.displayData[1]._showDetails = true
  const previous = results(vm)
  vm.$axios.post.mockResolvedValue(response)
  await vm.changeComparisonYear(2019)
  expect(results(vm)).toEqual(previous)
  expect(vm.displayData).toBe(previous.displayData)
  expect(vm.roofsData).toBe(previous.roofsData)
  expect(vm.customConsumptionYear).toBe(2020)
  expect(vm.calculationError).toContain('Vorhandene Ergebnisse bleiben unverändert')
  expect(vm.isCalculating).toBe(false)
})

test('partial roof requests never replace good results; busy state stays set until finally', async () => {
  const vm = instance()
  vm.$axios.post.mockResolvedValue(radiation(2020))
  await vm.generateData()
  const previous = results(vm)
  vm.input.roofs.push({ aspect: 90, angle: 30, peakpower: 1000 })
  let reject
  vm.$axios.post.mockResolvedValueOnce(radiation(2019))
    .mockImplementationOnce(() => new Promise((resolve, fail) => { reject = fail }))
  const pending = vm.changeComparisonYear(2019)
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  expect(vm.isCalculating).toBe(true)
  expect(results(vm)).toEqual(previous)
  await vm.changeComparisonYear(2018)
  expect(vm.input.year).toBe(2019)
  reject(new Error('network failure'))
  await pending
  expect(results(vm)).toEqual(previous)
  expect(vm.isCalculating).toBe(false)
})

test('custom-consumption errors and number formatting are displayed in German', async () => {
  const vm = instance()
  vm.calculateData = jest.fn().mockRejectedValue(new Error('Custom consumption: Ungültiges YAML'))
  await vm.generateData()
  expect(vm.calculationError).toBe('Zusätzlicher Stromverbrauch: Ungültiges YAML')
  expect(vm.formatSummaryNumber(1234.5)).toBe('1.234,5')
  expect(vm.tableFields[0].formatter(5500)).toBe('5,5 kWh')
  expect(vm.isCalculating).toBe(false)
})

test('calculateData leaves the busy flag to generateData finally', async () => {
  const vm = instance()
  vm.$axios.post.mockResolvedValue(radiation(2020))
  const calculate = vm.calculateData
  let observedBusy
  vm.calculateData = async () => {
    await calculate()
    observedBusy = vm.isCalculating
  }
  await vm.generateData()
  expect(observedBusy).toBe(true)
  expect(vm.isCalculating).toBe(false)
})