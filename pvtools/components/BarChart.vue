<template>
  <div :class="cssClasses" :style="[{ height: `${height}px` }, styles]">
    <Bar
      :key="isDark"
      :id="chartId"
      :data="chartData"
      :options="chartOptions"
      :dataset-id-key="datasetIdKey"
      :plugins="plugins"
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
})
const emit = defineEmits(['bar-click'])
const { isDark } = useTheme()
const chartData = computed(() => ({ labels: props.labels, datasets: props.datasets }))
const chartOptions = computed(() => {
  void isDark.value
  const colors = themeColors()
  return {
    ...baseOptions(colors),
    locale: 'de-DE',
    onClick: (event, elements) => {
      const bar = elements.find(element => props.datasets[element.datasetIndex]?.type !== 'line')
      if (bar) emit('bar-click', bar.index)
    },
    scales: {
      x: axis(colors, { stacked: true, grid: { display: false } }),
      y: axis(colors, {
        stacked: true,
        title: { display: Boolean(props.axisTitle), text: props.axisTitle, color: colors.muted },
      }),
      soc: axis(colors, {
        type: 'linear', position: 'right', display: props.showBatteryAxis,
        min: 0, max: 100, stacked: false,
        grid: { drawOnChartArea: false },
        ticks: { ...axis(colors).ticks, callback: value => `${value} %` },
        title: { display: true, text: 'Batterie-Füllstand (%)', color: colors.muted },
      }),
    },
  }
})
</script>