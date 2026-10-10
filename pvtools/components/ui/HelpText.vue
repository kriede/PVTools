<template>
  <div v-if="visible" class="text-xs text-muted"><slot /></div>
</template>

<script setup>
import { inject, ref } from 'vue'
const visible = inject('tileHelpVisible', ref(false))
</script>