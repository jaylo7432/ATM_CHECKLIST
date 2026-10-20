<template>
  <div class="wrap">
    <div class="topbar">
      <span>👤 {{ user.username === 'guest' ? 'Login is currently disabled' : ('Logged in as ' + (user.displayName || user.username)) }}</span>
      <button v-if="user.username !== 'guest'" class="btn-logout" @click="$emit('logout')">Log out</button>
    </div>
    <h1>📶 SIM / Alarm Check</h1>
    <PageTabs page="simcheck" @navigate="$emit('navigate', $event)" />

    <div class="toolbar">
      <label>Date: <input type="date" v-model="date" @change="load" /></label>
      <button class="btn-save" :disabled="saving" @click="save">
        {{ saving ? 'Saving...' : '💾 Save & send alerts' }}
      </button>
      <button class="btn-reset" @click="resetAll">✖ Clear all boxes</button>
      <button class="btn-reset" @click="exportPdf" :disabled="exporting">
        {{ exporting ? 'Creating PDF...' : '📄 Export PDF' }}
      </button>
      <label style="cursor:pointer;"><input type="checkbox" v-model="onlyProblems" /> Show only problems</label>
      <span v-if="loading" style="font-size:13px;color:#888;">Loading...</span>
      <span class="status-pill" :class="saved ? 'saved' : 'unsaved'">
      {{ saved ? ('Saved at ' + savedAt) : 'Not saved' }}
</span>
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
            <th rowspan="2">IP</th>
            <th colspan="2" class="col-group-title">Connection Status</th>
            <th colspan="2" class="col-group-title">Alarm</th>
            <th colspan="2" class="col-group-title">Connect Type</th>
            <th colspan="2" class="col-group-title">Status</th>
          </tr>
          <tr>
            <th>Connect</th>
            <th>Disconnect</th>
            <th>Off</th>
            <th>On</th>
            <th>WAN</th>
            <th>GPRS</th>
            <th>Connect</th>
            <th>Disconnect</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="item in groupedRows">
            <tr v-if="item.type === 'header'" :key="'h-' + item.province" class="province-header">
              <td colspan="12"> {{ item.province }}</td>
            </tr>
               <tr v-else :key="'r-' + item.row.atmid" :class="{ 'row-error': isFault(item.row) }">
              <td>{{ item.stt }}</td>
              <td>{{ item.row.atmid }}</td>
              <td class="loc">{{ item.row.adress }}</td>
              <td>{{ item.row.ip }}</td>

               <td class="box"><input type="checkbox" v-model="item.row.connStatusConnect" @change="toggleExclusive(item.row, 'connStatusConnect', 'connStatusDisconnect', $event)" /></td>
               <td class="box"><input type="checkbox" v-model="item.row.connStatusDisconnect" @change="toggleExclusive(item.row, 'connStatusDisconnect', 'connStatusConnect', $event)" /></td>

               <td class="box"><input type="checkbox" v-model="item.row.alarmOff" @change="toggleExclusive(item.row, 'alarmOff', 'alarmOn', $event)" /></td>
               <td class="box"><input type="checkbox" v-model="item.row.alarmOn" @change="toggleExclusive(item.row, 'alarmOn', 'alarmOff', $event)" /></td>

               <td class="box"><input type="checkbox" v-model="item.row.connectTypeWan" @change="toggleExclusive(item.row, 'connectTypeWan', 'connectTypeGprs', $event)" /></td>
               <td class="box"><input type="checkbox" v-model="item.row.connectTypeGprs" @change="toggleExclusive(item.row, 'connectTypeGprs', 'connectTypeWan', $event)" /></td>

               <td class="box"><input type="checkbox" v-model="item.row.statusConnect" @change="toggleExclusive(item.row, 'statusConnect', 'statusLost', $event)" /></td>
               <td class="box"><input type="checkbox" v-model="item.row.statusLost" @change="toggleExclusive(item.row, 'statusLost', 'statusConnect', $event)" /></td>
            </tr>
          </template>
          <tr v-if="groupedRows.length === 0">
            <td colspan="12" style="padding:24px;color:#999;">{{ onlyProblems ? 'No problems found.' : 'No data.' }}</td>
          </tr>
        </tbody>

      </table>
    </div>
  </div>
