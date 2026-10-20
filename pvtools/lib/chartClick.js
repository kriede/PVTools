export function nearestBarIndex(event, chart) {
  const { x, y } = event
  const { left, right, top, bottom } = chart.chartArea
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < left || x > right || y < top || y > bottom) return null

  let index = null
  let distance = Infinity
  for (const meta of chart.getSortedVisibleDatasetMetas()) {
    if (meta.type !== 'bar') continue
    meta.data.forEach((bar, barIndex) => {
      if (bar.skip || !Number.isFinite(bar.x) || !Number.isFinite(bar.y)) return
      const delta = Math.abs(bar.x - x)
      if (delta < distance) {
        distance = delta
        index = barIndex
      }
    })
  }
  return index
}
