<template>
  <div class="lg-page" :style="pageStyle" @mousemove="onMove" @mouseleave="onLeave">
    <div class="lg-bg" aria-hidden="true">
      <div class="lg-par">
        <span class="lg-orb lg-orb1"></span>
        <span class="lg-orb lg-orb2"></span>
        <span class="lg-orb lg-orb3"></span>
        <span class="lg-grid"></span>
      </div>
    </div>

    <div class="lg-shell" :style="shellStyle">
      <aside class="lg-brand">
        <div class="lg-cam" aria-hidden="true">
          <svg viewBox="0 0 200 200" class="lg-camsvg">
            <circle class="lg-ring lg-r1" cx="100" cy="100" r="46" />
            <circle class="lg-ring lg-r2" cx="100" cy="100" r="46" />
            <circle class="lg-ring lg-r3" cx="100" cy="100" r="46" />
            <circle cx="100" cy="100" r="48" fill="rgba(255,255,255.12)" stroke="#fff" stroke-width="3" />
            <circle cx="100" cy="100" r="32" fill="#0a1f5c" stroke="rgba(255,255,255,.7)" stroke-width="2" />
            <circle cx="100" cy="100" r="18" fill="#1f63ff"/>
            <circle class="lg-glint" cx="92" cy="92" r="6" fill="rgba(255,255,255,.85)" />
            <circle class="lg-rec" cx="152" cy="54" r="6" fill="#ff3b4e" />
          </svg>
          <span class="lg-live"><i></i>LIVE</span>
        </div>

        <div class="lg-brandtext">
          <h2>ATM Camera Checklist</h2>
          <p>Daily start-of-day inspection of cameras, DVRs, SIM and alarms.</p>
          <ul class="lg-points">
            <li><span>✓</span>Daily camera &amp; DVR checks</li>
            <li><span>✓</span>SIM / alarm monitoring</li>
            <li><span>✓</span>History &amp; PDF reports</li>
            </ul>
        </div>
        <div class="lg-clock">
          <div class="lg-time">{{ timeText }}</div>
          <div class="date-time">{{ dateText }}</div>
        </div>
      </aside>

      <main class="lg-card">
        <div class="lg-logobox">
          <img class="lg-logo" src="/logo.jpg" alt="LaoViet Bank" />
        </div>
        <p class="lg-hello">{{ greeting }} 👋</p>
        <h1>Sign inasdwwwwwdfgdgdfgdfgdfgdfgdfgd</h1>
      </main>

    </div>

</template>

<script>

</script>