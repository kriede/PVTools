<template>
  <b-container fluid>
    <b-row>
      <b-col>
        <h1>PVTools</h1>
      </b-col>
      <b-col>
        <iframe frameborder="0" scrolling="no" marginheight="0" marginwidth="0" width="200" height="100"
          type="text/html" title="Video-Anleitung zu PVTools"
          src="https://www.youtube.com/embed/FKSDynkXchY?autoplay=0&fs=1&iv_load_policy=3&showinfo=0&rel=0&cc_load_policy=0&start=0&end=0"></iframe>
      </b-col>
      <b-col align-v="baseline" cols="auto">
        <form action="https://www.paypal.me/akkudoktor" method="post" target="_blank" class="paypal">
          <input type="hidden" name="hosted_button_id" value="RTXEPF475DBVA" />
          <input type="image" src="/btn_support_LG.gif" border="0" name="submit" title="Unterstütze unsere Arbeit!"
            alt="Spenden mit dem PayPal-Button" />
          <!-- <img alt="" border="0" src="https://www.paypal.com/de_DE/i/scr/pixel.gif" width="1" height="1" /> -->
        </form>
        <p>Nutze als Grund: "PV-Tool"</p>
      </b-col>
    </b-row>
    <b-row>
      <b-col>
        <b-button v-b-toggle.inputCollapse>Daten eingeben</b-button>
      </b-col>
    </b-row>

    <b-row cols="1" cols-md="2">
      <b-col>
        <b-collapse id="inputCollapse" visible>
          <b-form>
            <b-form-group label="Adresse:">
              <b-input-group append="Straße, PLZ Stadt">
                <b-form-input v-model="inputAddressSearchString"
                  placeholder="z.B. 50667 Köln" v-b-tooltip.hover
                  title="Gib eine Adresse ein und klicke anschließend auf die Suche."
                  @keydown.enter.prevent="getCoordinatesByAddress" />
                </b-input-group>
                <b-input-group-append>
                  <b-button variant="info" :disabled="isSearchingAddress" @click="getCoordinatesByAddress">
                    {{ isSearchingAddress ? 'Suche läuft…' : 'Suche nach Adresse' }}
                  </b-button>
                </b-input-group-append>
            </b-form-group>

            <b-alert v-if="addressSearchError" variant="danger" show>
              {{ addressSearchError }}
            </b-alert>
            <b-form-group label="Koordinaten:" v-if="adressData.lon && adressData.lat">
              <b-input-group>
                <b-form-input readonly v-model="adressData.lat" />
                <b-form-input readonly v-model="adressData.lon" />
              </b-input-group>

            </b-form-group>
            <b-alert v-else-if="adressData == 'no_address'" variant="danger" show>
              Die eingegebene Adresse konnte nicht gefunden werden. Bitte versuche es erneut.
            </b-alert>
            <b-form-group label="Jährlicher Stromverbrauch:">
              <b-input-group append="kWh">
                <b-input v-model.number="input.yearlyConsumption" min="0" type="number" step="100"/>
              </b-input-group>
            </b-form-group>
            <b-form-group label="Stromkosten:">
              <b-input-group append="€ / kWh">
                <b-input v-model.number="input.consumptionCosts" type="number" min="0" step="0.01" />
              </b-input-group>
            </b-form-group>
            <b-form-group label="Einspeisevergütung:">
              <b-input-group append="€ / kWh">
                <b-input v-model.number="input.feedInCompensation" min="0" type="number" step="0.001" />
              </b-input-group>
            </b-form-group>
            <b-form-group label="Installationskosten ohne Akku:">
              <b-input-group append="€">
                <b-input v-model.number="input.installationCostsWithoutBattery" min="0" type="number" step="100" />
              </b-input-group>
            </b-form-group>
            <b-form-group label="Speicherkosten pro kWh:">
              <b-input-group append="€">
                <b-input v-model.number="input.batteryCostsPerKwh" min="0" type="number" step="100" />
              </b-input-group>
            </b-form-group> 
          </b-form>
        </b-collapse>
      </b-col>

      <b-col>
        <b-collapse id="inputCollapse" visible>
          <b-form @submit="addRoof" @submit.stop.prevent >
            <b-card bg-variant="light">
              <b-form-group label="Ausrichtung:">
                <b-input-group append="° Grad Azimut">
                  <b-form-input v-model.number="roofInput.aspect" type="number" min="-180" max="180" required v-b-tooltip.hover
                    title="0 = Süden, 90 = Westen, -90 = Osten" />
                </b-input-group>
              </b-form-group>
              <b-form-group label="Neigung:">
                <b-input-group append="° Grad">
                  <b-form-input v-model.number="roofInput.angle" type="number" min="0" max="90" required v-b-tooltip.hover
                    title="0 = waagerecht, 90 = senkrecht" />
                </b-input-group>
              </b-form-group>
              <b-form-group label="Installierte Leistung">
                <b-input-group append="Wp">
                  <b-input v-model.number="roofInput.peakpower" min="1" type="number" step="1" required v-b-tooltip.hover
                    title='Bei 10kWp muss "10000" eingetragen werden' />
                </b-input-group>
              </b-form-group>

              <b-button-group>
                <b-button type="submit">
                  Ausrichtung zur Berechnung hinzufügen
                </b-button>
              </b-button-group>
            </b-card>
          </b-form>
          <b-list-group class="mt-3">
            <div v-for="roof in input.roofs" :key="roof.aspect + roof.angle + roof.peakpower">
              <b-list-group-item button :v-b-toggle="'roof' + roof.aspect + roof.angle + roof.peakpower">
                Ausrichtung {{ roof.aspect }}° - Neigung: {{ roof.angle }}° - {{ roof.peakpower }} Wp
                <b-button-group>
                  <b-button variant="primary" aria-label="Ausrichtung bearbeiten"
                    @click="roofInput.aspect = roof.aspect
                                          roofInput.angle = roof.angle
                    roofInput.peakpower = roof.peakpower
                    input.roofs = input.roofs.filter(roofEntry => !(roof.aspect == roofEntry.aspect && roof.angle == roofEntry.angle && roof.peakpower == roofEntry.peakpower)) ">
                    <font-awesome-icon icon="pen" />
                  </b-button>
                  <b-button variant="danger" aria-label="Ausrichtung entfernen"
                    @click="input.roofs = input.roofs.filter(roofEntry => !(roof.aspect == roofEntry.aspect && roof.angle == roofEntry.angle && roof.peakpower == roofEntry.peakpower))">
                    <font-awesome-icon icon="trash" />
                  </b-button>
                </b-button-group>
              </b-list-group-item>
              <!-- <b-collapse
                :id="'roof' + roof.aspect + roof.angle + roof.peakpower"
                accordion="roofs"
                visible
              >
                {{'roof' + roof.aspect + roof.angle + roof.peakpower}}
              </b-collapse> -->
            </div>
          </b-list-group>

            <b-button-group class="mt-3">
              <b-button variant="primary" @click="generateData"
                :disabled="isCalculating || isSearchingAddress || !adressData.lat || !adressData.lon || input.roofs.length == 0"
                :title="(!adressData.lat || !adressData.lon) || input.roofs.length == 0 ? 'Füge eine Adresse und mindestens eine PV Ausrichtung hinzu' : ''"
                v-b-toggle.inputCollapse>
                Berechnen
              </b-button>
              <b-button variant="danger" @click="resetValues">
                Zurücksetzen
              </b-button>
              <b-button v-b-toggle.extensionsCollapse>Erweiterte Einstellungen</b-button>
            </b-button-group>

          <b-alert v-if="calculationError" variant="danger" show class="mt-3">
            {{ calculationError }}
          </b-alert>
          <b-collapse id="extensionsCollapse">
            <b-form-group label="Speichergrößen:">
              <b-input-group append="Wh">
                <b-form-tags input-id="tags-basic" v-model="inputBatterySizes" :tag-validator="tagValidator"
                  v-b-tooltip.hover title='Zwischen 0,2 und 200 kWh'
                  placeholder="Speichergröße hinzufügen …" add-button-text="Hinzufügen"
                  tag-remove-label="Speichergröße entfernen" tag-removed-label="Speichergröße entfernt"
                  invalid-tag-text="Ungültige Speichergröße(n)" duplicate-tag-text="Doppelte Speichergröße(n)"
                  limit-tags-text="Maximale Anzahl an Speichergrößen erreicht"
                  :input-attrs="{ 'aria-label': 'Speichergrößen in Wh' }"></b-form-tags>
              </b-input-group>
            </b-form-group>
            <b-form-group label="Speicherkosten einmalig:">
              <b-input-group append="€">
                <b-input v-model.number="input.batteryCostsFixed" min="0" type="number" step="100" />
              </b-input-group>
            </b-form-group>
            <b-form-group label="Vergleichsjahr:">
              <b-form-select v-model="input.year" :options="years" :disabled="isCalculating"></b-form-select>
            </b-form-group>
            <b-form-group label="Systemverluste PV:">
              <b-input-group append="%">
                <b-form-input v-model.number="input.systemloss" type="number" min="0" max="100" />
              </b-input-group>
            </b-form-group>
            <b-form-group label="Minimaler Ladezustand Speicher:">
              <b-input-group append="%">
                <b-form-input v-model.number="input.batterySocMinPercent" type="number" min="0" max="100" />
              </b-input-group>
            </b-form-group>
            <b-form-group label="Speichereffizienz (Laden / Entladen):">
              <b-input-group append="%">
                <b-form-input v-model.number="input.batteryLoadEfficiency" type="number" min="0" max="100" />
                <b-form-input v-model.number="input.batteryUnloadEfficiency" type="number" min="0" max="100" />
              </b-input-group>
            </b-form-group>
            <b-form-group label="Maximalleistung Wechselrichter (0 = keine Prüfung):">
              <b-input-group append="W">
                <b-form-input v-model.number="input.maxPowerGenerationInverter" type="number" min="0" max="100000" />
              </b-input-group>
            </b-form-group>
            <b-form-group label="Maximale Ladeleistung Speicher (0 = keine Prüfung):">
              <b-input-group append="W">
                <b-form-input v-model.number="input.maxPowerLoadBattery" type="number" min="0" max="100000" />
              </b-input-group>
            </b-form-group>
            <b-form-group label="Maximale Entladeleistung Speicher (0 = keine Prüfung):">
              <b-input-group append="W">
                <b-form-input v-model.number="input.maxPowerGenerationBattery" type="number" min="0" max="100000" />
              </b-input-group>
            </b-form-group>
            <b-form-group label="Maximale Netzeinspeisung z.B. für 70% Regel (0 = keine Prüfung):">
              <b-input-group append="W">
                <b-form-input v-model.number="input.maxPowerFeedIn" type="number" min="0" max="100000" />
              </b-input-group>
            </b-form-group>
            <!-- <b-form-group label="Lineare Degradation der PV-Module pro Jahr:">
              <b-input-group append="%">
                <b-form-input v-model.number="input.linearDegrationModules" type="number" min="0" max="10" />
              </b-input-group>
            </b-form-group>
            <b-form-group label="Lineare Veränderung des Strombedarfs pro Jahr (auch negativ erlaubt z.B. -1%):">
              <b-input-group append="%">
                <b-form-input v-model.number="input.linearConsumptionChange" type="number" min="-20" max="20" />
              </b-input-group>
            </b-form-group>
            <b-form-group label="Lineare Veränderung des Strompreises pro Jahr (auch negativ erlaubt z.B. -1%):">
              <b-input-group append="%">
                <b-form-input v-model.number="input.linearConsumptionCostsChange" type="number" min="-20" max="20" />
              </b-input-group>
            </b-form-group>
            <b-form-group label="Lineare Veränderung der Eigenverbrauchsrate pro Jahr (auch negativ erlaubt z.B. -1%):">
              <b-input-group append="%">
                <b-form-input v-model.number="input.linearSelfUseRateChange" type="number" min="-10" max="10" />
              </b-input-group>
            </b-form-group> -->

          </b-collapse>
        </b-collapse>
      </b-col>
    </b-row>
    <b-overlay :show="isCalculating" rounded="sm" :aria-busy="isCalculating ? 'true' : 'false'">
      <template #overlay>
        <b-spinner label="Berechnung läuft …" />
      </template>
      <b-row>
        <b-col>
          <div id="chartContainer">
            <Chart id="chart" v-if="displayData.length > 0" :labels="displayData.map(item => item.size)"
              :datasets="[
                { data: displayData.map(item => item.selfUseRate), yAxisID: 'y1', label: 'Eigenverbrauchsquote', borderColor: 'blue' },
                { data: displayData.map(item => item.selfSufficiencyRate), yAxisID: 'y1', label: 'Autarkiegrad', borderColor: 'green' },
                { data: displayData.map(item => item.amortization), yAxisID: 'y2', label: 'Amortisation', borderColor: 'red', }
                ]" />
          </div>


        </b-col>
      </b-row>

      <b-table
        v-if="displayData.length > 0"
        striped hover
        :items="displayData"
        :fields="tableFields"
        small
        responsive="sm"
      >
        <template #cell(show_details)="row">
          <b-button size="sm" @click="row.toggleDetails" >
            Details
            <font-awesome-icon v-if="row.detailsShowing" icon="fa-square-caret-up" />
            <font-awesome-icon v-if="!row.detailsShowing" icon="fa-square-caret-down" />
            <!-- {{ row.detailsShowing ? 'Hide' : 'Show'}} Details -->
          </b-button>

        </template>
        <template #row-details="row">
          <b-card>
              <b-table
                striped hover
                :items="[row.item]"
                :fields="[
                  { key: 'generationYear', label: 'PV-Erzeugung', formatter: (val) => `${formatNumber(val, 1)} kWh` },
                  { key: 'consumptionYear', label: 'Stromverbrauch', formatter: (val) => `${formatNumber(val, 1)} kWh` },
                  { key: 'consumptionGrid', label: 'Netzbezug', formatter: (val) => `${formatNumber(val, 1)} kWh` },
                  { key: 'missedFeedInPowerGrid', label: 'Fehlende Netzeinspeisung', formatter: (val) => `${formatNumber(val, 1)} kWh` },
                  { key: 'missedInverterPower', label: 'Fehlende Erzeugung Wechselrichter', formatter: (val) => `${formatNumber(val, 1)} kWh` },
                  { key: 'missedBatteryPower', label: 'Fehlende Erzeugung Speicher', formatter: (val) => `${formatNumber(val, 1)} kWh` },
                ]"
                small
                responsive="sm"
              />
              <h4>Einzelne Erträge der Ausrichtungen</h4>
              <b-table
                striped hover
                :items="roofsData"
                :fields="[
                  { key: 'aspect', label: 'Ausrichtung', formatter: (val) => `${formatNumber(val, 1)}°` },
                  { key: 'angle', label: 'Neigung', formatter: (val) => `${formatNumber(val, 1)}°` },
                  { key: 'peakpower', label: 'Leistung', formatter: (val) => `${formatNumber(val / 1000, 1)} kWp` },
                  { key: 'generationYear', label: 'PV-Ertrag', formatter: (val) => `${formatNumber(val, 1)} kWh` },
                ]"
                small
                responsive="sm"
              />
          </b-card>
          <b-card>
            <EnergyFlowChart :energy-flow="row.item.energyFlow" :battery-capacity="row.item.size"
              :years="years" :busy="isCalculating" @year-change="changeComparisonYear" />

          </b-card>
        </template>
      </b-table>
      <footer v-if="displayData.length > 0"
              class="mt-3 mb-4" aria-labelledby="custom-consumption-summary-heading">
        <h5 id="custom-consumption-summary-heading">Jährlicher Stromverbrauch — {{ customConsumptionYear }}</h5>
        <ul class="mb-1">
          <li><strong>Haushalt:</strong> {{ formatSummaryNumber(householdConsumptionKwh) }} kWh</li>
          <li v-for="(item, index) in customConsumptionSummary" :key="index">
            <strong>{{ item.name }}:</strong>
            {{ formatSummaryNumber(item.count) }} {{ item.type === 'electric-car' ? 'Ladevorgänge' : 'Tage' }}<template v-if="item.type === 'heating'">,
              {{ formatSummaryNumber(item.hours) }} Stunden</template>,
            {{ formatSummaryNumber(item.energyKwh) }} kWh
          </li>
        </ul>
        <p class="mb-1"><strong>Gesamtverbrauch: {{ formatSummaryNumber(totalConsumptionKwh) }} kWh</strong></p>
        <small class="text-muted">Lastprofil für das ganze Jahr. Gezählt werden die Starts innerhalb dieses Jahres; Stunden und Energie berücksichtigen auch Überträge aus dem Vorjahr.</small>
      </footer>
    </b-overlay>
    <FAQ />
    <NuxtLink to="/impress">Impressum / Datenschutz</NuxtLink>
  </b-container>
