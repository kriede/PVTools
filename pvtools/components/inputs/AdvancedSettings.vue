<template>
  <details id="expert-settings" class="card group">
    <summary
      class="flex cursor-pointer list-none items-center gap-3 p-4 select-none sm:px-5"
    >
      <Settings2 class="h-4 w-4 text-brand" />
      <span class="font-display text-base font-semibold">
        Experten-Einstellungen
      </span>
      <span class="ml-auto"></span>
      <ChevronDown
        class="h-4 w-4 text-muted transition group-open:rotate-180"
      />
    </summary>

    <div class="space-y-5 border-t border-line p-4 sm:p-5">
      <div>
        <div class="mb-2 text-xs font-medium text-muted">
          Zu vergleichende Speichergrößen
        </div>
        <p
          v-if="input.batteryPriceMode === 'offers'"
          class="font-mono text-xs text-muted"
        >
          Es werden die Größen deiner Angebote verglichen (Kosten &amp; Tarife).
        </p>
        <div v-else class="flex flex-wrap gap-1.5">
          <span
            v-for="size in batterySizes"
            :key="size"
            class="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 py-0.5 pr-1 pl-2 font-mono text-xs"
          >
            {{ batteryLabel(size) }}
            <button
              type="button"
              class="rounded p-0.5 text-muted hover:text-danger"
              :title="`${batteryLabel(size)} entfernen`"
              @click="removeSize(size)"
            >
              <X class="h-3 w-3" />
            </button>
          </span>
        </div>
        <form
          v-if="input.batteryPriceMode !== 'offers'"
          class="mt-2 flex gap-2"
          @submit.prevent="addSize"
        >
          <input
            v-model.number="newSize"
            class="input"
            type="number"
            min="0.2"
            max="10000"
            step="0.1"
            placeholder="Größe in kWh"
          />
          <button type="submit" class="btn-ghost" :disabled="!validNewSize">
            <Plus class="h-4 w-4" />
          </button>
        </form>
      </div>

      <div>
        <NumberField
          v-model="input.batteryLifetime"
          label="Lebensdauer Speicher"
          unit="Jahre"
          :min="1"
          :max="40"
          expandable-hint
          hint="Bestimmt, ab wann sich ein Speicher oder eine Erweiterung lohnt"
        >
        <template #help>
          Bestimmt, ab wann sich ein Speicher oder eine Erweiterung lohnt.
          Bewertung: lohnt sich bei Amortisation bis
          {{ num(ratingLimits(input.batteryLifetime).yes, 1) }} Jahre, Grenzfall
          bis {{ num(input.batteryLifetime) }} Jahre, sonst nicht.
        </template>
        </NumberField>
      </div>

      <div class="space-y-3">
        <div class="flex items-center gap-2 text-sm font-medium">
        <label class="flex items-center gap-2">
          <input v-model="input.gridFriendlyChargingEnabled" type="checkbox" />
          Netzdienliches Laden
        </label>
        <InfoHelp v-model="helpVisible.grid" label="Netzdienliches Laden" :hint="gridHint" :controls="`${helpId}-grid`" />
        </div>
        <p v-if="helpVisible.grid" :id="`${helpId}-grid`" class="text-xs text-muted">{{ gridHint }}</p>
        <div v-if="input.gridFriendlyChargingEnabled" class="space-y-3">
          <NumberField v-model="input.gridFriendlyPriceThreshold" label="Überschusssignal bei Preis bis" unit="EUR/MWh" :step="1" expandable-hint :hint="priceHint">
          <template #help>
            Jahrespreise werden bei der Berechnung automatisch geladen und lokal im Browser gespeichert.
            Quelle: <a href="https://energy-charts.info" target="_blank" rel="noopener noreferrer" class="underline">Energy-Charts / Fraunhofer ISE</a>,
            Bundesnetzagentur / SMARD, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" class="underline">CC BY 4.0</a>.
            Gebotszone DE-LU; ältere oder unvollständige Anbieterjahre benötigen einen CSV-Import.
            Folgeabrufe verwenden den Jahrescache. Ohne vollständige Daten wird nicht simuliert.
          </template>
          </NumberField>
          <button type="button" class="btn-ghost" :disabled="priceLoading || status !== 'idle'" @click="reloadPrices">
            {{ priceLoading ? 'Preise werden geladen …' : 'Preise neu laden (statt CSV)' }}
          </button>
          <p v-if="!input.gridFriendlyPrices && priceInfo?.year === Number(input.year)" class="text-xs text-muted">
            {{ Object.keys(priceInfo.prices).length }} Stunden für {{ priceInfo.year }} geladen.
            Abruf: {{ new Date(priceInfo.fetchedAt).toLocaleString('de-DE') }}.
          </p>
          <div>
            <div class="flex items-center gap-1 text-xs font-medium">
              <label :for="`${helpId}-csv-input`">Alternativ: eigene Day-Ahead-Preise für das Vergleichsjahr (CSV)</label>
              <InfoHelp v-model="helpVisible.csv" label="Day-Ahead-Preise (CSV)" :hint="csvHint" :controls="`${helpId}-csv`" />
            </div>
            <input :id="`${helpId}-csv-input`" type="file" accept=".csv,text/csv" class="input mt-1" @change="loadPrices" />
            <p v-if="helpVisible.csv" :id="`${helpId}-csv`" class="mt-1.5 text-xs text-muted">{{ csvHint }}</p>
          </div>
          <p v-if="priceError" role="alert" class="text-xs text-danger">{{ priceError }}</p>
          <p v-if="input.gridFriendlyPrices" class="text-xs text-muted">
            {{ Object.keys(input.gridFriendlyPrices).length }} Preisstunden geladen
            ({{ Object.keys(input.gridFriendlyPrices)[0]?.slice(0, 4) }}).
          </p>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <NumberField
          v-model="input.systemloss"
          label="Systemverluste PV"
          unit="%"
          :min="0"
          :max="100"
          hint="Pauschale Verluste (Kabel, Verschmutzung, …), von PVGIS berücksichtigt"
          expandable-hint
        />
        <NumberField
          v-model="input.batterySocMinPercent"
          label="Min. Ladezustand"
          unit="%"
          :min="0"
          :max="100"
          hint="Der Speicher wird nicht tiefer entladen"
          expandable-hint
        />
        <NumberField
          v-model="input.batteryLoadEfficiency"
          label="Ladeeffizienz"
          hint="Anteil der Ladeenergie, der im Speicher verbleibt. Der Rest geht beim Laden verloren."
          expandable-hint
          unit="%"
          :min="1"
          :max="100"
        />
        <NumberField
          v-model="input.batterySocInitialPercent"
          label="Anfänglicher Ladezustand"
          unit="%"
          :min="0"
          :max="100"
          hint="Ladezustand zu Jahresbeginn, mindestens auf Höhe des minimalen Ladezustands. Die anfängliche Energie wird als vorhanden angenommen und kann die Ersparnis im ersten Jahr beeinflussen."
          expandable-hint
        />
        <NumberField
          v-model="input.batteryUnloadEfficiency"
          label="Entladeeffizienz"
          hint="Anteil der entnommenen Speicherenergie, der den Verbrauchern zur Verfügung steht. Der Rest geht beim Entladen verloren."
          expandable-hint
          unit="%"
          :min="1"
          :max="100"
        />
        <NumberField
          v-model="input.batteryChargeCRate"
          preserve-precision
          label="Max. Ladeleistung"
          unit="C"
          :min="0"
          step="any"
          hint="Maximale Ladeleistung bezogen auf die Nennkapazität des jeweiligen Speichers. 1 C entspricht bei 10 kWh einer Leistung von 10 kW, 0,5 C entspricht 5 kW und 2 C entspricht 20 kW. Der Wert muss größer als 0 sein; Werte unter und über 1 sind zulässig. Standard: 1 C."
          expandable-hint
        />
        <NumberField
          v-model="input.batteryDischargeCRate"
          preserve-precision
          label="Max. Entladeleistung"
          unit="C"
          :min="0"
          step="any"
          hint="Maximale Entladeleistung bezogen auf die Nennkapazität des jeweiligen Speichers. 1 C entspricht bei 10 kWh einer Leistung von 10 kW, 0,5 C entspricht 5 kW und 2 C entspricht 20 kW. Der Wert muss größer als 0 sein; Werte unter und über 1 sind zulässig. Standard: 1 C."
          expandable-hint
        />
      </div>

      <div>
        <div class="block">
          <span
            class="mb-1 flex items-center gap-1 text-xs font-medium text-muted"
          >
            <label :for="`${helpId}-model-input`">Rechenmodell</label>
            <InfoHelp v-model="helpVisible.model" label="Rechenmodell" :hint="getHourModel(input.hourModel).description" :controls="`${helpId}-model`" />
          </span>
          <select :id="`${helpId}-model-input`" v-model="input.hourModel" class="input font-sans">
            <option
              v-for="model in HOUR_MODELS"
              :key="model.id"
              :value="model.id"
            >
              {{ model.label }}
            </option>
          </select>
        </div>
        <p v-if="helpVisible.model" :id="`${helpId}-model`" class="mt-1.5 text-xs text-muted">
          {{ getHourModel(input.hourModel).description }}
        </p>
      </div>

      <div class="space-y-3">
        <div class="text-xs font-medium text-muted">Erzeugtes Haushaltslastprofil</div>
        <div class="grid grid-cols-2 gap-3">
          <NumberField
            v-model="householdBaseloadW"
            label="Grundlast"
            :hint="baseloadHint"
            expandable-hint
            unit="W"
            :min="0"
            :step="10"
            :disabled="consumptionMode === 'csv'"
          />
          <NumberField
            v-model="input.householdSigma"
            label="Sigma"
            :hint="sigmaHint"
            expandable-hint
            :min="0"
            :max="5"
            :step="0.1"
            :disabled="consumptionMode === 'csv' || getHourModel(input.hourModel).consumptionProfile !== 'h0Calibrated'"
          />
        </div>
      </div>

      <div id="inverter-settings" class="scroll-mt-24">
        <div
          class="mb-2 flex items-center gap-1 text-xs font-medium text-muted"
        >
          Wechselrichter (AC-Leistung)
          <InfoHelp v-model="helpVisible.inverter" label="Wechselrichter (AC-Leistung)" :hint="inverterHint" :controls="`${helpId}-inverter`" />
        </div>
        <SegmentedControl
          v-model="input.inverterMode"
          :options="[
            { value: 'auto', label: 'wie PV' },
            { value: 'manual', label: 'eigener Wert' },
            { value: 'none', label: 'keine Grenze' },
          ]"
        />
        <NumberField
          v-if="input.inverterMode === 'manual'"
          v-model="input.maxPowerGenerationInverter"
          class="mt-2"
          label="Maximale AC-Leistung"
          :hint="inverterHint"
          expandable-hint
          unit="W"
          :min="100"
          :step="100"
        />
        <p v-else-if="input.inverterMode === 'auto'" class="mt-2 font-mono text-xs text-muted">
          {{
            input.inverterMode === 'auto'
              ? `= installierte PV-Leistung (${num(limits.inverterPower)} W)`
              : 'keine Begrenzung, fester Wirkungsgrad'
          }}
        </p>
        <p v-if="helpVisible.inverter" :id="`${helpId}-inverter`" class="mt-1.5 text-xs text-muted">{{ inverterHint }}<span v-if="input.inverterMode === 'none'"> Keine Begrenzung, fester Wirkungsgrad.</span></p>
      </div>

      <div>
        <div
          class="mb-2 flex items-center gap-1 text-xs font-medium text-muted"
        >
          Einspeisebegrenzung
          <InfoHelp v-model="helpVisible.feedIn" label="Einspeisebegrenzung" :hint="feedInHint" :controls="`${helpId}-feed-in`" />
        </div>
        <SegmentedControl
          v-model="input.feedInMode"
          :options="[
            { value: 'none', label: 'keine' },
            { value: 'watt', label: 'Watt' },
            { value: 'percent', label: '% PV' },
            { value: 'zero', label: 'Null' },
          ]"
        />
        <NumberField
          v-if="input.feedInMode === 'watt'"
          v-model="input.maxPowerFeedIn"
          class="mt-2"
          label="Maximale Einspeisung"
          unit="W"
          :min="0"
          :step="100"
          hint="z.B. 800 W für ein Balkonkraftwerk"
          expandable-hint
        />
        <NumberField
          v-else-if="input.feedInMode === 'percent'"
          v-model="input.feedInPercent"
          class="mt-2"
          label="Anteil der PV-Leistung"
          unit="%"
          :min="0"
          :max="100"
          hint="z.B. 60 % (Solarspitzengesetz) oder 70 %"
          expandable-hint
        />
        <p
          v-if="input.feedInMode === 'percent'"
          class="mt-2 font-mono text-xs text-muted"
        >
          = {{ num(limits.feedInLimit) }} W
        </p>
        <p v-if="helpVisible.feedIn" :id="`${helpId}-feed-in`" class="mt-1.5 text-xs text-muted">{{ feedInHint }}</p>
      </div>

      <button
        type="button"
        class="btn-ghost w-full text-danger"
        @click="confirmReset"
      >
        <RotateCcw class="h-4 w-4" />
        Alle Eingaben zurücksetzen
      </button>
    </div>
  </details>
