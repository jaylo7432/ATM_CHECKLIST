<template>
  <div class="page-tabs">
    <button :class="{ active: page === 'checklist' }" @click="$emit('navigate', 'checklist')">📋 ATM Check</button>
    <button :class="{ active: page === 'simcheck' }" @click="$emit('navigate', 'simcheck')">📶 SIM Check</button>
    <button v-if="isAdmin" :class="{ active: page === 'admin' }" @click="$emit('navigate', 'admin')">Manage ATMs</button>
    <button :class="{ active: page === 'history' }" @click="$emit('navigate', 'history')">🕘 History</button>
    <button v-if="isAdmin" :class="{ active: page === 'users' }" @click="$emit('navigate', 'users')">👥 Users</button>
  </div>
</template>

<script>
export default {
  name: 'PageTabs',
  props: { page: { type: String, required: true } },
  emits: ['navigate'],
  computed: {
    // admin เท่านั้นที่เห็นแท็บ Manage ATMs และ Users (ฝั่ง backend บล็อกซ้ำอีกชั้น)
    isAdmin() {
      try {
        const s = JSON.parse(sessionStorage.getItem('atm_checklist_session') || 'null');
        if (!s || !s.user) return true;
        return s.user.username === 'guest' || s.user.role === 'admin';
      } catch (e) {
        return true;
      }
    },
  },
};
</script>