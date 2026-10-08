<template>
  <div class="wrap">
    <div class="topbar">
      <span>👤 {{ user.username === 'guest' ? 'Login is currently disabled' : ('Logged in as ' + (user.displayName || user.username)) }}</span>
      <button v-if="user.username !== 'guest'" class="btn-logout" @click="$emit('logout')">Log out</button>
    </div>
    <h1> Manage ATM Sites</h1>

    <div class="toolbar">
      <button class="btn-save" @click="openNew">➕ Add new site</button>
      <span v-if="loading" style="font-size:13px;color:#888;">Loading...</span>
    </div>

    <div v-if="formOpen" class="modal-overlay" @click.self="closeForm">
    <div class="admin-form">
      <div class="modal-header">
        <h2>{{ editingAtmid ? 'Edit site' : 'Add new site' }}</h2>
        <button class="btn-close" @click="closeForm">✕</button>
      </div>
      <div class="form-row">
        <label>ATMID</label>

        <div class="form-field">
          <input
            v-model="form.atmid"
            :disabled="editingAtmid !== null"
            :class="{ invalid: errors.atmid }"
            @input="validateField('atmid')"
            placeholder="e.g. 01000100"
          />
          <span v-if="errors.atmid" class="field-error">{{ errors.atmid }}</span>
        </div>
      </div>
      <div class="form-row">
        <label>Adress</label>
        <div class="form-field">
          <input
            v-model="form.adress"
            :class="{ invalid: errors.adress }"
            @input="validateField('adress')"
            placeholder="Branch / location name"
          />
          <span v-if="errors.adress" class="field-error">{{ errors.adress }}</span>
        </div>
      </div>
      <div class="form-row">
        <label>IP_CAM</label>
        <div class="form-field">
          <input
            v-model="form.ipCam"
            :class="{ invalid: errors.ipCam }"
            @input="validateField('ipCam')"
            placeholder="10.0.1.3"
          />
          <span v-if="errors.ipCam" class="field-error">{{ errors.ipCam }}</span>
        </div>
      </div>
      <div class="form-row">
        <label>Video_IP</label>
        <div class="form-field">
          <input
            v-model="form.videoIp"
            :class="{ invalid: errors.videoIp }"
            @input="validateField('videoIp')"
            placeholder="10.0.1.4"
          />
          <span v-if="errors.videoIp" class="field-error">{{ errors.videoIp }}</span>
        </div>
      </div>
      <div class="form-row">
        <label>Alert email</label>
        <div class="form-field">
          <input
            v-model="form.email"
            :class="{ invalid: errors.email }"
            @input="validateField('email')"
            placeholder="branch@example.com"
          />
          <span v-if="errors.email" class="field-error">{{ errors.email }}</span>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn-save" @click="save" :disabled="saving || hasErrors">
          {{ saving ? 'Saving...' : (editingAtmid ? 'Update' : 'Create') }}
        </button>
        <button class="btn-reset" @click="closeForm">Cancel</button>
      </div>
    </div>
    </div>

    <div class="table-scroll">
        <table>
            <thead>
                <tr>
                    <th rowspan="2">ATM</th>
                    <th rowspan="2">Adress</th>
                    <th rowspan="2">IP_CAM</th>
                    <th rowspan="2">Video_IP</th>
                    <th rowspan="2">Alert email</th>
                    <th rowspan="2"></th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="site in sites" :key="site.atmid">
                    <td>{{ site.atmid }}</td>
                    <td class="loc">{{ site.adress }}</td>
                    <td>{{ site.ipCam }}</td>
                    <td>{{ site.videoIp }}</td>
                    <td>{{ site.email }}</td>
                    <td>
                      <button class="btn-reset" @click="openEdit(site)">Edit</button>
                      <button class="btn-reset" @click="remove(site)">Delete</button>
                    </td>
                </tr>
                <tr v-if="sites.length === 0">
                    <td colspan="6" style="padding:24px;color:#999;">No ATM site yet.</td>
                </tr>
            </tbody>
        </table>
    </div>
  </div>
</template>


