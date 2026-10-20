import { readFileSync } from 'node:fs'
import { BasicPlatform, Chart, registerables } from 'chart.js'
import { expect, test } from 'vitest'
import { ENERGY_COLORS, energyBarRadius, energyBarStyle } from '../lib/chartTheme.js'
import { RATINGS } from '../lib/rating.js'

test('CSS and canvas energy palettes remain synchronized', () => {
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8')
  for (const [name, color] of Object.entries(ENERGY_COLORS)) {
    const token = name === 'batteryCharge' ? 'battery-charge' : name
    expect(css).toContain(`--color-${token}: ${color};`)
  }
})

test('economic ratings retain status colors independently of the energy palette', () => {
  expect(RATINGS.yes.color).toBe('#3ccf62')
  expect(RATINGS.borderline.color).toBe('#f5a524')
  expect(RATINGS.no.color).toBe('#ef5b5b')
  expect(RATINGS.no.color).not.toBe(ENERGY_COLORS.grid)
})

test('energy bars match Home Assistant fill alpha and opaque rounded outlines', () => {
  expect(energyBarStyle(ENERGY_COLORS.grid)).toEqual({
    energyStackCaps: true,
    backgroundColor: '#488fc27F',
    borderColor: '#488fc2',
    borderWidth: 1,
    borderRadius: energyBarRadius,
    borderSkipped: 'start',
    inflateAmount: 0,
  })
})

test.each(Object.values(ENERGY_COLORS))('compact energy bars preserve hue with stronger fill and no outline (%s)', (color) => {
  expect(energyBarStyle(color, { compact: true })).toEqual({
    ...energyBarStyle(color),
    backgroundColor: `${color}99`,
    borderWidth: 0,
    hoverBorderWidth: 0,
  })
})

test.each([
  [20, 10, 2],
  [0, 10, 1],
  [0, 0, 0],
])('rounds the highest nonzero energy segment (grid %s, battery %s)', (grid, battery, topIndex) => {
  Chart.register(...registerables)
  const canvas = { width: 400, height: 300 }
  const context = new Proxy({
    canvas,
    measureText: (text) => ({ width: String(text).length * 6 }),
  }, {
    get: (target, key) => target[key] ?? (() => {}),
  })
  canvas.getContext = () => context
  const chart = new Chart(canvas, {
    platform: BasicPlatform,
    type: 'bar',
    data: {
      labels: ['Jan'],
      datasets: [100, battery, grid, -30].map((value) => ({
        data: [value],
        stack: 'energy',
        ...energyBarStyle(ENERGY_COLORS.pv),
      })),
    },
    options: {
      responsive: false,
      animation: false,
      events: [],
      plugins: { legend: false, tooltip: false },
      scales: { x: { stacked: true }, y: { stacked: true } },
    },
  })
  try {
    for (let index = 0; index < 3; index++) {
      const bar = chart.getDatasetMeta(index).data[0]
      expect(bar.enableBorderRadius).toBe(index === topIndex)
      expect(bar.borderSkipped).toEqual({ bottom: true })
      expect(bar.options.borderRadius).toEqual(index === topIndex
        ? { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 }
        : 0)
    }
    const exportBar = chart.getDatasetMeta(3).data[0]
    expect(exportBar.enableBorderRadius).toBe(true)
    expect(exportBar.borderSkipped).toEqual({ top: true })
    expect(exportBar.options.borderRadius).toEqual({
      topLeft: 0, topRight: 0, bottomLeft: 4, bottomRight: 4,
    })
  } finally {
    chart.destroy()
  }
})