</template>

<script>
import Chart from '../components/Chart'
import EnergyFlowChart from '../components/EnergyFlowChart'
import FAQ from '../components/FAQ'
// import axios from "axios";
import {
  calculateConsumption,
  generateDayTimeValues,
  mergePowerGeneration,
  normalizeHourlyRadiation,
  energyFlow
} from "@/functions/energyFlow";
import { factorFunction, PROFILEBASE, SLPH0 } from "@/functions/SLP";
import customConsumptionYaml from '!!raw-loader!../custom-consumption.yaml';
import { parseCustomConsumptions, addCustomConsumptions, summarizeCustomConsumptions } from '@/functions/customConsumption';

const formatNumber = (value, digits = 2) => Number(value).toLocaleString('de-DE', {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits
})

export default {
  name: 'IndexPage',
  components: {
    Chart,
    EnergyFlowChart,
    FAQ
  },
  data() {
    return {
      displayData: [],
      customConsumptionSummary: [],
      customConsumptionYear: null,
      householdConsumptionKwh: 0,
      totalConsumptionKwh: 0,
      returnedData: {},
      tableFields:[
        { key: 'size', label: 'Speichergröße', formatter: (val) => `${formatNumber(val / 1000, 1)} kWh` },
        { key: 'selfUsedPower', label: 'Selbstgenutzter Strom / Jahr', formatter: (val) => `${formatNumber(val)} kWh` },
        { key: 'fedInPower', label: 'Eingespeister Strom / Jahr', formatter: (val) => `${formatNumber(val)} kWh` },
        { key: 'selfUseRate', label: 'Eigenverbrauchsquote', formatter: (val) => `${formatNumber(val)} %` },
        { key: 'selfSufficiencyRate', label: 'Autarkiegrad', formatter: (val) => `${formatNumber(val)} %` },
        { key: 'costSavingsBattery', label: 'Ersparnis / Jahr durch Akku', formatter: (val) => `${formatNumber(val)} €`  },
        { key: 'batteryAmortization', label: 'Amortisation nur Speicher', formatter: (val) => `${formatNumber(val)} Jahre` },
        { key: 'costSavings', label: 'Ersparnis / Jahr Anlage', formatter: (val) => `${formatNumber(val)} €` },
        { key: 'amortization', label: 'Amortisation Anlage', formatter: (val) => `${formatNumber(val)} Jahre`  },
        { key: 'show_details', label: 'Weitere Details'  },
      ],
      inputBatterySizes: [],
      batterySizes: JSON.parse(localStorage.getItem('storedSizes')) || [
        5000,
        10000,
        15000,
        20000,
        30000,
        40000,
        50000
      ],
      input: JSON.parse(localStorage.getItem('storedInput')) || {
        roofs: [],
        yearlyConsumption: 5000,
        consumptionProfile: 0,
        consumptionCosts: 0.32,
        feedInCompensation: 0.086,
        installationCostsWithoutBattery: 10000,
        batteryCostsFixed: 0,
        batteryCostsPerKwh: 500,
        systemloss: 12,
        batteryLoadEfficiency: 99,
        batteryUnloadEfficiency: 99,
        batterySocMinPercent: 10,
        year: 2020,
        maxPowerGenerationInverter: 0,
        maxPowerGenerationBattery: 0,
        maxPowerLoadBattery: 0,
        maxPowerFeedIn: 0,
        amortizationYears: 20,
        linearDegrationModules:0.5,
        linearConsumptionChange:0.5, // negative = less need
        linearConsumptionCostsChange:0,
        linearSelfUseRateChange:0,
      },
      timeNeeded: 0,
      isCalculating: false,
      calculationError: "",
      roofInput: {
        aspect: 0,
        angle: 0,
        peakpower: 0
      },
      roofsData: [],
      inputAddressSearchString: localStorage.getItem('storedInputAddressSearchString') || "",
      adressData: JSON.parse(localStorage.getItem('storedAddress')) || {},
      isSearchingAddress: false,
      addressSearchError: "",
      costSavingsWithoutBattery: 0,
      screenHeight: 0,
      years: [
        { value: 2020, text: '2020' },
        { value: 2019, text: '2019' },
        { value: 2018, text: '2018' },
        { value: 2017, text: '2017' },
        { value: 2016, text: '2016' },
        { value: 2015, text: '2015' },
      ]
    }
  },
  computed: {
    state() {
      // Overall component validation state
      return true
    }
  },
  methods: {

    formatNumber,
    formatSummaryNumber(value) {
      return value.toLocaleString('de-DE', { maximumFractionDigits: 1 })
    },
    async changeComparisonYear(value) {
      const year = Number(value)
      if (this.isCalculating || !this.years.some(option => Number(option.value) === year)) return
      this.input.year = year
      await this.generateData()
    },
    async generateData() {
      if (this.isCalculating) return
      this.calculationError = ""
      if (!this.adressData.lat || !this.adressData.lon || this.input.roofs.length === 0) {
        this.calculationError = "Bitte wähle eine Adresse und füge mindestens eine PV-Ausrichtung hinzu."
        return
      }
      this.isCalculating = true
      try {
        await this.calculateData()
      } catch (error) {
        this.calculationError = error.message && error.message.startsWith('Custom consumption:')
          ? error.message.replace('Custom consumption:', 'Zusätzlicher Stromverbrauch:')
          : "Die Berechnung ist fehlgeschlagen. Prüfe, ob der Hintergrunddienst läuft, und versuche es erneut. Der PVGIS-Dienst ist möglicherweise vorübergehend nicht verfügbar. Vorhandene Ergebnisse bleiben unverändert."
      } finally {
        this.isCalculating = false
      }
    },
    async calculateData() {
      // Every request and calculation uses the same inputs, even if the form changes while awaiting PVGIS.
      const input = JSON.parse(JSON.stringify(this.input))
      input.year = Number(input.year)
      const address = { ...this.adressData }
      const addressSearchString = this.inputAddressSearchString
      const batterySizes = [...this.batterySizes]
      const expandedSizes = new Set(this.displayData.filter(row => row._showDetails).map(row => row.size))
      const roofsData = []
      if (!this.years.some(option => Number(option.value) === input.year)) {
        throw new Error('Das Vergleichsjahr wird nicht unterstützt.')
      }
      if (localStorage /* function to detect if localstorage is supported*/) {
        localStorage.setItem('storedInput', JSON.stringify(input))
        localStorage.setItem('storedInputAddressSearchString', addressSearchString)
        localStorage.setItem('storedSizes', JSON.stringify(batterySizes))
        localStorage.setItem('storedAddress', JSON.stringify(address))
      }

      let now = performance.now()

      const customConsumptions = parseCustomConsumptions(customConsumptionYaml)
      const customConsumptionYear = input.year
      const customConsumptionSummary = summarizeCustomConsumptions(customConsumptions, customConsumptionYear)

      const generationData = await Promise.all(input.roofs.map((roof, index) => {
        return this.$axios.post("/relay", {
          url: this.buildQueryString({
            aspect: roof.aspect,
            angle: roof.angle,
            lat: address.lat,
            lon: address.lon,
            peakpower: roof.peakpower / 1000,
            loss: input.systemloss,
            startyear: input.year,
            endyear: input.year

          }),
          method: "GET",
          body: {}
        }, { timeout: 20000 })
          .then(response => response.data)
          .then(data => {
            if (!data || !data.outputs || !Array.isArray(data.outputs.hourly) || data.outputs.hourly.length === 0) {
              throw new Error("PVGIS hat keine stündlichen Erzeugungsdaten geliefert.")
            }
            const normData = normalizeHourlyRadiation(data.outputs.hourly)
            const timestamps = Object.keys(normData)
            if (timestamps.length === 0 || timestamps.some(time => Number(time.slice(0, 4)) !== input.year)) {
              throw new Error('Die PVGIS-Erzeugungsdaten passen nicht zum angeforderten Vergleichsjahr.')
            }
            const generationYear = Object.values(normData).reduce((prev, curr) => prev + curr.P,0) / 1000
            roofsData[index] = { ...roof, generationYear }
            return normData
          })
      }))


      const mergedPower = mergePowerGeneration(generationData)

      const householdConsumption = calculateConsumption({ year: input.year, consumptionYear: input.yearlyConsumption, profile: SLPH0, profileBase: PROFILEBASE, factorFunction })
      const consumption = addCustomConsumptions(householdConsumption, customConsumptions, input.year)
      const householdConsumptionKwh = Object.values(householdConsumption).reduce((sum, hour) => sum + hour.P, 0) / 1000
      const totalConsumptionKwh = Object.values(consumption).reduce((sum, hour) => sum + hour.P, 0) / 1000
      const powerGenAndConsumption = generateDayTimeValues({ consumption, powerGeneration: mergedPower, year: input.year })
      if (powerGenAndConsumption.length === 0) {
        throw new Error('Für das Vergleichsjahr sind keine passenden stündlichen Daten vorhanden.')
      }

      let costSavingWithoutBattery


      const batterySizesWithNoBattery = [1, ...batterySizes]

      let BatterySizeResults = batterySizesWithNoBattery.map(size => {
        let newSoc = 100



        const energyFlowData = powerGenAndConsumption.map(genConsumption => {
          const energyFlowObj = {
            powerGeneration: genConsumption.P,
            powerConsumption: genConsumption.consumption,
            batterySoc: newSoc,
            batterySocMax: size,
            batterySocMin: size * input.batterySocMinPercent / 100,
            batteryLoadEfficiency: input.batteryLoadEfficiency / 100,
            batteryUnloadEfficiency: input.batteryUnloadEfficiency / 100,
            dayTime: genConsumption.dayTime
          }
          if (input.maxPowerGenerationInverter && input.maxPowerGenerationInverter > 0) energyFlowObj.maxPowerGenerationInverter = input.maxPowerGenerationInverter
          if (input.maxPowerGenerationBattery && input.maxPowerGenerationBattery > 0) energyFlowObj.maxPowerGenerationBattery = input.maxPowerGenerationBattery
          if (input.maxPowerLoadBattery && input.maxPowerLoadBattery > 0) energyFlowObj.maxPowerLoadBattery = input.maxPowerLoadBattery
          if (input.maxPowerFeedIn && input.maxPowerFeedIn > 0) energyFlowObj.maxPowerFeedIn = input.maxPowerFeedIn

          const hourFlow = energyFlow(energyFlowObj)
          newSoc = hourFlow.newBatterySoc
          return hourFlow
        })

        const generationYear = energyFlowData.reduce((prev, curr) => curr.selfUsagePower + curr.feedInPowerGrid + prev, 0) / 1000
        const consumptionYear = energyFlowData.reduce((prev, curr) => curr.selfUsagePower + curr.consumptionGrid + prev, 0) / 1000
        const consumptionGrid = energyFlowData.reduce((prev, curr) => curr.consumptionGrid + prev, 0) / 1000
        const missedBatteryPower = energyFlowData.reduce((prev, curr) => curr.missedBatteryPower + prev, 0) / 1000
        const missedFeedInPowerGrid = energyFlowData.reduce((prev, curr) => curr.missedFeedInPowerGrid + prev, 0) / 1000
        const missedInverterPower = energyFlowData.reduce((prev, curr) => curr.missedInverterPower + prev, 0) / 1000
        const selfUsedPower = energyFlowData.reduce((prev, curr) => curr.selfUsagePower + prev, 0) / 1000
        const fedInPower = energyFlowData.reduce((prev, curr) => curr.feedInPowerGrid + prev, 0) / 1000
        const selfSufficiencyRate = consumptionYear > 0 ? selfUsedPower / consumptionYear * 100 : 0 // Autarkiegrad
        const selfUseRate = selfUsedPower / generationYear * 100 // Eigenverbrauchsquote
        const costSavings = (selfUsedPower * input.consumptionCosts + fedInPower * input.feedInCompensation)
        if (size == 1) costSavingWithoutBattery = costSavings;
        const amortization = (input.installationCostsWithoutBattery + (size == 1 ? 0 : input.batteryCostsFixed + input.batteryCostsPerKwh * (size / 1000))) / costSavings
        const costSavingsBattery = size == 1 ? 0 : costSavings - costSavingWithoutBattery
        const batteryAmortization = size == 1 ? 0 : input.batteryCostsFixed + input.batteryCostsPerKwh * (size / 1000) / costSavingsBattery

        const monthlyDataObj = energyFlowData.reduce((prev, curr) => {
          const month = parseInt(curr.dayTime.slice(4, 6))
          if (prev[month]) {

            prev[month] = {
              batteryLoad: curr.batteryLoad <= 0 ? (curr.batteryLoad * -1) + prev[month].batteryLoad : curr.batteryLoad + prev[month].batteryLoad,
              consumptionGrid: curr.consumptionGrid + prev[month].consumptionGrid,
              feedInPowerGrid: curr.feedInPowerGrid + prev[month].feedInPowerGrid,
              missedBatteryPower: curr.missedBatteryPower + prev[month].missedBatteryPower,
              missedFeedInPowerGrid: curr.missedFeedInPowerGrid + prev[month].missedFeedInPowerGrid,
              missedInverterPower: curr.missedInverterPower + prev[month].missedInverterPower,
              selfUsagePower: curr.selfUsagePower + prev[month].selfUsagePower,
              selfUsagePowerBattery: curr.selfUsagePowerBattery + prev[month].selfUsagePowerBattery,
              selfUsagePowerPv: curr.selfUsagePowerPv + prev[month].selfUsagePowerPv
            }
          } else {
            prev[month] = {
              batteryLoad: curr.batteryLoad <= 0 ? curr.batteryLoad * -1 : curr.batteryLoad,
              consumptionGrid: curr.consumptionGrid,
              feedInPowerGrid: curr.feedInPowerGrid,
              missedBatteryPower: curr.missedBatteryPower,
              missedFeedInPowerGrid: curr.missedFeedInPowerGrid,
              missedInverterPower: curr.missedInverterPower,
              selfUsagePower: curr.selfUsagePower,
              selfUsagePowerBattery: curr.selfUsagePowerBattery,
              selfUsagePowerPv: curr.selfUsagePowerPv
            }
          }
          return prev
        }, {})

        const yearlyData = new Array(input.amortizationYears).fill(undefined).map((val,i)=>i).map((val) => {

          const conYear = consumptionYear * (100+ (input.linearConsumptionChange * val)) /100
          // var suRate = selfUseRate * (100 + input.linearSelfUseRateChange * val)/100
          var suRate = selfUseRate * ((input.linearSelfUseRateChange / 100+1)**val)
            const suPower = generationYear*suRate/100
          const conCosts = input.consumptionCosts * ((100 + input.linearConsumptionCostsChange*val)/100)
            const fedIn = generationYear - suPower

            return {
              year: val,
              generationYear: generationYear * (100 - (input.linearDegrationModules * val)) /100,
              consumptionYear: conYear,
              selfUsedPower: suPower,
              fedInPower: fedIn,
              selfSufficiencyRate: suPower/conYear*100,
              selfUsedRate: selfUseRate,
              consumptionCosts: conCosts,
              costSavings: (suPower * conCosts + fedIn * input.feedInCompensation),
            }

        })



        const monthlyData = Object.keys(monthlyDataObj).map(key => {
          monthlyDataObj[key].month = parseInt(key)
          return monthlyDataObj[key]
        }).sort((a, b) => a.month - b.month)

        return {
          size,
          _showDetails: expandedSizes.has(size),
          energyFlow: energyFlowData,
          generationYear,
          consumptionYear,
          selfUsedPower,
          fedInPower,
          missedBatteryPower,
          missedFeedInPowerGrid,
          missedInverterPower,
          consumptionGrid,
          selfSufficiencyRate,
          selfUseRate,
          costSavings,
          amortization,
          costSavingsBattery,
          batteryAmortization,
          monthlyData,
          yearlyData
        }

      })

      this.timeNeeded = performance.now() - now
      this.roofsData = roofsData
      this.displayData = BatterySizeResults
      this.customConsumptionSummary = customConsumptionSummary
      this.customConsumptionYear = customConsumptionYear
      this.householdConsumptionKwh = householdConsumptionKwh
      this.totalConsumptionKwh = totalConsumptionKwh
    },
    async getCoordinatesByAddress() {
      if (this.isSearchingAddress) return
      const address = this.inputAddressSearchString.trim()
      this.addressSearchError = ""
      this.adressData = {}
      if (!address) {
        this.addressSearchError = "Bitte gib eine Adresse ein."
        return
      }

      this.isSearchingAddress = true
      try {
        const osmReturn = (await this.$axios.post("/relay", {
          url: `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(address)}`,
          method: "GET",
          body: {}
        }, { timeout: 20000 })).data

        if (!Array.isArray(osmReturn)) throw new Error("Ungültige Antwort bei der Adresssuche")
        if (osmReturn.length === 0) {
          this.adressData = "no_address"
        } else {
          const result = osmReturn[0]
          if (!result || !result.lat || !result.lon || !result.display_name) {
            throw new Error("Ungültiges Ergebnis bei der Adresssuche")
          }
          this.adressData = result
          this.inputAddressSearchString = result.display_name
        }
      } catch {
        this.addressSearchError = "Die Adresssuche ist derzeit nicht verfügbar. Bitte versuche es später erneut."
      } finally {
        this.isSearchingAddress = false
      }
    },
    buildQueryString(params) {
      //API BaseURL with Base Params
      // let string = `https://re.jrc.ec.europa.eu/api/v5_2/SHScalc?outputformat=json&raddatabase=PVGIS-SARAH&cutoff=1`

      const loss = params.loss || 12
      const lat = params.lat
      const lon = params.lon
      const startyear = params.startyear || params.year || 2020
      const endyear = params.endyear || params.year || 2020
      const peakpower = params.peakpower
      const angle = params.angle
      const aspect = params.aspect

      let string = `https://re.jrc.ec.europa.eu/api/v5_2/seriescalc?pvcalculation=1&outputformat=json&loss=${loss}&lat=${lat}&lon=${lon}&startyear=${startyear}&endyear=${endyear}&peakpower=${peakpower}&angle=${angle}&aspect=${aspect}`

      return string
    },
    resetValues() {
      localStorage.clear()
      location.reload()
    },
    tagValidator(tag) {

      return !isNaN(tag) && tag < 200000 && tag > 200

    },
    addRoof(e) {
      this.input.roofs.push(this.roofInput)
      this.roofInput= {
        aspect: 0,
        angle: 0,
        peakpower: 0
      }
    }
  },
  watch: {
    inputBatterySizes(newValue, oldValue) {
      this.batterySizes = newValue.map(val => Number(val)).sort((a, b) => a - b)

    }
  },
  mounted() {
    this.screenHeight = window.screen.height

    this.inputBatterySizes = [...this.batterySizes]

  }
}
</script>

<style>
#chart {
  max-height: 50vh;
}

table {
  width: 90vw;
}

th,
td {
  border: 1px solid black;
}

th {
  vertical-align: top;
}

td {
  text-align: right;
}

#tableContainer {
  overflow-x: scroll;
}

#chartContainer {
  max-width: 100vw;
  max-height: 50vh;
}

.paypal {
  margin-top: 10px;
}
.b-table-details canvas {
  max-width: 100%;
  max-height: 40vh;
}
</style>
