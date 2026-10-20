import { BasicPlatform, Chart, registerables } from 'chart.js'
import { expect, test } from 'vitest'
import { nearestBarIndex } from '../lib/chartClick.js'

Chart.register(...registerables)

function createChart(count) {
  const canvas = { width: 1000, height: 300 }
  const context = new Proxy({
    canvas,
    measureText: text => ({ width: String(text).length * 6 }),
  }, { get: (target, key) => target[key] ?? (() => {}) })
  canvas.getContext = () => context
  return new Chart(canvas, {
    platform: BasicPlatform,
    type: 'bar',
    data: {
      labels: Array.from({ length: count }, (_, index) => String(index)),
      datasets: [
        { data: Array(count).fill(10), stack: 'energy', barThickness: 1 },
        { data: Array(count).fill(-5), stack: 'energy', barThickness: 1 },
        { type: 'line', data: Array.from({ length: count * 2 }, (_, index) => ({ x: index / 2, y: 5 })), xAxisID: 'socTime' },
      ],
    },
    options: {
      responsive: false, animation: false, events: [],
      plugins: { legend: false, tooltip: false },
      scales: {
        x: { stacked: true }, y: { stacked: true },
        socTime: { type: 'linear', display: false, min: -0.5, max: count - 0.5 },
      },
    },
  })
}

test.each([12, 31, 168, 24])('selects the horizontally nearest energy bar in gaps (%s categories)', count => {
  const chart = createChart(count)
  try {
    const bars = chart.getDatasetMeta(0).data
    const first = bars[2]
    const second = bars[3]
    const midpoint = (first.x + second.x) / 2
    const y = (chart.chartArea.top + chart.chartArea.bottom) / 2
    const before = { x: midpoint - 0.1, y }
    const after = { x: midpoint + 0.1, y }
    expect(chart.getElementsAtEventForMode({ ...before, native: {} }, 'nearest', { intersect: true }, false)).toEqual([])
    expect(nearestBarIndex(before, chart)).toBe(2)
    expect(nearestBarIndex(after, chart)).toBe(3)
    expect(nearestBarIndex({ x: first.x, y: first.y }, chart)).toBe(2)
    expect(nearestBarIndex({ x: first.x, y: chart.chartArea.top + 1 }, chart)).toBe(2)
    expect(nearestBarIndex({ x: chart.chartArea.left, y }, chart)).toBe(0)
    expect(nearestBarIndex({ x: chart.chartArea.right, y }, chart)).toBe(count - 1)
    expect(nearestBarIndex({ x: chart.chartArea.left - 1, y }, chart)).toBeNull()
    expect(nearestBarIndex({ x: first.x, y: chart.chartArea.bottom + 1 }, chart)).toBeNull()
    expect(nearestBarIndex({ x: NaN, y }, chart)).toBeNull()
    chart.setDatasetVisibility(0, false)
    chart.update()
    expect(nearestBarIndex(before, chart)).toBe(2)
    chart.setDatasetVisibility(1, false)
    chart.update()
    expect(nearestBarIndex(before, chart)).toBeNull()
  } finally {
    chart.destroy()
  }
})
