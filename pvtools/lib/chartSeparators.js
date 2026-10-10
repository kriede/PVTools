/** Draw calendar boundaries halfway between adjacent category centers. */
export const calendarSeparators = {
  id: 'calendarSeparators',
  beforeDatasetsDraw(chart, args, { indices = [], color }) {
    const { ctx, chartArea, scales } = chart
    if (!indices.length || !chartArea || !scales.x) return
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.beginPath()
    for (const index of indices) {
      const x = (scales.x.getPixelForValue(index - 1) + scales.x.getPixelForValue(index)) / 2
      if (x <= chartArea.left || x >= chartArea.right) continue
      ctx.moveTo(x, chartArea.top)
      ctx.lineTo(x, chartArea.bottom)
    }
    ctx.stroke()
    ctx.restore()
  },
}