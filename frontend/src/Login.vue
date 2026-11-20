<template>
  <div class="lg-page" :style="pageStyle" @mousemove="onMove" @mouseleave="onLeave">
    <div class="lg-bg" aria-hidden="true">
      <div class="lg-par">
        <span class="lg-orb lg-orb1"></span>
        <span class="lg-orb lg-orb2"></span>
        <span class="lg-orb lg-orb3"></span>
        <span class="lg-grid"></span>
      </div>
    </div>

    <div class="lg-shell" :style="shellStyle">
      <aside class="lg-brand">
        <div class="lg-cam" aria-hidden="true">
          <svg viewBox="0 0 200 200" class="lg-camsvg">
            <circle class="lg-ring lg-r1" cx="100" cy="100" r="46" />
            <circle class="lg-ring lg-r2" cx="100" cy="100" r="46" />
            <circle class="lg-ring lg-r3" cx="100" cy="100" r="46" />
            <circle cx="100" cy="100" r="48" fill="rgba(255,255,255,.12)" stroke="#fff" stroke-width="3" />
            <circle cx="100" cy="100" r="32" fill="#0a1f5c" stroke="rgba(255,255,255,.7)" stroke-width="2" />
            <circle cx="100" cy="100" r="18" fill="#1f63ff" />
            <circle class="lg-glint" cx="92" cy="92" r="6" fill="rgba(255,255,255,.85)" />
            <circle class="lg-rec" cx="152" cy="54" r="6" fill="#ff3b4e" />
          </svg>
          <span class="lg-live"><i></i> LIVE</span>
        </div>

        <div class="lg-brandtext">
          <h2>ATM Camera Checklist</h2>
          <p>Daily start-of-day inspection of cameras, DVRs, SIM and alarms.</p>
          <ul class="lg-points">
            <li><span>✓</span> Daily camera &amp; DVR checks</li>
            <li><span>✓</span> SIM / alarm monitoring</li>
            <li><span>✓</span> History &amp; PDF reports</li>
          </ul>
        </div>

        <div class="lg-clock">
          <div class="lg-time">{{ timeText }}</div>
          <div class="lg-date">{{ dateText }}</div>
        </div>
      </aside>

      <main class="lg-card">
        <div class="lg-logobox">
          <img class="lg-logo" src="/logo.jpg" alt="LaoViet Bank" />
        </div>
        <p class="lg-hello">{{ greeting }} 👋</p>
        <h1>Sign in</h1>
        <p class="lg-subtitle">Enter your account to continue</p>

        <form :class="{ 'lg-shake': shake }" @submit.prevent="submit">
          <label class="lg-field">
            <span class="lg-label">Username</span>
            <span class="lg-inputwrap">
              <svg class="lg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
              </svg>
              <input
                v-model="username"
                class="lg-input"
                type="text"
                autocomplete="username"
                placeholder="Enter your username"
                required
              />
            </span>
          </label>

          <label class="lg-field">
            <span class="lg-label">Password</span>
            <span class="lg-inputwrap">
              <svg class="lg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="10" width="16" height="11" rx="2.5" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
              <input
                v-model="password"
                class="lg-input"
                :type="showPw ? 'text' : 'password'"
                autocomplete="current-password"
                placeholder="Enter your password"
                required
                @keydown="checkCaps"
                @keyup="checkCaps"
              />
              <button
                type="button"
                class="lg-eye"
                tabindex="-1"
                :aria-label="showPw ? 'Hide password' : 'Show password'"
                @click="showPw = !showPw"
              >
                <svg v-if="!showPw" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17.9 17.9A10.4 10.4 0 0 1 12 19C5.6 19 2 12 2 12a18.5 18.5 0 0 1 4.1-5.1M9.9 5.2A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a18.6 18.6 0 0 1-2.2 3.2M1 1l22 22" />
                  <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                </svg>
              </button>
            </span>
          </label>

          <div v-if="capsOn" class="lg-caps">⚠ Caps Lock is on</div>

          <button class="lg-btn" type="submit" :disabled="loading">
            <span v-if="loading" class="lg-spin"></span>
            <span>{{ loading ? 'Signing in...' : 'Sign in' }}</span>
          </button>

          <div v-if="error" class="lg-error" role="alert">
            <span>⚠</span><span>{{ error }}</span>
          </div>
        </form>

        <div class="lg-foot">© LaoViet Bank · Card Department – HSC</div>
      </main>
    </div>
  </div>
</template>

<script>
export default {
  name: 'Login',
  emits : ['login-success'],
  data(){
    return{
      username:'',
      password:'',
      loading: false,
      error:'',
      showPw: false,
      capsOn: false,
      shake: false,
      now: new Date(),
      tx: 0,
      ty: 0,
      canTilt: false,
      clockTimer: null,
      shakeTimer: null,
    };
  },
  computed: {
    greeting() {
      const h = this.now.getHours();
      if (h < 12) return 'Good morning';
      if (h < 17) return 'Good afternoon';
      return 'Good evening';
    },
    timeText(){
      const p = (n) => String(n).padStart(2, '0');
      return p(this.now.getHours()) + ':' + p(this.now.getMinutes());
    },
    dateText(){
      return this.now.toLocaleDateString('en-GB',{
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    },
    pageStyle() {
      return {'--mx': this.tx, '--my': this.ty};
    },
    shellStyle() {
      if (!this.canTilt) return {};
      return{
        transform: `perspective(1400px) rotateY(${this.tx * 2.5}deg) rotateX(${-this.ty * 2.5}deg)`,
      };
    },
  },
  methods: {
    onMove(e) {
      if (!this.canTilt) return;
      this.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      this.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    },
    onLeave() {
      this.tx = 0;
      this.ty = 0;
    },
    checkCaps(e) {
      if (e && e.getModifierState) this.capsOn = e.getModifierState('CapsLock');
    },
    triggerShake() {
      this.shake = false;
      clearTimeout(ths.shakeTimer);
      this.$nextTick(() => {
        this.shake = true;
        this.shakeTimer = setTimeout(() => {this.shake = false; }, 500);
      });
    },
    async submit(){
      this.loading = true;
      this.error ='';

      try{
        const res = await fetch('/api/login',{
          method:'POST',
          headers:{'Content-Type' : 'application/json'},
          body: JSON.stringify({username: this.username,password: this.password}),
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          this.$emit('login-success', {token: data.token, user: data.user});
        }else {
          this.error = data.error || 'login failed';
          this.triggerShake();
        }
      }catch (e) {
        this.error = 'Clould not reach the server .' + e;
        this.triggerShake();
      } finally {
        this.loading = false;
      }
    },
  },
  mounted() {
    this.clockTimer = setInterval(() => {this.now = new Date(); }, 1000);
    const m = window.matchMedia;
    this.canTilt = !!(m && m('(hover: hover)').matches && !m('(prefers-reduced-motion:reduce)').matches);
  },
  beforeUnmount(){
    clearInterval(this.clockTimer);
    clearTimeout(this.shakeTimer);
  },
};

</script>