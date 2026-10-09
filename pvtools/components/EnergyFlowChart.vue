<template>
  <section aria-label="Energieflussdiagramm" :aria-busy="busy">
    <div class="energy-toolbar">
      <h4 class="mb-0">Energiefluss</h4>
      <div class="energy-controls">
        <div class="energy-periods" role="group" aria-label="Diagrammzeitraum">
          <button v-for="period in periods" :key="period" type="button" :disabled="busy"
            :class="{ active: mode === period }"
            :aria-pressed="mode === period" @click="mode = period">{{ periodLabels[period] }}</button>
        </div>
        <button type="button" :disabled="busy || mode === 'year'"
          aria-label="Zur übergeordneten Ansicht" @click="drillOut">↑ Übersicht</button>
        <select v-if="mode === 'year'" :value="simulationYear" :disabled="busy" aria-label="Vergleichsjahr"
          @change="requestYear($event.target.value)">
          <option v-for="year in yearOptions" :key="year" :value="year">{{ year }}</option>
        </select>
        <div v-if="mode !== 'year'" class="energy-navigation">
            <button type="button" :disabled="busy || position <= 0"
              :aria-label="`Vorheriger Zeitraum: ${periodLabels[mode]}`" @click="move(-1)">‹</button>
            <input v-if="mode === 'day'" type="date" :value="selectedDate"
             :min="index.dates[0]" :max="index.dates[index.dates.length - 1]"
             :disabled="busy" aria-label="Simulationstag" @change="selectDate($event.target.value)" />
            <select v-else-if="mode === 'week'" :value="weekKey" :disabled="busy" aria-label="Kalenderwoche"
              @change="selectWeek($event.target.value)">
              <option v-for="week in weekOptions" :key="week.value" :value="week.value">{{ week.text }}</option>
            </select>
            <select v-else :value="selectedDate.slice(0, 7)" :disabled="busy" aria-label="Simulationsmonat"
              @change="selectMonth($event.target.value)">
              <option v-for="month in monthOptions" :key="month.value" :value="month.value">{{ month.text }}</option>
            </select>
            <button type="button" :disabled="busy || position >= available.length - 1"
              :aria-label="`Nächster Zeitraum: ${periodLabels[mode]}`" @click="move(1)">›</button>
        </div>
      </div>
    </div>
    <small v-if="mode === 'week'" class="block text-muted mb-2">Kalenderwochen laufen von Montag bis Sonntag. Jeder Balken entspricht einer Stunde. Leere Stunden liegen außerhalb der Simulation oder enthalten keine Daten.</small>
    <small v-if="batteryCapacity > 1" class="block text-muted mb-2">Der Batterie-Füllstand zeigt den Stand am Ende der Stunde, des Tages oder des Monats.</small>
    <BarChart :labels="buckets.map(bucket => bucket.label)" :datasets="datasets"
          :axis-title="mode === 'year' ? 'Energie (kWh pro Monat)' : mode === 'month' ? 'Energie (kWh pro Tag)' : 'Energie (kWh pro Stunde)'"
          :show-battery-axis="batteryCapacity > 1" @bar-click="drillDown" />
  </section>
</template>

<script>
import BarChart from './BarChart.vue'
import { indexEnergyFlow, chartBuckets, isoWeek } from '../functions/energyChart.js'
import { ENERGY_COLORS } from '../lib/chartTheme.js'

