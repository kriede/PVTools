<template>
  <section class="card p-4 sm:p-5">
    <header class="mb-4 flex items-baseline gap-3">
      <span class="font-mono text-sm font-semibold text-brand">{{ step }}</span>
      <div class="min-w-0 flex-1">
        <h2 class="font-display text-base font-semibold">{{ title }}</h2>
      </div>
      <slot name="aside" />
      <HelpToggle v-if="subtitle || $slots.help" v-model="showHelp" :controls="helpId" />
    </header>
    <div v-if="showHelp" :id="helpId" class="mb-4 space-y-2 text-xs text-muted">
      <p v-if="subtitle">{{ subtitle }}</p>
      <slot name="help" />
    </div>
    <slot />
  </section>
</template>

<script setup>
import { provide, ref, useId } from 'vue'
import HelpToggle from './HelpToggle.vue'
const showHelp = ref(false)
const helpId = useId()
provide('tileHelpVisible', showHelp)
defineProps({
  step: { type: String, required: true },
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
})
</script>