</template>

<script setup>
import { computed, ref, useId } from 'vue'
import {
  ChevronDown,
  Plus,
  RotateCcw,
  Settings2,
  X,
} from 'lucide-vue-next'

import { useCalculator } from '../../composables/useCalculator.js'
import { ratingLimits } from '../../functions/batteryEconomics.js'
import { importDayAheadPrices } from '../../functions/priceImport.js'
import { getHourModel, HOUR_MODELS } from '../../functions/hourModels/index.js'
import { batteryLabel, num } from '../../lib/format.js'
import InfoHelp from '../ui/InfoHelp.vue'
import NumberField from '../ui/NumberField.vue'
import SegmentedControl from '../ui/SegmentedControl.vue'

const { input, householdBaseloadW, consumptionMode, batterySizes, limits, reset, status, priceInfo, priceLoading, refreshPrices } = useCalculator()
const helpId = useId()
const helpVisible = ref({})
const gridHint = 'Die Steuerung kennt Preise und PV-/Verbrauchsprognosen für maximal 24 Stunden im Voraus. Sie hält vor günstigen Stunden Speicherplatz frei und lädt dann bevorzugt PV-Überschüsse. Niedrige Preise sind nur eine Näherung für Netzüberschuss, kein Nachweis lokaler Netzüberlastung. Keine Netzladung; Tarif und Einspeisevergütung bleiben unverändert. Prognosen werden ideal angenommen.'
const priceHint = 'Jahrespreise werden bei der Berechnung automatisch geladen und lokal im Browser gespeichert. Quelle: Energy-Charts / Fraunhofer ISE, Bundesnetzagentur / SMARD, CC BY 4.0. Gebotszone DE-LU; ältere oder unvollständige Anbieterjahre benötigen einen CSV-Import. Folgeabrufe verwenden den Jahrescache. Ohne vollständige Daten wird nicht simuliert.'
const csvHint = 'Spalten: dayTime,price — z.B. 20230101:00,-10. Preis in EUR/MWh; jede lokale Stunde einmal, einschließlich 29. Februar in Schaltjahren. Sommerzeit: fehlende Stunde interpolieren, doppelte Stunde mitteln. Keine UTC-Zeitstempel. Beim Wechsel des Vergleichsjahres neu importieren.'
const baseloadHint = 'Die dauerhaft anliegende Haushaltsleistung, beispielsweise durch Router, Kühlgeräte und Geräte im Bereitschaftsbetrieb. 500 W entsprechen mindestens 0,5 kWh Verbrauch pro Stunde. Der Standard beträgt ein Viertel der durchschnittlichen Haushaltsleistung: Jahresverbrauch in kWh × 1000 / 365 / 24 / 4. Bei 6.000 kWh sind das etwa 171 W. Er folgt dem Jahresverbrauch, bis du die Grundlast manuell änderst. Zusätzliche Verbraucher aus custom-consumption.yaml, PKW und Wärmepumpen sind nicht enthalten. Die Grundlast ist bereits im Jahres- oder Monatsverbrauch enthalten und wird nicht zusätzlich addiert. Nur die verbleibende Energie wird nach dem Lastprofil verteilt. Bei Monatswerten muss jeder Monatsverbrauch ausreichen, um die Grundlast abzudecken. Die Untergrenze gilt für Stundenwerte, nicht für die Verteilung innerhalb einer Stunde. Importierte Messwerte bleiben unverändert.'
const sigmaHint = 'Bestimmt die Stärke der stündlichen Zufallsschwankungen im kalibrierten H0-Profil. 0 ergibt glattes H0 ohne zusätzliche Zufallsschwankungen, 1 ist der Standard. Höhere Werte erzeugen stärkere Spitzen und ausgeprägtere Phasen mit niedrigem Verbrauch; möglich sind Werte von 0 bis 5. Die Grundlast bleibt davon unberührt. Der feste Startwert des Zufallsgenerators und die zeitliche Korrelation bleiben unverändert: Gleiche Eingaben liefern denselben Verlauf. Sigma wird nur beim kalibrierten H0-Profil verwendet. Importierte Messwerte und zusätzliche Verbraucher bleiben unverändert.'
const inverterHint = 'Begrenzt die PV-Leistung und bestimmt den Wirkungsgrad des Wechselrichters bei Teillast.'
const feedInHint = 'Nicht eingespeiste Energie wird als Abregelung in den Details angezeigt. Bei Nulleinspeisung wird Überschuss nur gespeichert oder abgeregelt.'

