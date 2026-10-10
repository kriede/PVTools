import {
  applyHouseholdBaseload,
  getConsumptionProfile,
  scaleToMonths,
  validateHouseholdProfile,
  validMonthly,
} from './consumptionProfiles.js'
import { generateDayTimeValues } from './energyFlow.js'
import { getHourModel } from './hourModels/index.js'
import { simulateBatterySizes } from './simulation.js'
import regressionDb from './regression.json'
import customConsumptionYaml from '../custom-consumption.yaml?raw'
import {
  parseCustomConsumptions,
  addCustomConsumptions,
  summarizeCustomConsumptions,
} from './customConsumption.js'

/** hourly consumption from the yearly value or the 12 monthly values */
const profileConsumption = (input) => {
  validateHouseholdProfile(input)
  const monthly = input.monthlyConsumptionEnabled && input.monthlyConsumption
  const useMonthly = validMonthly(monthly)
  const consumption = getConsumptionProfile(
    getHourModel(input.hourModel).consumptionProfile,
  ).build({
    year: input.year,
    sigma: input.householdSigma ?? 1,
    consumptionYear: useMonthly
      ? monthly.reduce((sum, value) => sum + Number(value), 0)
      : input.yearlyConsumption,
  })
  // kWh per month → Wh like the profile
  const scaled = useMonthly
    ? scaleToMonths(
        consumption,
        monthly.map((value) => Number(value) * 1000),
      )
    : consumption
  return applyHouseholdBaseload(scaled, input)
}

// runs the simulation off the main thread, it takes a few seconds
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ type: 'progress', stage: 'preparing' })
    const { mergedPower, importedConsumption, input, batterySizes } = data
    const baseConsumption = importedConsumption || profileConsumption(input)
    const customEntries = parseCustomConsumptions(customConsumptionYaml)
    const consumption = addCustomConsumptions(baseConsumption, customEntries, input.year)
    const baseKwh = Object.values(baseConsumption).reduce((sum, hour) => sum + hour.P, 0) / 1000
    const customSummaries = summarizeCustomConsumptions(customEntries, input.year)
    const customKwh = customSummaries.reduce((sum, item) => sum + item.energyKwh, 0)
    // Upstream HP/EV loads are added separately by simulateBatterySizes.
    const consumptionSummary = {
      year: Number(input.year),
      baseKwh,
      customSummaries,
      customKwh,
      totalKwh: baseKwh + customKwh,
    }
    const powerGenAndConsumption = generateDayTimeValues({
      consumption,
      powerGeneration: mergedPower,
      year: input.year,
    })
    const results = simulateBatterySizes({
      powerGenAndConsumption,
      input,
      batterySizes,
      regressionDb,
      onProgress: progress => self.postMessage({ type: 'progress', stage: 'simulating', ...progress }),
    })
    self.postMessage({ type: 'progress', stage: 'transferring' })
    self.postMessage({ results, hours: powerGenAndConsumption.length, consumptionSummary })
  } catch (error) {
    self.postMessage({ error: error.message })
  }
}
