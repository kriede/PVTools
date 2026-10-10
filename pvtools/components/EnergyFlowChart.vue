<template>
  <section aria-label="Energieflussdiagramm" :aria-busy="busy">
    <div class="energy-toolbar">
      <div class="energy-heading">
        <h4 class="mb-0">Energiefluss</h4>
        <HelpToggle v-model="showHelp" controls="energy-flow-help" />
      </div>
      <div class="energy-controls">
        <div class="energy-periods" role="group" aria-label="Diagrammzeitraum">
          <button v-for="period in periods" :key="period" type="button" :disabled="busy"
            :class="{ active: mode === period }"
            :aria-pressed="mode === period" @click="mode = period">{{ periodLabels[period] }}</button>
        </div>
        <select :value="simulationYear" :disabled="busy" aria-label="Vergleichsjahr"
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
        <select v-if="batterySizes.length" :value="batteryCapacity" :disabled="busy" aria-label="Speichergröße"
          @change="requestBattery($event.target.value)">
          <option v-for="size in batterySizes" :key="size" :value="size">{{ size > 1 ? `${size / 1000} kWh` : 'Kein Speicher' }}</option>
        </select>
      </div>
    </div>
    <p v-if="feedInDominates" role="alert" class="mb-2 text-sm text-danger">
      Die Netzeinspeisung ist mehr als hundertmal so groß wie der gesamte Verbrauch.
      Dadurch sind die Verbrauchsbalken kaum sichtbar. Bitte die Dachleistungen prüfen:
      Die Eingabe erfolgt in kWp, nicht in Wp.
    </p>
    <div v-if="showHelp" id="energy-flow-help">
      <small class="block text-muted mb-2">Netzeinspeisung wird unterhalb der Nulllinie dargestellt; PV-Eigenverbrauch, Batterie-Eigenverbrauch und Netzbezug oberhalb.</small>
      <small v-if="mode === 'week'" class="block text-muted mb-2">Kalenderwochen laufen von Montag bis Sonntag. Jeder Balken entspricht einer Stunde. Leere Stunden liegen außerhalb der Simulation oder enthalten keine Daten.</small>
      <small v-if="showBatterySoc" class="block text-muted mb-2">{{ mode === 'year' ? 'Ladezustand: monatliches Maximum und Mittelwert der Ladezustände am Ende jeder Stunde.' : 'Der Ladezustand wird für das Ende jeder Stunde dargestellt.' }}</small>
    </div>
    <BarChart :key="mode" :labels="buckets.map(bucket => bucket.label)" :datasets="datasets"
          :separator-indices="separatorIndices"
          :axis-title="mode === 'year' ? 'Energie (kWh pro Monat)' : mode === 'month' ? 'Energie (kWh pro Tag)' : 'Energie (kWh pro Stunde)'"
          :show-battery-axis="showBatterySoc" @bar-click="drillDown" />
  </section>
</template>

<script>
import BarChart from './BarChart.vue'
import HelpToggle from './ui/HelpToggle.vue'
import { indexEnergyFlow, chartBuckets, isoWeek } from '../functions/energyChart.js'
import { ENERGY_COLORS, energyBarStyle } from '../lib/chartTheme.js'

