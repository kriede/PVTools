/** Wholesale prices are a dispatch signal only, never a retail tariff. */
export const gridFriendlyStressHours = (rows, input) => {
  if (!input.gridFriendlyChargingEnabled) return null
  const threshold = input.gridFriendlyPriceThreshold ?? 0
  if (!Number.isFinite(threshold)) {
    throw new Error('Netzdienliches Laden: Die Preisschwelle muss eine endliche Zahl in EUR/MWh sein.')
  }
  return rows.map(({ dayTime }) => {
    const prices = input.gridFriendlyPrices
    if (!prices || !Object.hasOwn(prices, dayTime) || !Number.isFinite(prices[dayTime])) {
      throw new Error(`Netzdienliches Laden: Für jede Simulationsstunde ist ein endlicher Strompreis in EUR/MWh erforderlich. Fehlender oder ungültiger Preis für ${dayTime}.`)
    }
    return prices[dayTime] <= threshold
  })
}

/**
 * Conservative ideal-forecast heuristic, not a global optimizer: outside a
 * stressed hour, reserve the SOC gain of stressed PV surplus in the next 23
 * rows. The current row plus those rows is the entire 24-hour horizon; no
 * year wrap or foresight beyond it. Surplus includes otherwise curtailed PV,
 * but excludes inverter clipping and all configured direct/flat loads.
 * Each future gain is capped by charge power and efficiency, and the sum by
 * usable capacity. Future discharge is deliberately not credited, so this
 * can reserve more headroom than necessary. In stressed hours charging is
 * unrestricted: absorbing surplus now takes priority over later stress.
 * This target constrains charging only, never physical SOC or discharge.
 */
export const planChargingSocTarget = ({
  index,
  noBatteryFlows,
  stressedHours,
  batterySocMin,
  batterySocMax,
  batteryLoadEfficiency = 1,
  maxPowerLoadBattery = 0,
}) => {
  if (!stressedHours || stressedHours[index]) return Infinity
  const chargePower = maxPowerLoadBattery > 0 ? maxPowerLoadBattery : Infinity
  const usableCapacity = Math.max(batterySocMax - batterySocMin, 0)
  let reserved = 0
  const end = Math.min(index + 24, noBatteryFlows.length)
  for (let future = index + 1; future < end; future++) {
    if (!stressedHours[future]) continue
    const flow = noBatteryFlows[future]
    const surplus = Math.max(flow.feedInEnergyGrid + flow.missedFeedInPowerGrid, 0)
    reserved = Math.min(
      usableCapacity,
      reserved + Math.min(surplus, chargePower) * batteryLoadEfficiency,
    )
  }
  return batterySocMax - reserved
}