import { expect, test, vi } from 'vitest'
import { batteryZeroAlignment } from '../lib/batteryAxis.js'

test.each([[-20, 10], [-1000, 5], [0, 10], [-5, 20]])(
  'aligns battery and energy zeros for energy bounds %s to %s', (min, max) => {
    const soc = { options: { display: true }, min: 0, max: 100, configure: vi.fn() }
    batteryZeroAlignment.afterLayout({ scales: { y: { min, max }, soc } })
    expect((0 - soc.min) / (soc.max - soc.min)).toBeCloseTo((0 - min) / (max - min))
    expect(soc.max).toBe(100)
    expect(soc.configure).toHaveBeenCalledOnce()
    expect(soc.min).toBeLessThanOrEqual(0)
  },
)

test('does not alter hidden or absent battery scales', () => {
  const soc = { options: { display: false }, min: 0, max: 100, configure: vi.fn() }
  batteryZeroAlignment.afterLayout({ scales: { y: { min: -20, max: 10 }, soc } })
  expect(soc.min).toBe(0)
  expect(soc.configure).not.toHaveBeenCalled()
  expect(() => batteryZeroAlignment.afterLayout({ scales: {} })).not.toThrow()
})

test('recomputes alignment when the visible energy range changes', () => {
  const soc = { options: { display: true }, min: 0, max: 100, configure: vi.fn() }
  const chart = { scales: { y: { min: -20, max: 10 }, soc } }
  batteryZeroAlignment.afterLayout(chart)
  expect(soc.min).toBe(-200)
  chart.scales.y = { min: 0, max: 10 }
  batteryZeroAlignment.afterLayout(chart)
  expect(soc.min).toBe(0)
})