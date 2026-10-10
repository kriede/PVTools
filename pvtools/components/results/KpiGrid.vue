<template>
  <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
    <div v-for="kpi in kpis" :key="kpi.label" class="card p-4">
      <div class="flex items-start justify-between gap-2">
        <div class="label-mono flex items-center gap-1.5">
          <component :is="kpi.icon" class="h-3.5 w-3.5 shrink-0" :class="kpi.color" />
          {{ kpi.label }}
        </div>
        <HelpToggle v-model="showHelp[kpi.label]" />
      </div>
      <div
        class="num mt-2 font-semibold tracking-tight"
        :class="kpi.value.length > 12 ? 'text-lg' : 'text-2xl sm:text-3xl'"
      >
        {{ kpi.value }}
      </div>
      <div v-if="kpi.sub" class="num mt-1 text-xs text-muted">{{ kpi.sub }}</div>
      <p v-if="showHelp[kpi.label]" class="mt-1 text-xs text-muted">{{ kpi.help }}</p>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { Gauge, Hourglass, PiggyBank, Recycle } from 'lucide-vue-next'

import { eur, num, pct, years } from '../../lib/format.js'
import HelpToggle from '../ui/HelpToggle.vue'

const props = defineProps({
  item: { type: Object, required: true },
  baseline: { type: Object, required: true },
})

const showHelp = ref({})
const delta = (value, unit) =>
  `${value >= 0 ? '+' : '−'}${num(Math.abs(value), 1)} ${unit} ggü. ohne Speicher`

const kpis = computed(() => {
  const { item, baseline } = props
  const withBattery = item.size > 1
  return [
    {
      label: 'Autarkiegrad',
      icon: Gauge,
      color: 'text-battery',
      value: pct(item.selfSufficiencyRate),
      sub: withBattery
        ? delta(item.selfSufficiencyRate - baseline.selfSufficiencyRate, 'pp')
        : null,
      help: withBattery ? 'Anteil des Verbrauchs aus PV und Speicher' : 'Anteil des Verbrauchs aus PV',
    },
    {
      label: 'Eigenverbrauch',
      icon: Recycle,
      color: 'text-pv',
      value: pct(item.selfUseRate),
      sub: withBattery
        ? delta(item.selfUseRate - baseline.selfUseRate, 'pp')
        : null,
      help: 'Anteil des PV-Stroms selbst genutzt',
    },
    {
      label: 'Ersparnis / Jahr',
      icon: PiggyBank,
      color: 'text-feedin',
      value: eur(item.costSavings),
      sub: withBattery
        ? `davon ${eur(item.costSavingsBattery)} durch den Speicher`
        : null,
      help: 'Eigenverbrauch + Einspeisung',
    },
    {
      label: 'Amortisation',
      icon: Hourglass,
      color: 'text-grid',
      value: years(item.amortization),
      sub: withBattery
        ? `Speicher allein: ${years(item.batteryAmortization)}`
        : null,
      help: 'der gesamten PV-Anlage',
    },
  ]
})
</script>
