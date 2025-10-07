/* Lift Runner — v2.6 (D-pad DOM fuori dal gioco)
 * - D-pad DOM inserito via JS tra canvas e HUD: ← → hold, ↑/↓ tap, A=LIFT, B=TURBO (hold)
 * - Start overlay, Pausa, iPhone-friendly (pointer + touchAction:none)
 * - Lift UP/DOWN + auto-lift (150ms)
 * - Suoni WebAudio (sbloccati al primo input)
 * - Punteggio: tempo + sorpassi + lift; Best score su localStorage
 */

(() => {
  // ===== Canvas & UI =====
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const W = canvas.width, H = canvas.height;

  const timeEl  = document.getElementById('time');
  const scoreEl = document.getElementById('score');
  const liftBtn = document.getElementById('liftBtn');
  const pauseBtn= document.getElementById('pauseBtn');
  const wrap    = document.getElementById('gamewrap');

  // iPhone: blocca gesture/zoom
  canvas.style.touchAction = 'none';

  // Focus tastiera su desktop
  canvas.tabIndex = 0;
  const focusCanvas = ()=>{ try{ canvas.focus(); }catch{} };
  window.addEventListener('load', focusCanvas);
  canvas.addEventListener('pointerdown', focusCanvas);

  // ===== World =====
  const LANES = 3;
  const laneGap = 32;
  const levelY = { low: H - 120, high: H - 320 };
  const roadH = 12;
  const BASE_SCROLL = 3.0;

  const player = {
    x: 120, y: levelY.low - 2*laneGap,
    w: 50, h: 24,
    vx: 0,
    speed: 3.6, turbo: 6.4,
    level: 'low', lane: 1,
    alive: true, lifting: false,
    turboOn: false
  };

  const obstacles = [];   // {x,y,w,h,level,lane,speed,scored?}
  const lifts = [];       // {x,y,w,h,dir:'up'|'down',active,alignedLane}

  // ===== Audio (WebAudio) =====
  let actx=null, muted=false;
  const ensureAudio=()=>{ if(!actx){ try{ actx=new (window.AudioContext||window.webkitAudioContext)(); }catch{} } };
  const blip=(f=660, d=0.07, g=0.10, type='square')=>{
    if(muted || !actx) return; const t=actx.currentTime;
    const o=actx.createOscillator(), v=actx.createGain();
    o.type=type; o.frequency.setValueAtTime(f,t);
    v.gain.setValueAtTime(g,t); v.gain.linearRampToValueAtTime(0.0001,t+d);
    o.connect(v).connect(actx.destination); o.start(t); o.stop(t+d);
  };
  const sweep=(f0=420,f1=920,d=0.22,g=0.08)=>{
    if(muted || !actx) return; const t=actx.currentTime;
    const o=actx.createOscillator(), v=actx.createGain();
    o.type='sawtooth'; o.frequency.setValueAtTime(f0,t); o.frequency.exponentialRampToValueAtTime(f1,t+d);
    v.gain.value=g; v.gain.exponentialRampToValueAtTime(0.0001,t+d);
    o.connect(v).connect(actx.destination); o.start(t); o.stop(t+d);
  };
  const crash=()=>{
    if(muted || !actx) return; const t=actx.currentTime;
    const b=actx.createBuffer(1, actx.sampleRate*0.25, actx.sampleRate);
    const data=b.getChannelData(0); for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*Math.pow(1-i/data.length,2);
    const s=actx.createBufferSource(); const v=actx.createGain();
    v.gain.value=0.20; v.gain.exponentialRampToValueAtTime(0.0001,t+0.25);
    s.buffer=b; s.connect(v).connect(actx.destination); s.start(t);
  };
  ['pointerdown','keydown','touchstart','click'].forEach(t=>{
    window.addEventListener(t, ()=>{ ensureAudio(); actx && actx.resume && actx.resume();},{once:true,passive:true});
  });

  // ===== Spawn =====
  function spawnObstacle() {
    const level = Math.random()<0.5 ? 'low' : 'high';
    const lane = Math.floor(Math.random()*LANES);
    const lastX = obstacles.length ? obstacles[obstacles.length-1].x : W;
    const minGapX = 140 + Math.random()*90;
    obstacles.push({
      x: Math.max(W+40, lastX+minGapX),
      y: (level==='low'? levelY.low : levelY.high) - lane*laneGap - 6,
      w: 40, h: 20, level, lane,
      speed: BASE_SCROLL + Math.random()*1.2,
      scored:false
    });
  }
  function spawnLift(dir = (Math.random()<0.6 ? 'up' : 'down')) {
    const lane = 1, yBase = (dir==='up' ? levelY.low : levelY.high);
    const lastX = lifts.length ? lifts[lifts.length-1].x : W;
    const gap = 260 + Math.random()*160;
    lifts.push({
      x: Math.max(W+160, lastX+gap),
      y: yBase - lane*laneGap - 6,
      w: 140, h: 16, dir, active:true, alignedLane: lane
    });
  }
  for(let i=0;i<3;i++) spawnObstacle();
  spawnLift('up'); spawnLift('down');

  // ===== State =====
  let running=false, paused=false;
  let last=performance.now(), elapsed=0, score=0;
  let best = +localStorage.getItem('liftRunnerBest') || 0;

  // ===== Keyboard =====
  const keys=Object.create(null);
  const handled=new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS','Space','KeyL','KeyP','KeyR','KeyM']);
  window.addEventListener('keydown',e=>{
    const c=e.code||e.key; keys[c]=true;
    if(handled.has(c)) e.preventDefault();
    if(!running) startGame();
    if(c==='KeyP') togglePause();
    if(c==='KeyL') manualLift();
    if(c==='KeyM') muted=!muted;
    if(c==='Space') { player.turboOn=true; blip(460,0.04,0.06,'triangle'); }
    if(c==='KeyR' && !player.alive) toStart();
  },{passive:false});
  window.addEventListener('keyup',e=>{
    const c=e.code||e.key; keys[c]=false;
    if(handled.has(c)) e.preventDefault();
    if(c==='Space') { player.turboOn=false; blip(260,0.05,0.05,'triangle'); }
  },{passive:false});

  if(liftBtn)  liftBtn.addEventListener('click', ()=>{ ensureAudio(); actx&&actx.resume&&actx.resume(); manualLift(); if(!running) startGame(); });
  if(pauseBtn) pauseBtn.addEventListener('click', ()=>{ ensureAudio(); actx&&actx.resume&&actx.resume(); togglePause(); });

  // ===== D-pad DOM (fuori dal canvas) =====
  let holdLeft=false, holdRight=false, holdTurbo=false;  // stati hold dei bottoni
  createPadDOM();

  function createPadDOM(){
    if (!wrap) return;

    // stile via <style> iniettato
    const css = document.createElement('style');
    css.textContent = `
      #padBar{display:flex;justify-content:space-between;gap:16px;padding:10px 12px;background:#0d1330;border-top:1px solid #1d2a55}
      .padCluster{display:grid;grid-template-columns:56px 56px 56px;grid-template-rows:56px 56px;gap:8px}
      .padBtn{appearance:none;-webkit-appearance:none;user-select:none;touch-action:manipulation;cursor:pointer;
              width:56px;height:56px;border-radius:12px;border:1.5px solid #2dd4bf;background:#1a2755;color:#e6f7ff;
              font:700 20px/1 system-ui,-apple-system,Segoe UI,Roboto,Arial;display:flex;align-items:center;justify-content:center}
      .padBtn:active{background:#1c8c7a;border-color:#54e0c2;transform:translateY(1px)}
      .padBtn.small{width:52px;height:52px}
      .padCluster .spacer{visibility:hidden}
      .padRight{display:grid;grid-auto-flow:row;gap:8px}
      .padLabel{display:block;font:600 11px/1 system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#9fb0d9;margin-top:2px}
      @media (min-width: 880px){ #padBar{padding:12px 16px} .padBtn{width:60px;height:60px} .padCluster{grid-template-columns:60px 60px 60px;grid-template-rows:60px 60px} }
    `;
    document.head.appendChild(css);

    // struttura DOM
    const bar = document.createElement('div');
    bar.id = 'padBar';

    const left = document.createElement('div');
    left.className = 'padCluster';
    left.innerHTML = `
      <button class="padBtn spacer" tabindex="-1">·</button>
      <button id="padUp" class="padBtn" aria-label="Su">↑</button>
      <button class="padBtn spacer" tabindex="-1">·</button>
      <button id="padLeft" class="padBtn" aria-label="Sinistra">←</button>
      <button id="padDown" class="padBtn" aria-label="Giù">↓</button>
      <button id="padRight" class="padBtn" aria-label="Destra">→</button>
    `;

    const right = document.createElement('div');
    right.className = 'padRight';
    right.innerHTML = `
      <button id="padA" class="padBtn small" aria-label="Lift">A</button><span class="padLabel">LIFT</span>
      <button id="padB" class="padBtn small" aria-label="Turbo">B</button><span class="padLabel">TURBO</span>
    `;

    bar.appendChild(left);
    bar.appendChild(right);

    // inserisci tra canvas e HUD
    const hud = document.getElementById('hud');
    wrap.insertBefore(bar, hud);

    // wiring eventi (pointer, anche iPhone)
    const btnUp    = bar.querySelector('#padUp');
    const btnDown  = bar.querySelector('#padDown');
    const btnLeft  = bar.querySelector('#padLeft');
    const btnRight = bar.querySelector('#padRight');
    const btnA     = bar.querySelector('#padA');
    const btnB     = bar.querySelector('#padB');

    const down = (e)=>{ e.preventDefault(); ensureAudio(); actx&&actx.resume&&actx.resume(); if(!running) startGame(); };
    // tap ↑/↓
    btnUp.addEventListener('pointerdown', e=>{ down(e); laneUp(); blip(760,0.05,0.06); });
    btnDown.addEventListener('pointerdown', e=>{ down(e); laneDown(); blip(540,0.05,0.06); });

    // hold ←/→
    btnLeft.addEventListener('pointerdown', e=>{ down(e); holdLeft=true; });
    btnRight.addEventListener('pointerdown',e=>{ down(e); holdRight=true; });
    ['pointerup','pointercancel','pointerleave'].forEach(t=>{
      btnLeft.addEventListener(t, ()=>{ holdLeft=false; }, {passive:true});
      btnRight.addEventListener(t,()=>{ holdRight=false;}, {passive:true});
    });

    // A = Lift (tap/hold non serve)
    btnA.addEventListener('pointerdown', e=>{ down(e); manualLift(); });

    // B = Turbo (hold)
    btnB.addEventListener('pointerdown', e=>{ down(e); holdTurbo=true; blip(460,0.04,0.06,'triangle'); });
    ['pointerup','pointercancel','pointerleave'].forEach(t=>{
      btnB.addEventListener(t, ()=>{ if (holdTurbo){ holdTurbo=false; blip(260,0.05,0.05,'triangle'); }}, {passive:true});
    });
  }

  // ===== Start / Pause =====
  function startGame(){
    running=true; paused=false; last=performance.now(); elapsed=0; score=0;
    obstacles.length=0; lifts.length=0;
    for(let i=0;i<3;i++) spawnObstacle();
    spawnLift('up'); spawnLift('down');
    Object.assign(player,{ x:120, level:'low', lane:1, alive:true, lifting:false, turboOn:false });
    blip(520,0.08,0.08); blip(780,0.08,0.07);
  }
  function toStart(){ running=false; paused=false; }
  function togglePause(){ if(!running) return; paused=!paused; if(!paused) last=performance.now(); if(pauseBtn) pauseBtn.textContent=paused?'Resume':'Pausa'; }

  // ===== Lift =====
  let liftAnim=null;               // {t,fromY,toY}
  let eligibleSince=0;             // ms
  const AUTO_LIFT_DELAY=150;       // ms
  const LIFT_TOL=18;

  function eligibleLift(){
    if(!player.alive || player.lifting) return null;
    const need = (player.level==='low') ? 'up' : 'down';
    for(const L of lifts){
      if(!L.active || L.dir!==need) continue;
      if (player.lane !== L.alignedLane) continue; // corsia centrale
      if (player.x + player.w > L.x - LIFT_TOL && player.x < L.x + L.w + LIFT_TOL &&
          player.y + player.h > L.y && player.y < L.y + L.h) return L;
    }
    return null;
  }
  function manualLift(){ const L=eligibleLift(); if(L) startLift(L); }
  function startLift(L){
    player.lifting=true;
    const delta=(levelY.low - levelY.high)*(L.dir==='up'?1:-1);
    liftAnim={ t:0, fromY:player.y, toY:player.y - delta };
    L.active=false; sweep(L.dir==='up'?420:520, L.dir==='up'?980:360, 0.22, 0.08);
    score += 50; if(scoreEl) scoreEl.textContent = score;
  }

  // ===== Update =====
  function update(dt){
    const keyboardTurbo = !!keys['Space'];
    const turbo = player.turboOn || keyboardTurbo || holdTurbo;
    const targetSpeed = turbo ? player.turbo : player.speed;

    // X (tasti o dpad esterno)
    const right = keys['ArrowRight']||keys['KeyD']||holdRight;
    const left  = keys['ArrowLeft'] ||keys['KeyA']||holdLeft;
    player.vx = right ? 1 : left ? -1 : 0;
    player.x += player.vx * 180 * dt;
    player.x = Math.max(40, Math.min(W*0.62, player.x));

    // Cambio corsia tastiera (edge)
    if((keys['ArrowUp']||keys['KeyW']) && !player.lifting){ laneUp(); keys['ArrowUp']=keys['KeyW']=false; blip(760,0.05,0.06); }
    if((keys['ArrowDown']||keys['KeyS']) && !player.lifting){ laneDown(); keys['ArrowDown']=keys['KeyS']=false; blip(540,0.05,0.06); }

    // Y / anim lift
    if(!player.lifting){
      const base=(player.level==='low')?levelY.low:levelY.high;
      const targetY= base - player.lane*laneGap - (player.h/2);
      player.y += (targetY - player.y) * Math.min(1, dt*10);
    } else {
      const dur=0.85; liftAnim.t += dt/dur;
      const t= Math.min(1, liftAnim.t);
      const k = t<0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
      player.y = liftAnim.fromY + (liftAnim.toY - liftAnim.fromY)*k;
      if(liftAnim.t>=1){ player.lifting=false; player.level=(player.level==='low')?'high':'low'; liftAnim=null; }
    }

    // Auto-lift
    const L=eligibleLift();
    if(L){ if(!eligibleSince) eligibleSince=performance.now(); else if(performance.now()-eligibleSince>=AUTO_LIFT_DELAY) startLift(L); }
    else { eligibleSince=0; }

    // Scorrimento oggetti
    for(const o of obstacles){
      const boost = (player.level===o.level ? targetSpeed*0.45 : targetSpeed*0.25);
      o.x -= (o.speed + boost) * dt * 60;
      // Sorpasso
      if(!o.scored && o.x + o.w < player.x){ o.scored=true; score+=5; blip(900,0.05,0.05,'triangle'); }
    }
    for(const L2 of lifts){
      L2.x -= (BASE_SCROLL + 1.1 + (turbo?0.4:0)) * dt * 60;
    }

    // Cleanup & respawn
    for(let i=obstacles.length-1;i>=0;i--) if(obstacles[i].x + obstacles[i].w < -60) obstacles.splice(i,1);
    for(let i=lifts.length-1;i>=0;i--)     if(lifts[i].x + lifts[i].w < -70)       lifts.splice(i,1);
    if(obstacles.length < 5 && Math.random()<0.06) spawnObstacle();
    const upC=lifts.filter(l=>l.dir==='up').length, dnC=lifts.filter(l=>l.dir==='down').length;
    if(upC<2 && Math.random()<0.10) spawnLift('up');
    if(dnC<2 && Math.random()<0.08) spawnLift('down');

    // Collisioni (tolleranti)
    for(const o of obstacles){
      if(o.level!==player.level) continue;
      if(overlapRelaxed(player,o,-3)){ player.alive=false; running=false; crash(); break; }
    }

    // Score & time + Best
    elapsed += dt;
    score += Math.floor(1 * dt);
    if(timeEl)  timeEl.textContent  = elapsed.toFixed(1);
    if(scoreEl) scoreEl.textContent = score;
    if(score > best){ best = score; localStorage.setItem('liftRunnerBest', String(best)); }
  }

  function laneUp(){ if(!player.lifting && player.lane<LANES-1) player.lane++; }
  function laneDown(){ if(!player.lifting && player.lane>0) player.lane--; }

  function overlapRelaxed(a,b,pad){
    return a.x - pad < b.x + b.w + pad &&
           a.x + a.w + pad > b.x - pad &&
           a.y - pad < b.y + b.h + pad &&
           a.y + a.h + pad > b.y - pad;
  }

  // ===== Draw =====
  function draw(){
    ctx.fillStyle='#0b1022'; ctx.fillRect(0,0,W,H);
    drawStars();
    drawRoad(levelY.high); drawRoad(levelY.low);

    for(const l of lifts) drawLift(l);
    for(const o of obstacles) drawObstacle(o);
    drawCar(player);

    // HUD in-canvas (tempo/score/best) sempre visibile
    ctx.save();
    ctx.fillStyle='rgba(8,12,28,0.55)'; ctx.fillRect(10,10,170,46);
    ctx.fillStyle='#ecf2ff'; ctx.font='bold 14px system-ui,Segoe UI,Arial';
    ctx.fillText(`⏱ ${elapsed.toFixed(1)}s`, 16, 28);
    ctx.fillText(`🏁 ${score}`, 16, 44);
    ctx.textAlign='right'; ctx.fillText(`Best: ${best}`, 176, 28);
    ctx.restore();

    // Hint READY
    const el = eligibleLift();
    if(el && player.alive && !player.lifting){
      ctx.save(); ctx.font='bold 16px system-ui,Segoe UI,Arial'; ctx.fillStyle='#eaffef'; ctx.textAlign='center';
      ctx.fillText('LIFT READY', player.x + player.w/2, player.y - 14); ctx.restore();
    }

    // Overlays
    if(!running || paused || !player.alive){
      ctx.fillStyle='rgba(8,12,28,0.72)'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#ecf2ff'; ctx.textAlign='center';
      if(!running){
        ctx.font='bold 34px system-ui,Segoe UI,Arial'; ctx.fillText('TAP ANYWHERE TO START', W/2, H/2);
        ctx.font='15px system-ui,Segoe UI,Arial'; ctx.fillText('D-pad sotto • A=LIFT • B=TURBO • Lift automatico quando pronto', W/2, H/2+28);
        ctx.fillText(`Best: ${best}`, W/2, H/2+48);
      } else if(paused){
        ctx.font='bold 34px system-ui,Segoe UI,Arial'; ctx.fillText('PAUSA', W/2, H/2);
      } else if(!player.alive){
        ctx.font='bold 34px system-ui,Segoe UI,Arial'; ctx.fillText('GAME OVER', W/2, H/2);
        ctx.font='15px system-ui,Segoe UI,Arial'; ctx.fillText('Tocca per ripartire', W/2, H/2+28);
        ctx.fillText(`Best: ${best}`, W/2, H/2+48);
      }
    }
  }

  function drawRoad(yBase){
    ctx.fillStyle='#0f1834'; ctx.fillRect(0,yBase,W,roadH);
    ctx.strokeStyle='#223069'; ctx.lineWidth=2;
    for(let i=0;i<LANES;i++){
      const y=yBase - i*laneGap - laneGap/2;
      ctx.setLineDash([12,10]); ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  function drawLift(L){
    ctx.fillStyle=L.active?'#2dd36f':'#2a7a54'; ctx.fillRect(L.x,L.y,L.w,L.h);
    ctx.fillStyle='#1b254d';
    ctx.fillRect(L.x+6, levelY.low-4, 8, -(levelY.low - (L.y+L.h)));
    ctx.fillRect(L.x+L.w-14, levelY.low-4, 8, -(levelY.low - (L.y+L.h)));
    ctx.fillStyle='#eaffef'; const cx=L.x+L.w/2, cy=L.y+L.h/2;
    ctx.beginPath();
    if(L.dir==='up'){ ctx.moveTo(cx,cy-6); ctx.lineTo(cx-6,cy+4); ctx.lineTo(cx+6,cy+4); }
    else { ctx.moveTo(cx,cy+6); ctx.lineTo(cx-6,cy-4); ctx.lineTo(cx+6,cy-4); }
    ctx.closePath(); ctx.fill();
  }
  function drawObstacle(o){
    ctx.fillStyle='#ef4444'; ctx.fillRect(o.x,o.y,o.w,o.h);
    ctx.fillStyle='#ffd4d4'; ctx.fillRect(o.x+4,o.y+4,o.w-8,6);
  }
  function drawCar(p){
    ctx.fillStyle=p.alive?'#22c55e':'#7a2b2b'; ctx.fillRect(p.x,p.y,p.w,p.h);
    ctx.fillStyle='#cfeee0'; ctx.fillRect(p.x+10,p.y+4,p.w-20,p.h-10);
    ctx.fillStyle='#ffe066'; ctx.fillRect(p.x+p.w-6,p.y+6,4,6);
  }

  function drawStars(){
    ctx.fillStyle='#1d2a55';
    for(let i=0;i<60;i++){
      const x=(i*53 + (elapsed*40)%W)%W, y=(i*37)%H; ctx.fillRect(x,y,2,2);
    }
  }

  // ===== Loop =====
  function loop(now){
    const dt=Math.min(0.033,(now-last)/1000); last=now;
    if(running && !paused && player.alive) update(dt);
    draw();
    // HUD DOM sempre aggiornato
    if (timeEl)  timeEl.textContent  = elapsed.toFixed(1);
    if (scoreEl) scoreEl.textContent = String(score);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(ts=>{ last=ts; draw(); requestAnimationFrame(loop); });
})();