<script>
export default{
    name:"AtmAdmin",
    props:{
        token:{type:String,required:true},
        user:{type:Object,required:true},
    },
    emits:['logout'],
    data(){
        return{
            sites:[],
            loading:false,
            saving:false,
            formOpen:false,
            editingAtmid:null,
            form: { atmid: '', adress: '', ipCam: '', videoIp: '', email: '' },
            errors:{ atmid: '', adress: '', ipCam: '', videoIp: '', email: '' },
        };
    },

    computed: {
      hasErrors() {
        return Object.values(this.errors).some((e) => !!e);
      },
    },

    methods: {
      async authFetch(url, options = {}) {
        const res = await fetch(url, {
          ...options,
          headers: {
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
      async load() {
        this.loading = true;
        try {
          const res = await this.authFetch('/api/atms');
          const data = await res.json();
          this.sites = data.rows || [];
        } catch (e) {
          if (e.message !== 'unauthorized') alert('Failed to load sites: ' + e);
        } finally {
          this.loading = false;
        }
      },
      openNew() {
        this.editingAtmid = null;
        this.form = { atmid: '', adress: '', ipCam: '', videoIp: '', email: '' };
        this.errors = { atmid: '', adress: '', ipCam: '', videoIp: '', email: '' };
        this.formOpen = true;
      },
      openEdit(site) {
        this.editingAtmid = site.atmid;
        this.form = { ...site };
        this.errors = { atmid: '', adress: '', ipCam: '', videoIp: '', email: '' };
        this.formOpen = true;
      },
      closeForm() {
        this.formOpen = false;
      },

      validateField(field) {
        const v = (this.form[field] || '').trim();
        const numDotPattern = /^[0-9.]+$/;

        if (field === 'atmid') {
          if (!v) this.errors.atmid = 'ATMID is required';
          else if (!/^[0-9]+$/.test(v)) this.errors.atmid = 'ATMID must be numbers only';
          else this.errors.atmid = '';
        }

        if (field === 'adress') {
          this.errors.adress = v ? '' : 'Adress is required';
        }

        if (field === 'ipCam') {
          if (!v) this.errors.ipCam = '';
          else if (!numDotPattern.test(v)) this.errors.ipCam = 'IP_CAM must be numbers and dots only, e.g. 10.0.1.3';
          else this.errors.ipCam = '';
        }

        if (field === 'videoIp') {
          if (!v) this.errors.videoIp = '';
          else if (!numDotPattern.test(v)) this.errors.videoIp = 'Video_IP must be numbers and dots only, e.g. 10.0.1.4';
          else this.errors.videoIp = '';
        }

        if (field === 'email') {
          if (!v) this.errors.email = '';
          else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) this.errors.email = 'Not a valid email address';
          else this.errors.email = '';
        }
      },
      validateAll() {
        ['atmid', 'adress', 'ipCam', 'videoIp', 'email'].forEach((f) => this.validateField(f));
        return !this.hasErrors;
      },

      async save() {
        if (!this.validateAll()) return;
        this.saving = true;

        try {
          let res;
          if (this.editingAtmid) {
            res = await this.authFetch(`/api/atms/${encodeURIComponent(this.editingAtmid)}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(this.form),
            });
          } else {
            res = await this.authFetch('/api/atms', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(this.form),
            });
          }
          const data = await res.json();
          if (!data.ok) {
            alert('Save failed: ' + (data.error || 'unknown error'));
            return;
          }
          this.formOpen = false;
          await this.load();
        } catch (e) {
          if (e.message !== 'unauthorized') alert('Save failed: ' + e);
        } finally {
          this.saving = false;
        }
      },
      async remove(site) {
        if (!confirm(`Delete ${site.atmid} (${site.adress})? This cannot be undone.`)) return;
        try {
          const res = await this.authFetch(`/api/atms/${encodeURIComponent(site.atmid)}`, { method: 'DELETE' });
          const data = await res.json();
          if (!data.ok) {
            alert('Delete failed: ' + (data.error || 'unknown error'));
            return;
          }
          await this.load();
        } catch (e) {
          if (e.message !== 'unauthorized') alert('Delete failed: ' + e);
        }
      },
    },
    mounted(){
      this.load();
    },
}
</script>

<style scoped>
thead tr:last-child th {
  top: 0;
}

</style>