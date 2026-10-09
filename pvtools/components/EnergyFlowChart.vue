<template>
  <section aria-label="Energieflussdiagramm">
    <div class="energy-toolbar">
      <h4 class="mb-0">Energiefluss</h4>
      <div class="energy-controls">
        <b-button-group aria-label="Diagrammzeitraum">
          <b-button v-for="period in periods" :key="period" size="sm" :disabled="busy"
                    :variant="mode === period ? 'primary' : 'outline-primary'"
                    :aria-pressed="mode === period" @click="mode = period">{{ periodLabels[period] }}</b-button>
        </b-button-group>
        <b-button size="sm" variant="outline-secondary" :disabled="busy || mode === 'year'"
                  aria-label="Zur übergeordneten Ansicht" @click="drillOut">↑ Übersicht</b-button>
        <b-form-select v-if="mode === 'year'" :value="simulationYear" :options="yearOptions"
                       :disabled="busy" size="sm" aria-label="Vergleichsjahr"
                       @change="requestYear" />
        <div v-if="mode !== 'year'" class="energy-navigation">
          <b-button size="sm" variant="outline-secondary" :disabled="busy || position <= 0"
                    :aria-label="`Vorheriger Zeitraum: ${periodLabels[mode]}`" @click="move(-1)">‹</b-button>
          <b-form-input v-if="mode === 'day'" type="date" :value="selectedDate"
                        :min="index.dates[0]" :max="index.dates[index.dates.length - 1]"
                        :disabled="busy" size="sm" aria-label="Simulationstag" @input="selectDate" />
          <b-form-datepicker v-if="mode === 'day'" button-only :value="selectedDate" :min="index.dates[0]"
                             :max="index.dates[index.dates.length - 1]" :date-disabled-fn="dateDisabled"
                             locale="de-DE" :start-weekday="1" size="sm" aria-label="Simulationskalender öffnen"
                             :disabled="busy" v-bind="calendarLabels"
                             :date-format-options="{ year: 'numeric', month: 'short', day: 'numeric' }"
                             @input="selectDate" />
          <b-form-select v-else-if="mode === 'week'" :value="weekKey" :options="weekOptions" size="sm"
                         :disabled="busy" aria-label="Kalenderwoche" @change="selectWeek" />
          <b-form-select v-else :value="selectedDate.slice(0, 7)" :options="monthOptions" size="sm"
                         :disabled="busy" aria-label="Simulationsmonat" @change="selectMonth" />
          <b-button size="sm" variant="outline-secondary" :disabled="busy || position >= available.length - 1"
                    :aria-label="`Nächster Zeitraum: ${periodLabels[mode]}`" @click="move(1)">›</b-button>
        </div>
      </div>
    </div>
    <small v-if="mode === 'week'" class="d-block text-muted mb-2">Kalenderwochen laufen von Montag bis Sonntag. Jeder Balken entspricht einer Stunde. Leere Stunden liegen außerhalb der Simulation oder enthalten keine Daten.</small>
    <small v-if="batteryCapacity > 1" class="d-block text-muted mb-2">Der Batterie-Füllstand zeigt den Stand am Ende der Stunde, des Tages oder des Monats.</small>
    <BarChart :labels="buckets.map(bucket => bucket.label)" :datasets="datasets"
          :axis-title="mode === 'year' ? 'Energie (kWh pro Monat)' : mode === 'month' ? 'Energie (kWh pro Tag)' : 'Energie (kWh pro Stunde)'"
          :show-battery-axis="batteryCapacity > 1" @bar-click="drillDown" />
  </section>
</template>

<script>
import BarChart from './BarChart'
import { indexEnergyFlow, chartBuckets, isoWeek } from '../functions/energyChart'

export default {
  name: 'EnergyFlowChart',
  components: { BarChart },
  props: {
    energyFlow: { type: Array, required: true },
    batteryCapacity: { type: Number, default: 0 },
    years: { type: Array, default: () => [] },
    busy: { type: Boolean, default: false }
  },
  data() {
    return {
      periods: ['year', 'month', 'week', 'day'], mode: 'year', selectedDate: '',
      periodLabels: { year: 'Jahr', month: 'Monat', week: 'Woche', day: 'Tag' },
      calendarLabels: {
        labelPrevDecade: 'Vorheriges Jahrzehnt', labelPrevYear: 'Vorheriges Jahr',
        labelPrevMonth: 'Vorheriger Monat', labelCurrentMonth: 'Aktueller Monat',
        labelNextMonth: 'Nächster Monat', labelNextYear: 'Nächstes Jahr', labelNextDecade: 'Nächstes Jahrzehnt',
        labelToday: 'Heute', labelSelected: 'Ausgewähltes Datum', labelNoDateSelected: 'Kein Datum ausgewählt',
        labelCalendar: 'Kalender', labelNav: 'Kalendernavigation', labelHelp: 'Mit den Pfeiltasten im Kalender navigieren',
        labelResetButton: 'Zurücksetzen', labelCloseButton: 'Schließen', labelTodayButton: 'Heute'
      }
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
        ['feedInPowerGrid', 'Netzeinspeisung', 'orange', -1],
        ['selfUsagePowerPv', 'PV-Eigenverbrauch', 'green', 1],
        ['selfUsagePowerBattery', 'Batterie-Eigenverbrauch', 'blue', 1],
        ['consumptionGrid', 'Netzbezug', 'red', 1]
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
      if (!this.busy && Number(year) !== this.simulationYear) this.$emit('year-change', Number(year))
    },
    dateDisabled(date) { return !this.index.days[date] },
    selectDate(date) { if (this.index.days[date]) this.selectedDate = date },
    selectWeek(key) {
      const date = this.index.dates.find(date => isoWeek(date).key === key)
      if (date) this.selectedDate = date
    },
    selectMonth(month) {
      const date = this.index.dates.find(date => date.startsWith(month))
      if (date) this.selectedDate = date
    },
    move(direction) {
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
.energy-controls > .custom-select { width: auto; }
.energy-navigation { gap: .4rem; }
.energy-navigation .custom-select { width: auto; }
.energy-navigation input { width: 10rem; }
@media (max-width: 640px) {
  .energy-controls { width: 100%; }
  .energy-navigation { width: 100%; }
  .energy-navigation .custom-select { flex: 1; min-width: 0; }
}
</style>