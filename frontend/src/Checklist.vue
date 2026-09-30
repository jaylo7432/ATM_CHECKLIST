<template>
  <div class="wrap">
    <div class="topbar">
      <span>👤 {{ user.username === 'guest' ? 'Login is currently disabled' : ('Logged in as ' + (user.displayName || user.username)) }}</span>
      <button v-if="user.username !== 'guest'" class="btn-logout" @click="$emit('logout')">Log out</button>
    </div>
    <h1>📋 Daily ATM Check</h1>

    <div class="toolbar">
      <div>
        <label>Inspection date</label>
        <input type="date" v-model="date" @change="loadDate" />
      </div>
      <button class="btn-reset" @click="resetAll">✖ Clear all boxes</button>
      <button class="btn-save" @click="save" :disabled="saving">
        {{ saving ? 'Saving...' : '💾 Save & send alerts' }}
      </button>
      <button class="btn-reset" @click="exportPdf" :disabled="exporting">
        {{ exporting ? 'Creating PDF...' : '📄 Export PDF' }}
      </button>
      <span class="status-pill" :class="saved ? 'saved' : 'unsaved'">
        {{ saved ? ('Saved at ' + savedAtDisplay) : 'Not saved' }}
      </span>
      <span v-if="loading" style="font-size:13px;color:#888;">Loading...</span>
    </div>

    <div class="email-report" v-if="emailReport">
      <div v-if="emailReport.note" class="note">ℹ️ {{ emailReport.note }}</div>
      <div v-if="emailReport.sent !== undefined">
        Alert emails sent: <b>{{ emailReport.sent }}</b> site(s) successful,
        <b>{{ emailReport.skipped }}</b> site(s) failed to send.
      </div>
      <div
        v-for="r in (emailReport.results || [])"
        :key="r.atmid"
        :class="r.ok ? 'line-ok' : 'line-err'"
      >
        {{ r.ok ? '✔' : '✖' }} {{ r.location }} ({{ r.atmid }}) {{ r.ok ? ('→ ' + r.to) : ('- ' + r.reason) }}
      </div>
    </div>


 <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th rowspan="2">ST<br />T</th>
            <th rowspan="2">ATMID</th>
            <th rowspan="2">Adress</th>
            <th rowspan="2">IP_CAM</th>
            <th rowspan="2">Video_IP</th>
            <th colspan="2" class="col-group-title">Cam_Status</th>
            <th colspan="2" class="col-group-title">Cam_work</th>
            <th colspan="2" class="col-group-title">DRV_Status</th>
            <th colspan="2" class="col-group-title">Cam_save</th>
          </tr>
          <tr>
            <th class="sub">connect</th>
            <th class="sub">disconnect</th>
            <th class="sub">connect</th>
            <th class="sub">disconnect</th>
            <th class="sub">connect</th>
            <th class="sub">disconnect</th>
            <th class="sub">connect</th>
            <th class="sub">disconnect</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in rows" :key="idx" :class="{ 'row-error': hasError(row) }">
            <td>{{ idx + 1 }}</td>
            <td class="readonly-cell">{{ row.atmid }}</td>
            <td class="loc readonly-cell">{{ row.adress }}</td>
            <td class="readonly-cell">{{ row.ipCam }}</td>
            <td class="readonly-cell">{{ row.videoIp }}</td>
            <td class="box"><input type="checkbox" v-model="row.camConectConnect" @change="toggleExclusive(row, 'camConectConnect', 'camConectDisconnect', $event)" /></td>
            <td class="box"><input type="checkbox" v-model="row.camConectDisconnect" @change="toggleExclusive(row, 'camConectDisconnect', 'camConectConnect', $event)" /></td>
            <td class="box"><input type="checkbox" v-model="row.camWorkConnect" @change="toggleExclusive(row, 'camWorkConnect', 'camWorkDisconnect', $event)" /></td>
            <td class="box"><input type="checkbox" v-model="row.camWorkDisconnect" @change="toggleExclusive(row, 'camWorkDisconnect', 'camWorkConnect', $event)" /></td>
            <td class="box"><input type="checkbox" v-model="row.drvConectConnect" @change="toggleExclusive(row, 'drvConectConnect', 'drvConectDisconnect', $event)" /></td>
            <td class="box"><input type="checkbox" v-model="row.drvConectDisconnect" @change="toggleExclusive(row, 'drvConectDisconnect', 'drvConectConnect', $event)" /></td>
            <td class="box"><input type="checkbox" v-model="row.camSaveConnect" @change="toggleExclusive(row, 'camSaveConnect', 'camSaveDisconnect', $event)" /></td>
            <td class="box"><input type="checkbox" v-model="row.camSaveDisconnect" @change="toggleExclusive(row, 'camSaveDisconnect', 'camSaveConnect', $event)" /></td>
          </tr>
          <tr v-if="rows.length === 0">
            <td colspan="13" style="padding:24px;color:#999;">No data for this date.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="legend">
      <div>MARK <b>disconnect</b> **Select any field. If an issue is found, an email notification will be sent automatically when you click Save.**</div>
    </div>
  </div>