export default {
  name: 'EnergyFlowChart',
  components: { BarChart, HelpToggle },
  emits: ['year-change', 'battery-change'],
  props: {
    energyFlow: { type: Array, required: true },
    batteryCapacity: { type: Number, default: 0 },
    batterySizes: { type: Array, default: () => [] },
    years: { type: Array, default: () => [] },
    busy: { type: Boolean, default: false }
  },
  data() {
    return {
      periods: ['year', 'month', 'week', 'day'], mode: 'year', selectedDate: '', showHelp: false,
      periodLabels: { year: 'Jahr', month: 'Monat', week: 'Woche', day: 'Tag' }
    }
  },
  computed: {
    showBatterySoc() { return this.batteryCapacity > 1 },
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
        const startInYear = week.start < `${this.simulationYear}-01-01` ? `${this.simulationYear}-01-01` : week.start
        const endInYear = end > `${this.simulationYear}-12-31` ? `${this.simulationYear}-12-31` : end
        const format = date => `${date.slice(8, 10)}.${date.slice(5, 7)}.`
        return { value: week.key, text: `KW${week.key.slice(6)} ${format(startInYear)} - ${format(endInYear)}` }
      })
    },
    buckets() { return this.selectedDate ? chartBuckets(this.index, this.mode, this.selectedDate) : [] },
    separatorIndices() {
      return this.buckets.flatMap((bucket, index) => {
        if (index === 0) return []
        if (this.mode === 'week') return index % 24 === 0 ? [index] : []
        if (this.mode === 'month') return new Date(`${bucket.date}T00:00:00Z`).getUTCDay() === 1 ? [index] : []
        return []
      })
    },
    feedInDominates() {
      const total = this.buckets.reduce((sum, bucket) => {
        if (bucket.values) {
          sum.feedIn += bucket.values.feedInEnergyGrid
          sum.consumption += bucket.values.selfUsedEnergyPV + bucket.values.selfUsedEnergyBattery + bucket.values.gridUsedEnergy
        }
        return sum
      }, { feedIn: 0, consumption: 0 })
      return total.consumption > 0 && total.feedIn > total.consumption * 100
    },
    datasets() {
      const energy = [
        ['feedInEnergyGrid', 'Netzeinspeisung', ENERGY_COLORS.feedin, -1],
        ['selfUsedEnergyPV', 'PV-Eigenverbrauch', ENERGY_COLORS.pv, 1],
        ['selfUsedEnergyBattery', 'Batterie-Eigenverbrauch', ENERGY_COLORS.battery, 1],
        ['gridUsedEnergy', 'Netzbezug', ENERGY_COLORS.grid, 1]
      ].map(([field, label, backgroundColor, sign]) => ({
        label, ...energyBarStyle(backgroundColor), stack: 'energy', yAxisID: 'y',
        ...(this.mode === 'week' ? { borderWidth: 0, hoverBorderWidth: 0 } : {}),
        ...(this.mode === 'year' ? {} : {
          // Derive widths from neighboring category centers, not the hidden
          // hourly SOC axis ticks, which otherwise halve monthly bar widths.
          // Chart.js measures widths in CSS pixels, including on HiDPI screens.
          barThickness: this.mode === 'week' || this.mode === 'month'
            ? ({ chart }) => {
              const spacing = Math.abs(chart.scales.x.getPixelForValue(1) - chart.scales.x.getPixelForValue(0))
              return this.mode === 'week' ? Math.max(0, spacing - 1) : spacing / 1.15
            }
            : 'flex',
          categoryPercentage: 1,
          barPercentage: this.mode === 'week' ? 1 : this.mode === 'month' ? 1 / 1.15 : 0.8,
          // SOC lines are not an additional bar group. Center each day on its tick.
          ...(this.mode === 'month' ? { grouped: false } : {}),
        }),
        data: this.buckets.map(bucket => bucket.values ? bucket.values[field] * sign / 1000 : null)
      }))
      if (this.showBatterySoc) {
        const line = (label, color, data, extra = {}) => ({
          type: 'line', label, yAxisID: 'soc',
          borderColor: color, backgroundColor: color, borderWidth: 2,
          pointRadius: this.mode === 'year' || this.mode === 'day' ? 2 : 0,
          fill: false, spanGaps: false, order: -1, data, ...extra,
        })
        const percent = value => value == null ? null : value / this.batteryCapacity * 100
        if (this.mode === 'year') {
          energy.push(
            line('Maximaler Ladezustand (%)', ENERGY_COLORS.batteryCharge, this.buckets.map(bucket => percent(bucket.socMax))),
            line('Mittlerer Ladezustand (%)', ENERGY_COLORS.batteryCharge, this.buckets.map(bucket => percent(bucket.socAverage)), { borderDash: [5, 3] }),
          )
        } else if (this.mode === 'month') {
          // Day bars use category centers 0..N-1; place each hourly state within
          // its day's width using a separate, identically bounded linear axis.
          const data = this.buckets.flatMap((bucket, day) =>
            chartBuckets(this.index, 'day', bucket.date).map((hour, position) => ({
              x: day - 0.5 + (position + 0.5) / 24,
              y: percent(hour.soc),
              hourLabel: `${bucket.date} ${hour.label}`,
            })))
          energy.push(line('Ladezustand (%)', ENERGY_COLORS.batteryCharge, data, { xAxisID: 'socTime' }))
        } else {
          energy.push(line('Ladezustand (%)', ENERGY_COLORS.batteryCharge, this.buckets.map(bucket => percent(bucket.soc))))
        }
      }
      return energy
    }
  },
  watch: {
    index: {
      immediate: true,
      handler(value) {
        if (!value.days[this.selectedDate]) {
          const year = value.dates[0]?.slice(0, 4)
          const matchingDate = year && this.selectedDate ? `${year}${this.selectedDate.slice(4)}` : ''
          // A leap day maps to February 28 in a non-leap year.
          const fallbackDate = matchingDate.endsWith('-02-29') ? `${year}-02-28` : ''
          this.selectedDate = value.days[matchingDate] ? matchingDate
            : value.days[fallbackDate] ? fallbackDate : value.dates[0] || ''
        }
      }
    }
  },
  methods: {
    requestBattery(size) {
      const requested = Number(size)
      if (!this.busy && this.batterySizes.includes(requested)) this.$emit('battery-change', requested)
    },
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
.energy-toolbar { flex-direction: column; align-items: flex-start; margin-bottom: 1rem; }
.energy-heading { display: flex; align-items: center; justify-content: space-between; width: 100%; gap: .75rem; }
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