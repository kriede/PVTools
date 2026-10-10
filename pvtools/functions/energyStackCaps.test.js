import { expect, test, vi } from 'vitest'
import { energyStackBounds, energyStackCaps } from '../lib/energyStackCaps.js'

test.each([0, 1])('stack caps respect border width %s', (borderWidth) => {
  const options = { borderWidth, borderColor: '#488fc2', borderRadius: 4 }
  const bar = { x: 20, width: 6, base: 100, y: 50, options }
  const meta = { index: 0, type: 'bar', stack: 'energy', data: [bar] }
  const ctx = Object.fromEntries(['save', 'restore', 'beginPath', 'roundRect', 'rect', 'clip', 'stroke']
    .map(name => [name, vi.fn()]))
  const chart = { ctx, data: { datasets: [{ energyStackCaps: true }] },
    getSortedVisibleDatasetMetas: () => [meta] }
  energyStackCaps.beforeDatasetDraw(chart, { meta })
  energyStackCaps.afterDatasetDraw(chart, { meta })
  expect(ctx.stroke).toHaveBeenCalledTimes(borderWidth ? 1 : 0)
  expect(bar.options).toBe(options)
  expect(bar).not.toHaveProperty('$energyCapOptions')
})

test('tiny grid and battery segments retain a full-radius positive stack cap', () => {
  const xScale = {}
  const yScale = {}
  const bars = [
    { x: 20, width: 20, base: 100, y: 50 },
    { x: 20, width: 20, base: 50, y: 49.9 },
    { x: 20, width: 20, base: 49.9, y: 49.89 },
  ]
  const metas = bars.map((bar) => ({ type: 'bar', stack: 'energy', xScale, yScale, data: [bar] }))
  const chart = { getSortedVisibleDatasetMetas: () => metas }
  for (let index = 0; index < bars.length; index++) {
    expect(energyStackBounds(chart, metas[index], bars[index], 0)).toEqual({
      left: 10, top: 49.89, width: 20, height: 50.11, radii: [4, 4, 0, 0],
    })
  }
})

test('negative stacks round only their bottom end and exclude positive segments', () => {
  const bar = { x: 20, width: 6, base: 100, y: 130 }
  const meta = { type: 'bar', stack: 'energy', data: [bar] }
  const chart = { getSortedVisibleDatasetMetas: () => [meta] }
  expect(energyStackBounds(chart, meta, bar, 0).radii).toEqual([0, 0, 3, 3])
})