const priceError = ref('')
const reloadPrices = async () => {
  priceError.value = ''
  try { await refreshPrices() } catch (error) { priceError.value = error.message }
}
const loadPrices = async (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  priceError.value = ''
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('Preisdatei darf höchstens 2 MB groß sein.')
    const imported = importDayAheadPrices(await file.text())
    if (imported.year !== Number(input.year)) throw new Error(`Preisjahr ${imported.year} stimmt nicht mit dem Vergleichsjahr ${input.year} überein.`)
    input.gridFriendlyPrices = imported.prices
  } catch (error) {
    priceError.value = error.message
  } finally {
    event.target.value = ''
  }
}

const newSize = ref(null)
const validNewSize = computed(
  () => Number.isFinite(newSize.value) && newSize.value >= 0.2 && newSize.value <= 10000,
)

const addSize = () => {
  if (!validNewSize.value) return
  const wh = Math.round(newSize.value * 1000)
  if (!batterySizes.value.includes(wh)) {
    batterySizes.value = [...batterySizes.value, wh].sort((a, b) => a - b)
  }
  newSize.value = null
}

const removeSize = (size) => {
  batterySizes.value = batterySizes.value.filter((s) => s !== size)
}

const confirmReset = () => {
  if (window.confirm('Alle Eingaben löschen und neu starten?')) reset()
}
</script>
