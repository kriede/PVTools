<template>
  <button type="button" class="tile-help-button" :aria-label="modelValue ? 'Hilfe ausblenden' : 'Hilfe anzeigen'"
    :aria-expanded="modelValue" :aria-controls="controls || undefined"
    @click.stop.prevent="emit('update:modelValue', !modelValue)">
    <CircleHelp :size="18" aria-hidden="true" />
  </button>
</template>

<script setup>
import { CircleHelp } from 'lucide-vue-next'
defineProps({ modelValue: Boolean, controls: { type: String, default: '' } })
const emit = defineEmits(['update:modelValue'])
</script>

<style scoped>
.tile-help-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
}
.tile-help-button:hover, .tile-help-button[aria-expanded="true"] { color: var(--brand); border-color: var(--brand); }
.tile-help-button:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
</style>