</template>

<script>
function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// The 8 independent checkboxes on the sheet — connect/disconnect are
// NOT mutually exclusive (no radio buttons), matching the paper form.

const CHECKBOX_FIELDS = [
  'camConectConnect', 'camConectDisconnect',
  'camWorkConnect', 'camWorkDisconnect',
  'drvConectConnect', 'drvConectDisconnect',
  'camSaveConnect', 'camSaveDisconnect',
];

// A row counts as a fault if any of the 4 "disconnect" boxes is checked.
const FAULT_FIELDS = ['camConectDisconnect', 'camWorkDisconnect', 'drvConectDisconnect', 'camSaveDisconnect'];

export default {
  name: 'Checklist',
  props: {
    token: { type: String, required: true },
    user: { type: Object, required: true },
  },

  emits: ['logout'],
  data() {
    return {
      date: todayStr(),
      rows: [],
      saved: false,
      savedAt: null,
      loading: false,
      saving: false,
      exporting:false,
      emailReport: null,
    };
  },
  computed: {
    savedAtDisplay() {
      if (!this.savedAt) return '';
      const d = new Date(this.savedAt);
      return d.toLocaleString('en-US');
    },
  },
  methods: {
    hasError(row) {
      return FAULT_FIELDS.some((key) => row[key]);
    },

    toggleExclusive(row, changedKey, pairKey, event) {
      if (event.target.checked) {
        row[pairKey] = false;
      }
      this.saved = false;
    },


    // fetch wrapper that attaches the login token and logs the user out
    // automatically if the session has expired (401 response)

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
    async loadDate() {
      this.loading = true;
      this.emailReport = null;
      try {
        const res = await this.authFetch(`/api/checklist?date=${this.date}`);
        const data = await res.json();
        this.rows = data.rows || [];
        this.saved = !!data.saved;
        this.savedAt = data.savedAt || null;
      } catch (e) {
        if (e.message !== 'unauthorized') alert('Failed to load data: ' + e);
      } finally {
        this.loading = false;
      }
    },

    
    resetAll() {
      if (!confirm('Clear every checkbox on this sheet?')) return;
      this.rows.forEach((r) => {
        CHECKBOX_FIELDS.forEach((key) => {
          // keep the first box (Cam_conect / connect) ticked, clear the rest
          r[key] = ['camConectConnect', 'camWorkConnect', 'drvConectConnect', 'camSaveConnect'].includes(key);
        });
      });
      this.saved = false;
      this.emailReport = null;
    },

        async exportPdf() {
      this.exporting = true;
      try {
        const res = await this.authFetch(`/api/report/pdf?date=${this.date}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(err.error || 'Export failed');
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `atm-checklist-${this.date}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        if (e.message !== 'unauthorized') alert('Export failed: ' + e);
      } finally {
        this.exporting = false;
      }
    },


    async save() {
      this.saving = true;
      this.emailReport = null;
      try {
        const res = await this.authFetch('/api/checklist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: this.date, rows: this.rows }),
        });
        const data = await res.json();
        if (data.ok) {
          this.saved = true;
          this.savedAt = data.savedAt;
          this.emailReport = data.email || null;
        } else {
          alert('Save failed: ' + (data.error || 'unknown error'));
        }
      } catch (e) {
        if (e.message !== 'unauthorized') alert('Save failed: ' + e);
      } finally {
        this.saving = false;
      }
    },
  },
  mounted() {
    this.loadDate();
  },
};
</script>


