<template>
  <div class="wrap">
    <div class="topbar">
      <span>👤 {{ user.username === 'guest' ? 'Login is currently disabled' : ('Logged in as ' + (user.displayName || user.username)) }}</span>
      <button v-if="user.username !== 'guest'" class="btn-logout" @click="$emit('logout')">Log out</button>
    </div>
    <h1>🕘 History</h1>
    <PageTabs page="history" @navigate="$emit('navigate', $event)" />

    <div class="toolbar">
      <div>
        <label>From</label>
        <input type="date" v-model="from" />
      </div>
      <div>
        <label>To</label>
        <input type="date" v-model="to" />
      </div>
      <label style="cursor:pointer;"><input type="checkbox" v-model="onlyProblems" /> Show only days with problems</label>
    </div>

    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th rowspan="2">Date</th>
            <th colspan="3">ATM Check</th>
            <th colspan="3">SIM Check</th>
            <th rowspan="2">PDF</th>
          </tr>
          <tr>
            <th>Checked</th><th>Problems</th><th>ATMID with problems</th>
            <th>Checked</th><th>Problems</th><th>ATMID with problems</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="8" style="padding:24px;color:#999;">Loading...</td></tr>
          <tr v-else-if="shown.length === 0"><td colspan="8" style="padding:24px;color:#999;">No data.</td></tr>
          <tr v-for="d in shown" :key="d.date" :class="{ 'row-error': totalFaults(d) > 0 }">
              <td class="loc">
              <a href="#" @click.prevent="openDay(d.date)" style="color:#1a56db;font-weight:600;text-decoration:none;">{{ d.date }}</a>
            </td>
            <td>{{ d.atm ? d.atm.total : '-' }}</td>
            <td>{{ d.atm ? d.atm.faults : '-' }}</td>
            <td>{{ ids(d.atm) }}</td>
            <td>{{ d.sim ? d.sim.total : '-' }}</td>
            <td>{{ d.sim ? d.sim.faults : '-' }}</td>
            <td>{{ ids(d.sim) }}</td>
            <td>
              <button class="btn-reset" :disabled="exporting === d.date" @click="exportPdf(d.date)">
                {{ exporting === d.date ? '...' : '📄 PDF' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

   <div v-if="day" class="modal-overlay" @click.self="closeDay">
      <div class="admin-form" style="padding:24px;">
        <div class="modal-header">
          <h2>Problems on {{ day }}</h2>
          <button class="btn-close" @click="closeDay">✕</button>
        </div>

        <div v-if="dayLoading" style="padding:16px;color:#999;">Loading...</div>
        <template v-else>
          <h3 style="margin:8px 0;">ATM Check Result ({{ dayAtm.length }})</h3>
          <div class="table-scroll">
            <table>
              <thead><tr><th>ATMID</th><th>Adress</th><th>Problem</th></tr></thead>
              <tbody>
                <tr v-if="dayAtm.length === 0"><td colspan="3" style="padding:12px;color:#999;">No problems.</td></tr>
                <tr v-for="r in dayAtm" :key="'a' + r.atmid" class="row-error">
                  <td class="loc">{{ r.atmid }}</td>
                  <td>{{ r.adress }}</td>
                  <td>{{ problemText(r, atmFields) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 style="margin:16px 0 8px;">SIM Check Result ({{ daySim.length }})</h3>
          <div class="table-scroll">
            <table>
              <thead><tr><th>ATMID</th><th>Adress</th><th>Problem</th></tr></thead>
              <tbody>
                <tr v-if="daySim.length === 0"><td colspan="3" style="padding:12px;color:#999;">No problems.</td></tr>
                <tr v-for="r in daySim" :key="'s' + r.atmid" class="row-error">
                  <td class="loc">{{ r.atmid }}</td>
                  <td>{{ r.adress }}</td>
                  <td>{{ problemText(r, simFields) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>


<script>
import PageTabs from './PageTabs.vue';

const ATM_FIELDS = [
  { key: 'camConectDisconnect', label: 'Cam_Status disconnect' },
  { key: 'camWorkDisconnect', label: 'Cam_work disconnect' },
  { key: 'drvConectDisconnect', label: 'DRV_Status disconnect' },
  { key: 'camSaveDisconnect', label: 'Cam_save disconnect' },
];
const SIM_FIELDS = [
  { key: 'connStatusDisconnect', label: 'Connection disconnect' },
  { key: 'alarmOn', label: 'Alarm on' },
  { key: 'connectTypeGprs', label: 'Connect type GPRS' },
  { key: 'statusLost', label: 'Status lost' },
];


export default {
  name: 'History',
  components: { PageTabs },
  props: { token: String, user: Object },
  emits: ['logout', 'navigate'],
  data() {
    return {
      days: [], loading: false, from: '', to: '', onlyProblems: false, exporting: '',
      day: '', dayLoading: false, dayAtm: [], daySim: [],
      atmFields: ATM_FIELDS, simFields: SIM_FIELDS,
    };
  },

  computed: {
    shown() {
      return this.days.filter((d) => {
        if (this.from && d.date < this.from) return false;
        if (this.to && d.date > this.to) return false;
        if (this.onlyProblems && this.totalFaults(d) === 0) return false;
        return true;
      });
    },
  },
  methods: {
        problemText(row, fields) {
      return fields.filter((f) => row[f.key]).map((f) => f.label).join(', ');
    },
    closeDay() {
      this.day = '';
    },
    async openDay(date) {
      this.day = date;
      this.dayLoading = true;
      this.dayAtm = [];
      this.daySim = [];
      try {
        const a = await (await this.authFetch(`/api/checklist?date=${date}`)).json();
        this.dayAtm = (a.rows || []).filter((r) => ATM_FIELDS.some((f) => r[f.key]));
        const s = await (await this.authFetch(`/api/simcheck?date=${date}`)).json();
        this.daySim = (s.rows || []).filter((r) => SIM_FIELDS.some((f) => r[f.key]));
      } catch (e) {
        if (e.message !== 'unauthorized') alert('Failed to load details: ' + e);
      } finally {
        this.dayLoading = false;
      }
    },
    

    totalFaults(d) {
      return (d.atm ? d.atm.faults : 0) + (d.sim ? d.sim.faults : 0);
    },
    ids(part) {
      if (!part || !part.faultIds || !part.faultIds.length) return '';
      const list = part.faultIds;
      return list.length > 3 ? list.slice(0, 3).join(', ') + ' +' + (list.length - 3) : list.join(', ');
    },
    async authFetch(url) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${this.token}` } });
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
        const res = await this.authFetch('/api/history');
        const data = await res.json();
        this.days = data.days || [];
      } catch (e) {
        if (e.message !== 'unauthorized') alert('Failed to load history: ' + e);
      } finally {
        this.loading = false;
      }
    },
    async exportPdf(date) {
      this.exporting = date;
      try {
        const res = await this.authFetch(`/api/report/allpdf?date=${date}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(err.error || 'Export failed');
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `atm-sim-${date}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        if (e.message !== 'unauthorized') alert('Export failed: ' + e);
      } finally {
        this.exporting = '';
      }
    },
  },
  mounted() {
    this.load();
  },
};
</script>