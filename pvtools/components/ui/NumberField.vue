<template>
  <div class="block">
    <span class="mb-1 flex items-center gap-1 text-xs font-medium text-muted">
      <label :for="inputId">{{ label }}</label>
      <InfoHelp v-if="hint && expandableHint" v-model="hintVisible" :label="label" :hint="hint" :controls="helpId" />
      <span v-else-if="hint" class="cursor-help" :title="hint">
        <Info class="h-3.5 w-3.5" />
      </span>
    </span>
    <span class="relative block">
      <input
        :id="inputId"
        :aria-describedby="hintVisible ? helpId : undefined"
        class="input pr-16"
        type="number"
        inputmode="decimal"
        :min="min"
        :max="max"
        :step="step"
        :disabled="disabled"
        :value="displayValue"
        @input="onInput"
      />
      <span
        v-if="unit"
        class="pointer-events-none absolute inset-y-0 right-3 flex items-center font-mono text-xs text-muted"
        >{{ unit }}</span
      >
    </span>
    <div v-if="hintVisible" :id="helpId" class="mt-1.5 text-xs text-muted">
      <slot name="help">{{ hint }}</slot>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, useId } from 'vue'
import { Info } from 'lucide-vue-next'
import InfoHelp from './InfoHelp.vue'

const props = defineProps({
  label: { type: String, required: true },
  modelValue: { type: Number, default: 0 },
  unit: { type: String, default: '' },
  hint: { type: String, default: '' },
  expandableHint: { type: Boolean, default: false },
  preservePrecision: { type: Boolean, default: false },
  min: { type: [Number, String], default: undefined },
  max: { type: [Number, String], default: undefined },
  step: { type: [Number, String], default: 'any' },
  // the value is shown multiplied with this factor, e.g. Wh as kWh = 0.001
  factor: { type: Number, default: 1 },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
const inputId = useId()
const helpId = `${inputId}-help`
const hintVisible = ref(false)

const displayValue = computed(() =>
  Number.isFinite(props.modelValue)
    ? props.preservePrecision ? props.modelValue * props.factor : Math.round(props.modelValue * props.factor * 1e6) / 1e6
    : '',
)

const onInput = (event) => {
  const value = event.target.valueAsNumber
  if (Number.isFinite(value)) {
    emit('update:modelValue', props.preservePrecision ? value / props.factor : Math.round((value / props.factor) * 1e6) / 1e6)
  }
}
</script>
