<template>
  <div class="wrap">
    <div class="topbar">
      <span>👤 {{ user.username === 'guest' ? 'Login is currently disabled' : ('Logged in as ' + (user.displayName || user.username)) }}</span>
      <button v-if="user.username !== 'guest'" class="btn-logout" @click="$emit('logout')">Log out</button>
    </div>
    <h1>🗂 Manage ATM Sites</h1>

    <div class="toolbar">
      <button class="btn-save" @click="openNew">➕ Add new site</button>
      <span v-if="loading" style="font-size:13px;color:#888;">Loading...</span>
    </div>

        <div v-if="formOpen" class="admin-form">
      <div class="form-row">
        <label>ATMID</label>
        <input v-model="form.atmid" :disabled="editingAtmid !== null" placeholder="e.g. 01000100" />
      </div>
      <div class="form-row">
        <label>Adress</label>
        <input v-model="form.adress" placeholder="Branch / location name" />
      </div>
      <div class="form-row">
        <label>IP_CAM</label>
        <input v-model="form.ipCam" placeholder="10.0.1.3" />
      </div>
      <div class="form-row">
        <label>Video_IP</label>
        <input v-model="form.videoIp" placeholder="10.0.1.4" />
      </div>
      <div class="form-row">
        <label>Alert email</label>
        <input v-model="form.email" placeholder="branch@example.com" />
      </div>
      <div class="form-actions">
        <button class="btn-save" @click="save" :disabled="saving">
          {{ saving ? 'Saving...' : (editingAtmid ? 'Update' : 'Create') }}
        </button>
        <button class="btn-reset" @click="closeForm">Cancel</button>
      </div>
    </div>

    <div class="table-scoll">
        <table>
            <thead>
                <tr>
                    <th>ATM</th>
                    <th>Aress</th>
                    <th>IP_CAM</th>
                    <th>Video_IP</th>
                    <th>Alert email</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="site in sites" :key="site.atmid">
                    <td>{{site.atmid}}</td>
                    <td class="loc">{{ site.adress }}</td>
                    <td>{{ site.ipCam }}</td>
                    <td>{{ site.videoIp }}</td>
                    <td>{{ site.email }}</td>
                    <td>
                    <button class="btn-reset" @click="openEdit(site)">Edit</button>
                    <button button class="btn-reset" @click="remove(site)">Delete</button>

                    </td>
                </tr>
                <tr v-if="sites.length === 0">
                    <td colspan="6" style="padding: :24px,color:#999;">No ATM site yet.</td>
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
        user:{type;Object,required:true},
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
        };
    },
    methods:{
async authFetch(url, options = {}) {
      const res = await fetch(url, {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: `Bearer ${this.token}`,
        },
      });

        if (res.status === 401){
            alert('Your session has expired . please lohin angain');
            this.$emit('Logout');
            throw new Error('unauthorized');
            }
            return res;
        },
        async load(){
            
        }

    }
}

</script>