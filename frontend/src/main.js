import { createApp } from 'vue';
import App from './App.vue';
import './style.css';

createApp(App).mount('#app');

(function (){
    const KEY = 'atm_theme';
    const root = document.documentElement;
    const btn = document.createElement('button');
    btn.className = 'theme-toggle';

    function loadPref(){
        try{return  localStorage.getItem(KEY);} catch(e){return null;}
    }

    function savePref(v){
        try {localStorage.setItem(KEY,v); }catch (e){/* */}
    }
    let dark = loadPref() === 'dark';

    function apply(){
        root.classList.toggle('dark',dark);
        btn.textContent = dark ? '☀️' : '🌙';
        btn.title = dark? 'light mode' : 'Dark mode';
    }

    btn.addEventListener('click',function(){
        dark = !dark;
        savePref(dark? 'dark' : 'light');
        apply();
    });
    document.body.appendChild(btn);
    apply();
    })();