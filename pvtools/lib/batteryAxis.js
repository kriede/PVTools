/** Align 0% with the energy zero line without changing the SOC data. */
export const batteryZeroAlignment = {
  id: 'batteryZeroAlignment',
  afterLayout(chart) {
    const { y, soc } = chart.scales
    if (!soc?.options.display || !y || y.max <= 0) return
    soc.min = 100 * Math.min(0, y.min) / y.max
    soc.max = 100
    // Layout is complete: use the final (rounded) energy limits, not raw data limits.
    soc.configure()
  },
}