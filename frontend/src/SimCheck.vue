<template>
  <div class="wrap">
    <div class="topbar">
      <span>👤 {{ user.username === 'guest' ? 'Login is currently disabled' : ('Logged in as ' + (user.displayName || user.username)) }}</span>
      <button v-if="user.username !== 'guest'" class="btn-logout" @click="$emit('logout')">Log out</button>
    </div>
    <h1>📶 SIM / Alarm Check</h1>

    <div class="toolbar">
      <label>Date: <input type="date" v-model="date" @change="load" /></label>
      <button class="btn-save" :disabled="saving" @click="save">
        {{ saving ? 'Saving...' : '💾 Save' }}
      </button>
      <button class="btn-reset" @click="resetAll">Clear</button>
      <span v-if="loading" style="font-size:13px;color:#888;">Loading...</span>
      <span v-if="savedAt" style="font-size:13px;color:#2a8f4a;">Saved at {{ savedAt }}</span>
    </div>

    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th rowspan="2">ATMID</th>
            <th rowspan="2">Adress</th>
            <th rowspan="2">Alarm IP</th>
            <th colspan="2">Connection Status</th>
            <th colspan="2">Alarm</th>
            <th colspan="2">Connect Type</th>
            <th colspan="2">Status</th>
          </tr>
          <tr>
            <th>Connected</th>
            <th>Disconnected</th>
            <th>Off</th>
            <th>On</th>
            <th>WAN</th>
            <th>GPRS</th>
            <th>Connect</th>
            <th>Connection Lost</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.atmid" :class="{ fault: isFault(row) }">
            <td>{{ row.atmid }}</td>
            <td class="loc">{{ row.adress }}</td>
            <td>{{ row.ipBaoDong }}</td>

            <td><input type="checkbox" v-model="row.connStatusConnect" @change="toggleExclusive(row, 'connStatusConnect', 'connStatusDisconnect', $event)" /></td>
            <td><input type="checkbox" v-model="row.connStatusDisconnect" @change="toggleExclusive(row, 'connStatusDisconnect', 'connStatusConnect', $event)" /></td>

            <td><input type="checkbox" v-model="row.alarmOff" @change="toggleExclusive(row, 'alarmOff', 'alarmOn', $event)" /></td>
            <td><input type="checkbox" v-model="row.alarmOn" @change="toggleExclusive(row, 'alarmOn', 'alarmOff', $event)" /></td>

            <td><input type="checkbox" v-model="row.connectTypeWan" @change="toggleExclusive(row, 'connectTypeWan', 'connectTypeGprs', $event)" /></td>
            <td><input type="checkbox" v-model="row.connectTypeGprs" @change="toggleExclusive(row, 'connectTypeGprs', 'connectTypeWan', $event)" /></td>

            <td><input type="checkbox" v-model="row.statusConnect" @change="toggleExclusive(row, 'statusConnect', 'statusLost', $event)" /></td>
            <td><input type="checkbox" v-model="row.statusLost" @change="toggleExclusive(row, 'statusLost', 'statusConnect', $event)" /></td>
          </tr>
          <tr v-if="rows.length === 0">
            <td colspan="11" style="padding:24px;color:#999;">No data.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script>
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
  emits:['logout'],
  data(){
    return{
      date:new Date().toISOString().slice(0,10),
      rows:[],
      loading:false,
      saving:false,
      savedAt:null,
    };
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
      try{
        const res = await this.authFetch(`/api/simcheck?date=${this.date}`);
        const data = await res.json();
        this.rows = data.rows || [];
        this.savedAt = data.savedAt || null;
      }catch(e){
      if(e.message!=='unauthorized') alert('Failed to load: ' + e);
    } finally{
      this.loading = false;
    }
  },
  resetAll(){
    this.rows = this.rows.map((row) =>{
      const cleared = { atmid: row.atmid, adress: row.adress, ipBaoDong: row.ipBaoDong };
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
},
isFault(row){
  return !!(row.connStatusDisconnect || row.alarmOn || row.connectTypeGprs || row.statusLost);
},
    toggleExclusive(row, changedKey, pairKey, event) {
      if (event.target.checked) {
        row[pairKey] = false;
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