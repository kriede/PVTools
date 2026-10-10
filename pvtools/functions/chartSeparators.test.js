import { expect, test, vi } from 'vitest'
import { calendarSeparators } from '../lib/chartSeparators.js'

test('calendar lines span the plot at category boundaries, independent of skipped ticks', () => {
  const ctx = Object.fromEntries(['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'stroke'].map(name => [name, vi.fn()]))
  const chart = {
    ctx,
    chartArea: { left: 0, right: 100, top: 10, bottom: 200 },
    scales: { x: { getPixelForValue: index => 5 + index * 10 } },
  }
  calendarSeparators.beforeDatasetsDraw(chart, {}, { indices: [0, 1, 4, 10], color: '#24302a' })
  expect(ctx.moveTo.mock.calls).toEqual([[10, 10], [40, 10]])
  expect(ctx.lineTo.mock.calls).toEqual([[10, 200], [40, 200]])
  expect(ctx.strokeStyle).toBe('#24302a')
  expect(ctx.lineWidth).toBe(1)
  expect(ctx.restore).toHaveBeenCalledOnce()
})

test('views without calendar boundaries do not draw lines', () => {
  calendarSeparators.beforeDatasetsDraw({}, {}, { indices: [] })
})