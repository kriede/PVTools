import { Chart } from 'chart.js'
import { energyStackCaps } from './energyStackCaps.js'

Chart.register(energyStackCaps)

// Home Assistant energy palette; keep the CSS energy tokens in sync.
export const ENERGY_COLORS = {
  pv: '#ff9800',
  battery: '#4db6ac',
  grid: '#488fc2',
  feedin: '#8353d1',
  batteryCharge: '#f06292',
  loss: '#8a94a6',
}

/** Assign rounded corners explicitly to the outermost nonzero stack segment. */
export function energyBarRadius({ chart, dataset, datasetIndex, dataIndex }) {
  const value = dataset.data[dataIndex]
  if (!value) return 0
  const outerIndex = chart.data.datasets.findLastIndex((candidate, index) => {
    const candidateValue = candidate.data[dataIndex]
    return chart.isDatasetVisible(index) &&
      (candidate.type ?? chart.config.type) === 'bar' &&
      candidate.stack === dataset.stack &&
      candidate.yAxisID === dataset.yAxisID &&
      (value > 0 ? candidateValue > 0 : candidateValue < 0)
  })
  if (datasetIndex !== outerIndex) return 0
  return {
    topLeft: value > 0 ? 4 : 0,
    topRight: value > 0 ? 4 : 0,
    bottomLeft: value < 0 ? 4 : 0,
    bottomRight: value < 0 ? 4 : 0,
  }
}

/** Home Assistant uses alpha 0x7F for fills and an opaque outline. */
export const energyBarStyle = (color) => ({
  energyStackCaps: true,
  backgroundColor: `${color}7F`,
  borderColor: color,
  borderWidth: 1,
  borderRadius: energyBarRadius,
  // Round only the free end: top for positive stacks, bottom for negative ones.
  borderSkipped: 'start',
  inflateAmount: 0,
})

/** colors of the current theme, read from the CSS variables */
export function themeColors() {
  const style = getComputedStyle(document.documentElement)
  const v = (name) => style.getPropertyValue(name).trim()
  return {
    ink: v('--ink'),
    muted: v('--muted'),
    line: v('--line'),
    surface: v('--surface'),
    brand: v('--brand'),
    accent: v('--accent'),
  }
}

/** shared Chart.js options matching the app design */
export function baseOptions(colors) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    font: { family: "'JetBrains Mono Variable', monospace" },
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: colors.muted,
          boxWidth: 10,
          boxHeight: 10,
          useBorderRadius: true,
          borderRadius: 2,
          font: { family: "'Inter Variable', sans-serif", size: 12 },
        },
      },
      tooltip: {
        backgroundColor: colors.surface,
        titleColor: colors.ink,
        bodyColor: colors.ink,
        borderColor: colors.line,
        borderWidth: 1,
        padding: 10,
        titleFont: { family: "'JetBrains Mono Variable', monospace" },
        bodyFont: { family: "'JetBrains Mono Variable', monospace" },
      },
    },
  }
}

export const axis = (colors, extra = {}) => ({
  grid: { color: colors.line, drawTicks: false },
  border: { display: false },
  ticks: {
    color: colors.muted,
    padding: 6,
    font: { family: "'JetBrains Mono Variable', monospace", size: 11 },
  },
  ...extra,
})

Chart.defaults.font.family = "'Inter Variable', sans-serif"
