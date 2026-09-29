<template>
  <div class="login-wrap">
    <h1> Sign in</h1>
    <div class="sub"> ATM Camera Checklist</div>

    <form @submit.prevent="submit">
      <label>Username</label>
      <input v-model="username" type="text" autocomplete="username" required/>

      <label>password</label>
      <input v-model="password" type="password" autocomplete="current-password" required/>
      <button class="btn-login" type="submit" :disabled="loading">
        {{ loading? 'Signing in...':'Sign in' }}
      </button>
      <div class="error" v-if="error">{{ error }}</div>
    </form>
  </div>
</template>





<script>

export default{
  name:'login',
  emits:['login-sucess'],
  data(){
    return{
      username:'',
      password:'',
      loading:false,
      error:'',
    };
  },
  methods:{
    async submit(){
      this.loading = true;
      this.error ='';
      
      try{
        const res = await fetch('/api/login',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({username:this.username,password:this.password}),
        });
        const data = await res.json();
        if(res.ok && data.ok){
          this.$emit('login-success',{token:data.token,user:data.user});

        }else{
          this.error = data.error || 'login failed';
        }
      } catch(e){
        this.error= 'Could not reach the server.' +e;
      }finally{
        this.loading = false;
      }
    },
  },
};

</script>