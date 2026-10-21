<template>
  <div id="app-root">
    <div v-if="!checkedAuthConfig" class="auth-check-loading">Loading...</div>
    <Login v-else-if="!token" @login-success="onLoginSuccess" />
    <template v-else>
      <div class="doc-header">
        <div class="nation">CỘNG HÒA DÂN CHỦ NHÂN DÂN LÀO</div>
        <div class="motto">Hòa Bình - Độc lập - Dân chủ - Thống nhất - Thịnh vượng
          <hr class="doc-line" />
        </div>
        <div class="row">
          <div class="left">
            <img class="logo" src="/logo.jpg" alt="" />
            <div class="names">
              <div class="bank1">ທະນາຄານຮ່ວມທຸລະກິດລາວຫວຽດ</div>
              <div class="bank2">NGÂN HÀNG LIÊN DOANH LÀO VIỆT</div>
            </div>
          </div>
          <div class="right">
          </div>
        </div>
        <div class="dept">PHÒNG THẺ - HSC</div>
        <div class="title">BIÊN BẢN KIỂM TRA ĐẦU NGÀY</div>
        <div class="sub">(Hệ thống camera giám sát và báo động ATM)</div>
        <div class="head1">I.   Kiểm tra hệ thống Camera giám sát an ninh</div>
        <div class="head2">1.   Kiểm tra trạng thái kết nối của thiết bị Camera</div>
        <hr class="doc-line" />
      </div>
      <Checklist v-if="page === 'checklist'" :token="token" :user="user" @logout="logout" @navigate="page = $event" />
      <SimCheck v-else-if="page === 'simcheck'" :token="token" :user="user" @logout="logout" @navigate="page = $event" />
      <AtmAdmin v-else :token="token" :user="user" @logout="logout" @navigate="page = $event" />
    </template>
  </div>
</template>


<script>
import Login from './Login.vue';
import Checklist from './Checklist.vue';
import AtmAdmin from './AtmAdmin.vue';
import SimCheck from './SimCheck.vue';

const STORAGE_KEY = 'atm_checklist_session';

// Today's date on this computer, as YYYY-MM-DD.
function localToday() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export default {
  name: 'App',
  components: { Login, Checklist,AtmAdmin,SimCheck },
  data() {
    return {
      token: null,
      user: null,
      requireLogin: true, // assume true until we hear back from the backend
      checkedAuthConfig: false,
      page:'checklist',
      today: localToday(),
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