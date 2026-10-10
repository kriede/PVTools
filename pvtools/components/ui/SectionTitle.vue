<template>
  <div class="mb-4 flex items-center justify-between gap-3">
    <h3 class="font-display text-base font-semibold">{{ title }}</h3>
    <span v-if="note" class="shrink-0 font-mono text-xs text-muted">{{
      note
    }}</span>
    <HelpToggle v-if="hint" v-model="showHelp" :controls="helpId" />
  </div>
  <p v-if="hint && showHelp" :id="helpId" class="mb-4 text-xs text-muted">{{ hint }}</p>
</template>

<script setup>
import { ref, useId } from 'vue'
import HelpToggle from './HelpToggle.vue'
const showHelp = ref(false)
const helpId = useId()
defineProps({
  title: { type: String, required: true },
  note: { type: String, default: '' },
  hint: { type: String, default: '' },
})
</script>
