<template>
  <div v-if="!checkedAuthConfig" class="auth-check-loading">Loading...</div>
  <Login v-else-if="!token" @login-success="onLoginSuccess" />
  <Checklist v-else :token="token" :user="user" @logout="logout" />
</template>

<script>
import Login from './Login.vue';
import Checklist from './Checklist.vue';

const STORAGE_KEY = 'atm_checklist_session';

export default {
  name: 'App',
  components: { Login, Checklist },
  data() {
    return {
      token: null,
      user: null,
      requireLogin: true, // assume true until we hear back from the backend
      checkedAuthConfig: false,
    };
  },
  methods: {
    onLoginSuccess({ token, user }) {
      this.token = token;
      this.user = user;
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
    },
    logout() {
      this.token = null;
      this.user = null;
      sessionStorage.removeItem(STORAGE_KEY);
    },
  },
  async mounted() {
    // Ask the backend whether login is required right now (config.json "requireLogin").
    // While requireLogin is false, skip straight to the checklist as a "guest" user —
    // handy while you're still setting up MySQL / the users table.
    try {
      const res = await fetch('/api/auth-config');
      const data = await res.json();
      this.requireLogin = !!data.requireLogin;
    } catch (e) {
      this.requireLogin = true; // if we can't reach the backend, default to safe (require login)
    }
    this.checkedAuthConfig = true;

    if (!this.requireLogin) {
      this.token = 'guest';
      this.user = { username: 'guest', displayName: 'Guest (login disabled)' };
      return;
    }

    // Stay logged in across page refresh (cleared when the browser tab closes)
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const { token, user } = JSON.parse(saved);
        this.token = token;
        this.user = user;
      } catch (e) {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
  },
};
</script>
