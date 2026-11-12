<template>
  <div class="wrap">
    <div class="topbar">
      <span>👤 {{ user.username === 'guest' ? 'Login is currently disabled' : ('Logged in as ' + (user.displayName || user.username)) }}</span>
      <button v-if="user.username !== 'guest'" class="btn-logout" @click="$emit('logout')">Log out</button>
    </div>
    <h1>👥 Users</h1>
    <PageTabs page="users" @navigate="$emit('navigate', $event)" />
    <div style="margin:12px 0;">
      <button class="btn-save" @click="openAdd">➕ Add user</button>
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
              <button class="btn-reset" @click="openEdit(u)">Edit</button>
              <button class="btn-reset" style="margin-left:6px;" @click="openDelete(u)">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <h2 style="margin:24px 0 8px;">Audit log (latest 100 log)</h2>
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
    <!-- pop up add user -->
    <div v-if="showAdd" class="modal-bg" @click.self="closeModal">
      <div class="modal-box">
        <h3 style="margin:0 0 14px;">Add user</h3>
        <label>Username</label>
        <input class="inp" style="width:100%;box-sizing:border-box;" autocomplete="off" v-model.trim="addForm.username" placeholder="username" />
        <label style="margin-top:10px;display:block;">Display name</label>
        <input class="inp" style="width:100%;box-sizing:border-box;" autocomplete="off" v-model.trim="addForm.displayName" placeholder="name" />
        <label style="margin-top:10px;display:block;">Role</label>
        <select class="inp" style="width:100%;box-sizing:border-box;" v-model="addForm.role">
          <option value="checker">checker (check only)</option>
          <option value="admin">admin (do it all)</option>
        </select>
        <label style="margin-top:10px;display:block;">Password</label>
        <input class="inp" style="width:100%;box-sizing:border-box;" type="password" autocomplete="new-password" v-model="addForm.password" placeholder="password" />
        <p v-if="modalMessage" style="color:#c0392b;font-size:14px;margin:10px 0 0;">{{ modalMessage }}</p>
        <div class="modal-actions">
          <button class="btn-reset" @click="closeModal">Cancel</button>
          <button class="btn-save" @click="saveAdd">Add</button>
        </div>
      </div>
    </div>

<!--   pop up edit user -->
    <div v-if="showEdit" class="modal-bg" @click.self="closeModal">
      <div class="modal-box">
        <h3 style="margin: 0 0 14px;">Edit user</h3>
        <label>Username</label>
        <input class="inp" style="width: 100%;box-sizing: border-box;" :value="editForm.username" disabled/>
        <label style="margin-top: 10px;display: block;">Display name</label>
        <input class="inp" style="width:100%;box-sizing:border-box;" v-model.trim="editForm.displayName" />
        <label style="margin-top: 10px;display: block;">Role</label>
        <select class="inp" style="width: 100%;box-sizing: border-box;" v-model="editForm.role">
          <option value="checker">checker (only check)</option>
          <option value="admin">admin (do it all)</option>
        </select>
        <label style="margin-top: 10px;display: block;">New password</label>
        <input class="inp" style="width: 100%;box-sizing: border-box;" type="password" autocomplete="new-password" v-model="editForm.password" placeholder="none = not change"/>
        <p v-if="modalMessage" style="color: #c0392b;font-size: 14px;margin: 10px 0 0;">{{ modalMessage }}</p>
        <div class="modal-actions">
          <button class="btn-reset" @click="closeModal">Cancel</button>
          <button class="btn-save" @click="saveEdit">Save</button>
        </div>
      </div>
    </div>

<!-- //popup confirm delete// -->
<div v-if="showDelete" class="modal-bg" @click.self = "closeModal">
  <div class="modal-box">
    <h3 style="margin: 0 0 10px;">Delete user</h3>
    <p style="margin: 0;">Delete user <b>{{ deleteTarget && deleteTarget.username }}</b>Yes or no</p>
    <p v-if="modalMessage" style="color:#c0392b ;font-size: 14px;margin: 10px 0 0;">{{ modalMessage }}</p>
    <div class="modal-actions">
      <button class="btn-reset" @click="closeModal">Cancel</button>
      <button class="btn-save" style="background:#c0392b;" @click="confirmDelete">Delete</button>
    </div>
  </div>
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
       return {
      users: [], logs: [], form: { ...EMPTY }, editing: false, message: '',
      showEdit: false, showDelete: false, modalMessage: '',
      showAdd:false,
      addForm: { username: '', displayName: '', role: 'checker', password: '' },
      editForm: { username: '', displayName: '', role: 'checker', password: '' },
      deleteTarget: null,
    };
  },

  methods: {

    openAdd(){
      this.addForm = {username:'',displayName:'',role:'checker',password:''};
      this.modalMessage = '';
      this.showAdd = true;
    },
    async saveAdd(){
      const f = this.addForm;
      if(!f.username){this.modalMessage = 'Username is required';return;}
      if(!f.password){this.modalMessage = 'Password is required';return;}
      try{
        const res = await this.authFetch('/api/users',{method:'POST',body:JSON.stringify(f)});
        const data = await res.json().catch(() =>({}));
        if(!res.ok) {this.modalMessage = data.error || 'Failed';return;}
        this.closeModal();
        await this.loadUsers();
        await this.loadAudit();
      }catch(e){
        if (e.message !== 'unauthorized') this.modalMessage = String(e);
      }
    },



    openEdit(u){
      this.editForm = {username:u.username,displayName:u.displayName || '',role:u.role || 'checker',password: '' };
      this.modalMessage= '';
      this.showEdit = true;
    },
    openDelete(u){
      this.deleteTarget = u;
      this.modalMessage='';
      this.showDelete = true;
    },
    closeModal(){
      this.showEdit = false;
      this.showAdd = false;
      this.showDelete = false;
      this.modalMessage = '';

    },
    async saveEdit(){
      const f = this.editForm;
      try{
        const res = await this.authFetch('/api/users/' + encodeURIComponent(f.username),{
          method: 'PUT',
          body: JSON.stringify({displayName: f.displayName, role: f.role,password: f.password || undefined}),
        });
        const data = await res.json().catch(() => ({}));
        if(!res.ok) {this.modalMessage = data.error || 'Failed';return;}
        this.closeModal();
        await this.loadUsers();
        await this.loadAudit();
      }catch(e){
        if(e.message !== 'unauthorized') this.modalMessage = String(e);
      }
    },
    async confirmDelete(){
      try{
        const res = await this.authFetch('/api/users/' + encodeURIComponent(this.deleteTarget.username),{method:'DELETE'});
        const data = await res.json().catch(() => ({}));
        if(!res.ok) {this.modalMessage = data.error || 'Failed'; return;}
        this.closeModal();
        await this.loadUsers();
        await this.loadAudit();
      }catch(e){
        if (e.message !=='unauthorized') this.modalMessage = String(e);
      }
    },

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



้

<style scoped>
.inp { padding: 8px 10px; border: 1px solid #cfd4dc; border-radius: 8px; font-size: 14px; }
.modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
.modal-box { background: #fff; border-radius: 14px; padding: 22px; width: 100%; max-width: 720px; box-shadow: 0 10px 40px rgba(0,0,0,.25); }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
</style>