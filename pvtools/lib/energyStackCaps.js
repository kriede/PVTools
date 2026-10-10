// Clip every energy segment to the same rounded stack silhouette. This keeps
// caps round even when the outermost segment is only a fraction of a pixel tall.
export function energyStackBounds(chart, meta, bar, dataIndex) {
  const positive = bar.y < bar.base
  const segments = chart.getSortedVisibleDatasetMetas().filter((candidate) =>
    candidate.type === 'bar' && candidate.stack === meta.stack &&
    candidate.xScale === meta.xScale && candidate.yScale === meta.yScale,
  ).map((candidate) => candidate.data[dataIndex]).filter((segment) =>
    segment && segment.y !== segment.base && (segment.y < segment.base) === positive,
  )
  const top = Math.min(...segments.map((segment) => Math.min(segment.y, segment.base)))
  const bottom = Math.max(...segments.map((segment) => Math.max(segment.y, segment.base)))
  const radius = Math.min(4, bar.width / 2, (bottom - top) / 2)
  return { left: bar.x - bar.width / 2, top, width: bar.width, height: bottom - top,
    radii: positive ? [radius, radius, 0, 0] : [0, 0, radius, radius] }
}

const path = (ctx, bounds) => ctx.roundRect(
  bounds.left, bounds.top, bounds.width, bounds.height, bounds.radii,
)

export const energyStackCaps = {
  id: 'energyStackCaps',
  beforeDatasetDraw(chart, { meta }) {
    if (!chart.data.datasets[meta.index].energyStackCaps) return
    const { ctx } = chart
    ctx.save()
    ctx.beginPath()
    for (const [index, bar] of meta.data.entries()) {
      if (bar.y === bar.base) continue
      path(ctx, energyStackBounds(chart, meta, bar, index))
    }
    ctx.clip()
    // The shared silhouette, not each segment's height, controls the radius.
    for (const bar of meta.data) {
      bar.$energyCapOptions = bar.options
      bar.options = { ...bar.options, borderRadius: 0 }
    }
  },
  afterDatasetDraw(chart, { meta }) {
    if (!chart.data.datasets[meta.index].energyStackCaps) return
    const { ctx } = chart
    ctx.restore()
    for (const [index, bar] of meta.data.entries()) {
      bar.options = bar.$energyCapOptions
      delete bar.$energyCapOptions
      if (bar.y === bar.base || !bar.options.borderWidth) continue
      // Redraw the curved outline in the color of the segment it crosses.
      ctx.save()
      ctx.beginPath()
      ctx.rect(bar.x - bar.width / 2 - 1, Math.min(bar.y, bar.base),
        bar.width + 2, Math.abs(bar.y - bar.base))
      ctx.clip()
      ctx.beginPath()
      path(ctx, energyStackBounds(chart, meta, bar, index))
      ctx.strokeStyle = bar.options.borderColor
      ctx.lineWidth = bar.options.borderWidth
      ctx.stroke()
      ctx.restore()
    }
  },
}