<template>
  <div class="page-tabs">
    <button :class="{ active: page === 'checklist' }" @click="$emit('navigate', 'checklist')">📋 ATM Check</button>
    <button :class="{ active: page === 'simcheck' }" @click="$emit('navigate', 'simcheck')">📶 SIM Check</button>
    <button :class="{ active: page === 'admin' }" @click="$emit('navigate', 'admin')">Manage ATMs</button>
  </div>
</template>

<script>
export default {
  name: 'PageTabs',
  props: { page: { type: String, required: true } },
  emits: ['navigate'],
};
</script>