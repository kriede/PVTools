<template>
  <button
    type="button"
    class="inline-flex shrink-0 items-center text-muted hover:text-brand"
    :title="hint"
    :aria-label="`${modelValue ? 'Hilfe ausblenden' : 'Hilfe anzeigen'}: ${label}`"
    :aria-expanded="modelValue"
    :aria-controls="controls"
    @click.stop.prevent="$emit('update:modelValue', !modelValue)"
  >
    <Info class="h-3.5 w-3.5" />
  </button>
</template>

<script setup>
import { Info } from 'lucide-vue-next'

defineProps({
  modelValue: { type: Boolean, default: false },
  label: { type: String, required: true },
  hint: { type: String, required: true },
  controls: { type: String, required: true },
})
defineEmits(['update:modelValue'])
</script>