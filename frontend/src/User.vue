<template>
  <div class="wrap">
    <div class="topbar">
      <span>👤 {{ user.username === 'guest' ? 'Login is currently disabled' : ('Logged in as ' + (user.displayName || user.username)) }}</span>
      <button v-if="user.username !== 'guest'" class="btn-logout" @click="$emit('logout')">Log out</button>
    </div>
    <h1>👥 Users</h1>
    <PageTabs page="users" @navigate="$emit('navigate', $event)" />

    <div class="toolbar" style="flex-wrap:wrap;gap:12px;">
      <div>
        <label>Username</label>
        <input class="inp" v-model.trim="form.username" :disabled="editing" placeholder="username" />
      </div>
      <div>
        <label>Display name</label>
        <input class="inp" v-model.trim="form.displayName" placeholder="name" />
      </div>
      <div>
        <label>Role</label>
        <select class="inp" v-model="form.role">
          <option value="checker">checker (ตรวจอย่างเดียว)</option>
          <option value="admin">admin (จัดการทุกอย่าง)</option>
        </select>
      </div>
      <div>
        <label>Password</label>
        <input class="inp" type="password" v-model="form.password" :placeholder="editing ? 'ว่างไว้ = ไม่เปลี่ยน' : 'password'" />
      </div>
      <button class="btn-save" @click="saveUser">{{ editing ? 'Update user' : 'Add user' }}</button>
      <button v-if="editing" class="btn-reset" @click="resetForm">Cancel</button>
      <span v-if="message" style="color:#c0392b;font-size:14px;">{{ message }}</span>
    </div>

    <div class="table-scroll">
      <table>
        <thead>
          <tr><th>Username</th><th>Display name</th><th>Role</th><th>Created</th><th>Action</th></tr>
        </thead>
        <tbody>
          <tr v-if="users.length === 0"><td colspan="5" style="padding:16px;color:#999;">No users.</td></tr>
          <tr v-for="u in users" :key="u.username">
            <td class="loc">{{ u.username }}</td>
            <td>{{ u.displayName }}</td>
            <td>{{ u.role }}</td>
            <td>{{ String(u.createdAt || '').slice(0, 10) }}</td>
            <td>
              <button class="btn-reset" @click="startEdit(u)">Edit</button>
              <button class="btn-reset" style="margin-left:6px;" @click="removeUser(u)">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <h2 style="margin:24px 0 8px;">Audit log (ล่าสุด 100 รายการ)</h2>
    <button class="btn-reset" style="margin-bottom:8px;" @click="loadAudit">Refresh</button>
    <div class="table-scroll">
      <table>
        <thead>
          <tr><th>Time</th><th>User</th><th>Action</th><th>Target</th><th>IP</th></tr>
        </thead>
        <tbody>
          <tr v-if="logs.length === 0"><td colspan="5" style="padding:16px;color:#999;">No logs.</td></tr>
          <tr v-for="(l, i) in logs" :key="i">
            <td>{{ String(l.time || '').replace('T', ' ').slice(0, 19) }}</td>
            <td>{{ l.userId }}</td>
            <td>{{ l.action }}</td>
            <td>{{ l.target }}</td>
            <td>{{ l.ip }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script>
import PageTabs from './PageTabs.vue';

const EMPTY = { username: '', displayName: '', role: 'checker', password: '' };

export default {
  name: 'Users',
  components: { PageTabs },
  props: { token: String, user: Object },
  emits: ['logout', 'navigate'],
  data() {
    return { users: [], logs: [], form: { ...EMPTY }, editing: false, message: '' };
  },
  methods: {
    async authFetch(url, options = {}) {
      const res = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
          Authorization: `Bearer ${this.token}`,
        },
      });
      if (res.status === 401) {
        alert('Your session has expired. Please log in again.');
        this.$emit('logout');
        throw new Error('unauthorized');
      }
      return res;
    },
    resetForm() {
      this.form = { ...EMPTY };
      this.editing = false;
    },
    startEdit(u) {
      this.form = { username: u.username, displayName: u.displayName || '', role: u.role || 'checker', password: '' };
      this.editing = true;
      this.message = '';
    },
    async loadUsers() {
      try {
        const res = await this.authFetch('/api/users');
        const data = await res.json();
        if (!res.ok) { this.message = data.error || 'Failed to load users'; return; }
        this.users = data.users || [];
      } catch (e) {
        if (e.message !== 'unauthorized') this.message = String(e);
      }
    },
    async loadAudit() {
      try {
        const res = await this.authFetch('/api/audit?limit=100');
        const data = await res.json();
        if (res.ok) this.logs = data.logs || [];
      } catch (e) { /* ข้ามได้ */ }
    },
    async saveUser() {
      this.message = '';
      const f = this.form;
      if (!f.username) { this.message = 'Username is required'; return; }
      if (!this.editing && !f.password) { this.message = 'Password is required for a new user'; return; }
      try {
        const res = this.editing
          ? await this.authFetch('/api/users/' + encodeURIComponent(f.username), {
              method: 'PUT',
              body: JSON.stringify({ displayName: f.displayName, role: f.role, password: f.password || undefined }),
            })
          : await this.authFetch('/api/users', { method: 'POST', body: JSON.stringify(f) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { this.message = data.error || 'Failed'; return; }
        this.resetForm();
        await this.loadUsers();
        await this.loadAudit();
      } catch (e) {
        if (e.message !== 'unauthorized') this.message = String(e);
      }
    },
    async removeUser(u) {
      if (!confirm(`Delete user "${u.username}" ?`)) return;
      this.message = '';
      try {
        const res = await this.authFetch('/api/users/' + encodeURIComponent(u.username), { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { this.message = data.error || 'Failed'; return; }
        await this.loadUsers();
        await this.loadAudit();
      } catch (e) {
        if (e.message !== 'unauthorized') this.message = String(e);
      }
    },
  },
  mounted() {
    this.loadUsers();
    this.loadAudit();
  },
};
</script>

<style scoped>
.inp { padding: 8px 10px; border: 1px solid #cfd4dc; border-radius: 8px; font-size: 14px; }
</style>