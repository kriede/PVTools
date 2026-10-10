<template>
  <div :class="cssClasses" :style="[{ height: `${height}px` }, styles]">
    <Bar
      :key="isDark"
      :id="chartId"
      :data="chartData"
      :options="chartOptions"
      :dataset-id-key="datasetIdKey"
      :plugins="chartPlugins"
      :width="width"
      :height="height"
      aria-label="Energiefluss nach Zeitraum"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS, Title, Tooltip, Legend, BarElement, LineElement,
  PointElement, LineController, CategoryScale, LinearScale,
} from 'chart.js'
import { useTheme } from '../composables/useTheme.js'
import { axis, baseOptions, themeColors } from '../lib/chartTheme.js'
import { batteryZeroAlignment } from '../lib/batteryAxis.js'
import { calendarSeparators } from '../lib/chartSeparators.js'

ChartJS.register(Title, Tooltip, Legend, BarElement, LineElement, PointElement,
  LineController, CategoryScale, LinearScale)

const props = defineProps({
  chartId: { type: String, default: 'energy-flow-chart' },
  datasetIdKey: { type: String, default: 'label' },
  width: { type: Number, default: 400 },
  height: { type: Number, default: 400 },
  cssClasses: { type: String, default: '' },
  styles: { type: Object, default: () => ({}) },
  plugins: { type: Array, default: () => [] },
  labels: { type: Array, default: () => [] },
  datasets: { type: Array, default: () => [] },
  axisTitle: { type: String, default: '' },
  showBatteryAxis: { type: Boolean, default: false },
  separatorIndices: { type: Array, default: () => [] },
})
const emit = defineEmits(['bar-click'])
const { isDark } = useTheme()
const chartData = computed(() => ({ labels: props.labels, datasets: props.datasets }))
const chartPlugins = computed(() => [...props.plugins, batteryZeroAlignment, calendarSeparators])
const chartOptions = computed(() => {
  void isDark.value
  const colors = themeColors()
  return {
    ...baseOptions(colors),
    locale: 'de-DE',
    plugins: {
      ...baseOptions(colors).plugins,
      calendarSeparators: { indices: props.separatorIndices, color: colors.line },
      tooltip: {
        ...baseOptions(colors).plugins.tooltip,
        callbacks: {
          title: items => items[0]?.raw?.hourLabel ?? items[0]?.label ?? '',
        },
      },
    },
    onClick: (event, elements) => {
      const bar = elements.find(element => props.datasets[element.datasetIndex]?.type !== 'line')
      if (bar) emit('bar-click', bar.index)
    },
    scales: {
      x: axis(colors, { stacked: true, grid: { display: false } }),
      socTime: {
        type: 'linear', display: false, position: 'bottom',
        min: -0.5, max: props.labels.length - 0.5,
      },
      y: axis(colors, {
        stacked: true,
        suggestedMax: props.showBatteryAxis ? 1 : undefined,
        title: { display: Boolean(props.axisTitle), text: props.axisTitle, color: colors.muted },
      }),
      soc: axis(colors, {
        type: 'linear', position: 'right', display: props.showBatteryAxis,
        min: 0, max: 100, stacked: false,
        afterBuildTicks: scale => { scale.ticks = [0, 20, 40, 60, 80, 100].map(value => ({ value })) },
        grid: { drawOnChartArea: false },
        ticks: { ...axis(colors).ticks, callback: value => `${value} %` },
        title: { display: true, text: 'Batterie-Füllstand (%)', color: colors.muted },
      }),
    },
  }
})
</script>