export default {
  name: 'EnergyFlowChart',
  components: { BarChart },
  emits: ['year-change'],
  props: {
    energyFlow: { type: Array, required: true },
    batteryCapacity: { type: Number, default: 0 },
    years: { type: Array, default: () => [] },
    busy: { type: Boolean, default: false }
  },
  data() {
    return {
      periods: ['year', 'month', 'week', 'day'], mode: 'year', selectedDate: '',
      periodLabels: { year: 'Jahr', month: 'Monat', week: 'Woche', day: 'Tag' }
    }
  },
  computed: {
    index() { return indexEnergyFlow(this.energyFlow) },
    simulationYear() { return this.index.dates.length ? Number(this.index.dates[0].slice(0, 4)) : null },
    yearOptions() { return this.years.length ? this.years : [this.simulationYear].filter(Boolean) },
    weekKey() { return this.selectedDate ? isoWeek(this.selectedDate).key : '' },
    months() { return [...new Set(this.index.dates.map(date => date.slice(0, 7)))] },
    monthOptions() {
      return this.months.map(month => ({ value: month, text: new Date(`${month}-01T00:00:00Z`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' }) }))
    },
    available() { return this.mode === 'day' ? this.index.dates : this.mode === 'month' ? this.months : this.index.weeks.map(week => week.key) },
    position() { return this.available.indexOf(this.mode === 'day' ? this.selectedDate : this.mode === 'month' ? this.selectedDate.slice(0, 7) : this.weekKey) },
    weekOptions() {
      return this.index.weeks.map(week => {
        const end = new Date(new Date(`${week.start}T00:00:00Z`).getTime() + 6 * 86400000).toISOString().slice(0, 10)
        const format = date => new Date(`${date}T00:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'UTC' })
        return { value: week.key, text: `KW ${week.key.slice(6)} / ${week.key.slice(0, 4)} · ${format(week.start)} – ${format(end)}` }
      })
    },
    buckets() { return this.selectedDate ? chartBuckets(this.index, this.mode, this.selectedDate) : [] },
    datasets() {
      const energy = [
        ['feedInEnergyGrid', 'Netzeinspeisung', ENERGY_COLORS.feedin, -1],
        ['selfUsedEnergyPV', 'PV-Eigenverbrauch', ENERGY_COLORS.pv, 1],
        ['selfUsedEnergyBattery', 'Batterie-Eigenverbrauch', ENERGY_COLORS.battery, 1],
        ['gridUsedEnergy', 'Netzbezug', ENERGY_COLORS.grid, 1]
      ].map(([field, label, backgroundColor, sign]) => ({
        label, backgroundColor, stack: 'energy', yAxisID: 'y',
        data: this.buckets.map(bucket => bucket.values ? bucket.values[field] * sign / 1000 : null)
      }))
      if (this.batteryCapacity > 1) energy.push({
        type: 'line', label: 'Batterie-Füllstand (%)', yAxisID: 'soc',
        borderColor: '#6f42c1', backgroundColor: '#6f42c1', borderWidth: 2,
        pointRadius: this.mode === 'week' ? 0 : 2, fill: false, spanGaps: false, order: -1,
        data: this.buckets.map(bucket => bucket.soc === null ? null : bucket.soc / this.batteryCapacity * 100)
      })
      return energy
    }
  },
  watch: {
    index: {
      immediate: true,
      handler(value) {
        if (!value.days[this.selectedDate]) this.selectedDate = value.dates[0] || ''
      }
    }
  },
  methods: {
    requestYear(year) {
      const requested = Number(year)
      if (!this.busy && this.yearOptions.includes(requested) && requested !== this.simulationYear) this.$emit('year-change', requested)
    },
    selectDate(date) { if (!this.busy && this.index.days[date]) this.selectedDate = date },
    selectWeek(key) {
      if (this.busy) return
      const date = this.index.dates.find(date => isoWeek(date).key === key)
      if (date) this.selectedDate = date
    },
    selectMonth(month) {
      if (this.busy) return
      const date = this.index.dates.find(date => date.startsWith(month))
      if (date) this.selectedDate = date
    },
    move(direction) {
      if (this.busy) return
      const next = this.available[this.position + direction]
      if (!next) return
      if (this.mode === 'day') this.selectDate(next)
      else if (this.mode === 'month') this.selectMonth(next)
      else this.selectWeek(next)
    },
    drillDown(position) {
      const bucket = this.buckets[position]
      if (this.busy || !bucket || !bucket.values) return
      if (this.mode === 'year') {
        this.selectMonth(bucket.month)
        this.mode = 'month'
      } else if ((this.mode === 'month' || this.mode === 'week') && this.index.days[bucket.date]) {
        this.selectedDate = bucket.date
        this.mode = this.mode === 'month' ? 'week' : 'day'
      }
    },
    drillOut() {
      if (this.busy) return
      const position = this.periods.indexOf(this.mode)
      if (position > 0) this.mode = this.periods[position - 1]
    }
  }
}
</script>

<style scoped>
.energy-toolbar, .energy-controls, .energy-navigation {
  display: flex;
  align-items: center;
  gap: .75rem;
}
.energy-toolbar { justify-content: space-between; flex-wrap: wrap; margin-bottom: 1rem; }
.energy-controls { flex-wrap: wrap; }
.energy-periods { display: flex; gap: .25rem; }
.energy-controls button, .energy-controls select, .energy-controls input {
  border: 1px solid var(--line);
  border-radius: .375rem;
  background: var(--surface);
  color: var(--ink);
  padding: .35rem .6rem;
  font-size: .875rem;
}
.energy-controls button.active { background: var(--brand); color: var(--surface); }
.energy-controls :disabled { opacity: .5; cursor: not-allowed; }
.energy-controls :focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.energy-navigation { gap: .4rem; }
.energy-navigation select { width: auto; }
.energy-navigation input { width: 10rem; }
@media (max-width: 640px) {
  .energy-controls { width: 100%; }
  .energy-navigation { width: 100%; }
  .energy-navigation select { flex: 1; min-width: 0; }
}
</style>