</template>

<script>
import PageTabs from './PageTabs.vue';

const DEFAULT_CHECKED = {
  connStatusConnect:true,
  alarmOff:true,
  connectTypeWan:true,
  statusConnect:true,
};

export default{
  name :'SimScheck',
  props :{
    token:{type:String,required:true},
    user:{type:Object,required:true},
  },
  components: { PageTabs },
  emits:['logout','navigate'],
  data(){
    return{
      date:new Date().toISOString().slice(0,10),
      rows:[],
      loading:false,
      saving:false,
      savedAt:null,
      emailReport:null,
      exporting:false,
      onlyProblems:false,
    };
  },
  computed:{
    groupedRows(){
        const sorted = this.rows.filter((r) => !this.onlyProblems || this.isFault(r)).sort((a, b) => {
        const pa = String(a.province || '').localeCompare(String(b.province || ''));
        if (pa !== 0) return pa;
        return String(a.atmid || '').localeCompare(String(b.atmid || ''));
      });
      const items = [];
      let currentProvince = null;
      let stt = 0;
      for (const row of sorted) {
        const province = row.province || 'Unassigned';
        if (province !== currentProvince) {
          currentProvince = province;
          stt = 0;
          items.push({ type: 'header', province });
        }
        stt += 1;
        items.push({ type: 'row', row, stt });
      }
      return items;
    },
  },
  methods:{
    async authFetch(url,options = {}){
      const res = await fetch(url,{
        ...options,
        headers:{
          ...(options.headers || {}),
          Authorization: `Bearer ${this.token}`,
        },
      });
      if(res.status === 401){
        alert('Your session has expired. Please login again');
        this.$emit('logout');
        throw new Error('unauthorized');
      }
      return res;
    },
    async load(){
      this.loading = true;
      this.savedAt =null;
      this.saved = false;
      try{
        const res = await this.authFetch(`/api/simcheck?date=${this.date}`);
        const data = await res.json();
        this.rows = data.rows || [];
        this.savedAt = data.savedAt || null;
        this.saved = !! data.savedAt;
      }catch(e){
      if(e.message!=='unauthorized') alert('Failed to load: ' + e);
    } finally{
      this.loading = false;
    }
  },
  resetAll(){
    this.rows = this.rows.map((row) =>{
      const cleared = { atmid: row.atmid, adress: row.adress, ip: row.ip };
        Object.keys(DEFAULT_CHECKED).forEach((k) => {});
        ['connStatusConnect', 
        'connStatusDisconnect', 
        'alarmOff', 'alarmOn', 
        'connectTypeWan', 
        'connectTypeGprs', 
        'statusConnect', 
        'statusLost'].forEach((key) => {cleared[key] = !!DEFAULT_CHECKED[key];
    });
    return cleared;
  });
  this.savedAt=null;
  this.saved = false;
},
isFault(row){
  return !!(row.connStatusDisconnect || row.alarmOn || row.connectTypeGprs || row.statusLost);
},
    toggleExclusive(row, changedKey, pairKey, event) {
      if (event.target.checked) {
        row[pairKey] = false;
      }
      this.saved = false;
    },

    async exportPdf(){
      this.exporting = true;
      try{
        const res = await this.authFetch(`/api/report/simpdf?date=${this.date}`);
        if(!res.ok){
          const err = await res.json().catch(() => ({}));
          alert(err.error || 'Export failed');
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sim-check-${this.date}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }catch(e){
        if(e.message !== 'unauthorized') alert('Export failed: '+ e);
      }finally{
        this.exporting = false;
      }
    },

async save(){
  this.saving = true;
  try{
    const res = await this.authFetch('/api/simcheck',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({date:this.date,rows:this.rows}),
    });
    const data = await res.json();
    if(!data.ok){
      alert('Save failed :' + (data.error || 'unknow error'));
      return;
    }
    this.savedAt = new Date().toLocaleTimeString();
    this.saved = true;
    this.emailReport = data.email || null;
  }catch (e){
    if(e.message !=='unauthorized') alert('Save failed:' + e);
  }finally{
    this.saving = false;
  }
  },
},
mounted(){
  this.load();
},
};


</script>