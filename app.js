/* Lift Runner — v3.8
 * Fix & New:
 * - JUMP fisico (arco verso l'alto), cooldown, invulnerabilità parziale sugli ostacoli bassi
 * - Bottone HUD "LIFT" -> JUMP (il lift resta su A e tasto L)
 * - Nessun testo "JUMP" nel canvas
 * - A=LIFT, B=TURBO (hold), d-pad DOM su mobile
 * Keep (da v3.x):
 * - Shield (pickup raro ~1/min, dura 15s o 1 urto), Ghost Lift, Bonus/Combo, Turbo bar,
 *   Stages, Tumbleweed (bush), UFO, NPC "family" lift (game over), PWA friendly
 */

(() => {
  // ===== Canvas & UI =====
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const W = canvas.width, H = canvas.height;

  const timeEl  = document.getElementById('time');
  const scoreEl = document.getElementById('score');
  const liftBtn = document.getElementById('liftBtn');   // (riusato come JUMP)
  const pauseBtn= document.getElementById('pauseBtn');
  const wrap    = document.getElementById('gamewrap');

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  canvas.style.touchAction = 'none';
  canvas.tabIndex = 0; const focusCanvas = ()=>{ try{ canvas.focus(); }catch{} };
  window.addEventListener('load', focusCanvas);
  canvas.addEventListener('pointerdown', focusCanvas);

  // ===== World =====
  const LANES = 3;
  const laneGap = 32;
  const levelY = { low: H - 120, high: H - 320 };
  const roadH  = 12;
  const BASE_SCROLL = 3.0;

  const player = {
    x: 120, y: levelY.low - 2*laneGap,
    w: 50, h: 24, vx: 0,
    speed: 3.6, turbo: 6.4,
    level: 'low', lane: 1,
    alive: true, lifting: false,
    turboOn: false,
    shieldTime: 0,
    _turboWasOn: false,

    // JUMP state (unità pixel / s)
    jumpZ: 0,            // quota verticale (0 = “a terra” sulla corsia)
    jumpVy: 0,           // velocità verticale
    canJump: true,       // true quando è atterrato e non in lift
    jumpCooldown: 0      // secondi rimanenti
  };

  // Entities
  const obstacles = []; // {type:'block'|'bush', x,y,w,h,level,lane,speed,theta?,scored?}
  const lifts     = []; // {x,y,w,h,dir:'up'|'down',active,alignedLane,npc?:'family',ghost?:true,blink?:number}
  const bonuses   = []; // {x,y,w,h,level,lane,points,active,ttl}
  const ufos      = []; // {x,y,w,h,speed,t}
  const shields   = []; // {x,y,w,h,level,lane,active,ttl}
  const floats    = []; // {x,y,text,ttl}
  const particles = []; // teleport scia: {x,y,vx,vy,ttl}

  // ===== Audio =====
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
    o.type='sawtooth'; o.frequency.setValueAtTime(f0,t);
    o.frequency.exponentialRampToValueAtTime(f1,t+d);
    v.gain.value=g; v.gain.exponentialRampToValueAtTime(0.0001,t+d);
    o.connect(v).connect(actx.destination); o.start(t); o.stop(t+d);
  };
  const crash=()=>{
    if(muted || !actx) return; const t=actx.currentTime;
    const b=actx.createBuffer(1, actx.sampleRate*0.25, actx.sampleRate);
    const d=b.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,2);
    const s=actx.createBufferSource(), v=actx.createGain();
    v.gain.value=0.20; v.gain.exponentialRampToValueAtTime(0.0001,t+0.25);
    s.buffer=b; s.connect(v).connect(actx.destination); s.start(t);
  };
  const bonusChime = (pts, x2=false)=>{
    ensureAudio(); if(!actx || muted) return;
    if (x2) { sweep(620,1500,0.25,0.09); return; }
    if (pts>=1000) sweep(520,1400,0.25,0.08);
    else if (pts>=500){ blip(900,0.05,0.08,'triangle'); setTimeout(()=>blip(680,0.06,0.08,'triangle'),60); }
    else blip(780,0.06,0.07,'square');
  };
  const levelUpSound = ()=>{ sweep(360,960,0.35,0.09); setTimeout(()=>blip(1020,0.05,0.08,'triangle'),200); };
  const ufoSound = ()=>{
    ensureAudio(); if(!actx || muted) return;
    const t=actx.currentTime;
    const o=actx.createOscillator(), v=actx.createGain();
    o.type='sine'; o.frequency.setValueAtTime(420,t); o.frequency.linearRampToValueAtTime(380,t+1.2);
    v.gain.value=0.06; v.gain.exponentialRampToValueAtTime(0.0001,t+1.2);
    o.connect(v).connect(actx.destination); o.start(t); o.stop(t+1.2);
  };
  const shieldPickupSound = ()=>{ blip(980,0.08,0.09,'triangle'); setTimeout(()=>blip(640,0.06,0.07,'triangle'),70); };
  const shieldBreakSound  = ()=>{ blip(240,0.08,0.12,'square'); setTimeout(()=>blip(180,0.10,0.10,'square'),60); };
  const whoosh = ()=>{ sweep(300,1200,0.18,0.10); };
  const jumpSound = ()=>{ blip(700,0.06,0.08,'triangle'); setTimeout(()=>blip(500,0.05,0.06,'triangle'),70); };

  ['pointerdown','keydown','touchstart','click'].forEach(t=>{
    window.addEventListener(t, ()=>{ ensureAudio(); actx && actx.resume && actx.resume(); }, {once:true, passive:true});
  });

  // ===== Stages =====
  const STAGES = {
    1: { name:'LEVEL 1 — NOTTE',   sky:'#0b1022', star:'#1d2a55', road:'#0f1834', dash:'#223069' },
    2: { name:'LEVEL 2 — ALBA',    sky:'#1b1230', star:'#fdc1c1', road:'#2a1a3f', dash:'#ca6bee' },
    3: { name:'LEVEL 3 — DESERTO', sky:'#231a10', star:'#ffea96', road:'#3b2a14', dash:'#d1a15a' }
  };
  let stage = 1;
  let stageMsg = { text:'', t:0 };
  function setStage(n){ stage = n; stageMsg = { text: STAGES[stage].name, t: 1.8 }; levelUpSound(); }

  // ===== Spawn =====
  function spawnObstacle(){
    const level = Math.random()<0.5 ? 'low' : 'high';
    const lane  = Math.floor(Math.random()*LANES);
    const lastX = obstacles.length ? obstacles[obstacles.length-1].x : W;
    const minGapX = 140 + Math.random()*90;
    const typeRoll = Math.random();
    const type = (stage>=3 && typeRoll<0.35) ? 'bush' : (typeRoll<0.85 ? 'block' : 'bush');
    const baseY = (level==='low'? levelY.low : levelY.high) - lane*laneGap - 6;
    const obj = {
      type, level, lane,
      x: Math.max(W+40, lastX+minGapX),
      y: baseY, w: (type==='block'? 40:32), h: (type==='block'? 20:32),
      speed: BASE_SCROLL + Math.random()*1.2 + (stage-1)*0.3,
      scored:false, theta: (type==='bush'? Math.random()*Math.PI*2 : 0)
    };
    obstacles.push(obj);
  }

  function spawnLift(dir=(Math.random()<0.6?'up':'down')){
    const lane=1, yBase=(dir==='up'? levelY.low : levelY.high);
    const lastX = lifts.length ? lifts[lifts.length-1].x : W;
    const gap = 260 + Math.random()*160;
    const L = {
      x: Math.max(W+160, lastX+gap),
      y: yBase - lane*laneGap - 6,
      w: 140, h: 16, dir, active: true, alignedLane: lane
    };
    if (Math.random() < 0.20) {
      L.ghost = true;   // ~20% ghost
    } else if (Math.random() < 0.12) {
      L.npc = 'family'; // ~12% family occupato
      L.blink = 0;
    }
    lifts.push(L);
  }

  function spawnBonus(points){
    const lvl = Math.random()<0.5 ? 'low' : 'high';
    const lane = Math.floor(Math.random()*LANES);
    const x = W + 200 + Math.random()*400;
    const y = (lvl==='low'? levelY.low : levelY.high) - lane*laneGap - 14;
    bonuses.push({ x, y, w: 18, h: 18, level: lvl, lane, points, active:true, ttl: 8 });
  }

  function spawnShield(){
    const lvl = Math.random()<0.5 ? 'low' : 'high';
    const lane = Math.floor(Math.random()*LANES);
    const x = W + 220 + Math.random()*380;
    const y = (lvl==='low'? levelY.low : levelY.high) - lane*laneGap - 14;
    shields.push({ x, y, w: 20, h: 20, level:lvl, lane, active:true, ttl: 14 });
  }

  function spawnUFO(){
    const y = levelY.high - laneGap*2 - 70 + Math.random()*30;
    ufos.push({ x: W + 40, y, w: 60, h: 24, speed: 2.2 + Math.random()*1.0, t:0 });
    ufoSound();
  }

  // Preload iniziale
  for(let i=0;i<3;i++) spawnObstacle();
  spawnLift('up'); spawnLift('down');

  // ===== State =====
  let running=false, paused=false;
  let last=performance.now(), elapsed=0, score=0, best=+localStorage.getItem('liftRunnerBest')||0;

  // Combo
  let comboCount = 0, comboTimer = 0, comboFlash = 0;
  const COMBO_WINDOW = 8.0;

  // Turbo energy
  let turboEnergy = 100; const TURBO_USE=28, TURBO_REGEN=18;

  // Shield spawn timer (~1/min)
  let shieldSpawnTimer = 0;

  // Teleport flash
  let flashTime = 0;

  // ===== Keyboard =====
  const keys=Object.create(null);
  const handled=new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS','Space','KeyL','KeyP','KeyR','KeyM','KeyX','KeyJ']);
  window.addEventListener('keydown',e=>{
    const c=e.code||e.key; keys[c]=true;
    if(handled.has(c)) e.preventDefault();
    if(!running) startGame();
    if(c==='KeyP') togglePause();
    if(c==='KeyL') manualLift();       // L = lift
    if(c==='KeyM') muted=!muted;
    if(c==='Space') { player.turboOn=true; } // Space = turbo (desktop)
    if((c==='KeyX' || c==='KeyJ')) tryJump(); // X/J = JUMP (desktop)
    if(c==='KeyR' && !player.alive) toStart();
  },{passive:false});
  window.addEventListener('keyup',e=>{
    const c=e.code||e.key; keys[c]=false;
    if(handled.has(c)) e.preventDefault();
    if(c==='Space') { player.turboOn=false; }
  },{passive:false});

  // HUD buttons
  if(liftBtn){
    liftBtn.textContent = 'JUMP';
    liftBtn.title = 'Salta (X o J su tastiera)';
    liftBtn.addEventListener('click', ()=>{ ensureAudio(); actx&&actx.resume&&actx.resume(); tryJump(); if(!running) startGame(); });
  }
  if(pauseBtn) pauseBtn.addEventListener('click', ()=>{ ensureAudio(); actx&&actx.resume&&actx.resume(); togglePause(); });

  // ===== D-pad DOM (mobile) =====
  let holdLeft=false, holdRight=false, holdTurbo=false;
  if (isMobile) createPadDOM();

  function createPadDOM(){
    if (!wrap) return;
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
    `;
    document.head.appendChild(css);

    const bar = document.createElement('div'); bar.id = 'padBar';
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
      <button id="padX" class="padBtn small" aria-label="Jump">X</button><span class="padLabel">JUMP</span>
    `;
    bar.appendChild(left); bar.appendChild(right);
    const hud = document.getElementById('hud'); wrap.insertBefore(bar, hud);

    const btnUp=bar.querySelector('#padUp'), btnDown=bar.querySelector('#padDown');
    const btnLeft=bar.querySelector('#padLeft'), btnRight=bar.querySelector('#padRight');
    const btnA=bar.querySelector('#padA'), btnB=bar.querySelector('#padB'), btnX=bar.querySelector('#padX');

    const down = (e)=>{ e.preventDefault(); ensureAudio(); actx&&actx.resume&&actx.resume(); if(!running) startGame(); };

    btnUp.addEventListener('pointerdown',   e=>{ down(e); laneUp(); blip(760,0.05,0.06); });
    btnDown.addEventListener('pointerdown', e=>{ down(e); laneDown(); blip(540,0.05,0.06); });
    btnLeft.addEventListener('pointerdown', e=>{ down(e); holdLeft=true; });
    btnRight.addEventListener('pointerdown',e=>{ down(e); holdRight=true; });
    ['pointerup','pointercancel','pointerleave'].forEach(t=>{
      btnLeft.addEventListener(t, ()=>{ holdLeft=false; }, {passive:true});
      btnRight.addEventListener(t,()=>{ holdRight=false;}, {passive:true});
    });
    btnA.addEventListener('pointerdown', e=>{ down(e); manualLift(); });             // A=LIFT
    btnB.addEventListener('pointerdown', e=>{ down(e); holdTurbo=true; });           // B=TURBO (hold)
    ['pointerup','pointercancel','pointerleave'].forEach(t=>{
      btnB.addEventListener(t, ()=>{ holdTurbo=false; }, {passive:true});
    });
    btnX.addEventListener('pointerdown', e=>{ down(e); tryJump(); });                // X=JUMP
  }

  // ===== Start / Pause =====
  function startGame(){
    running=true; paused=false; last=performance.now(); elapsed=0; score=0;
    obstacles.length=0; lifts.length=0; bonuses.length=0; ufos.length=0; floats.length=0; shields.length=0; particles.length=0;
    for(let i=0;i<3;i++) spawnObstacle();
    spawnLift('up'); spawnLift('down');
    Object.assign(player,{
      x:120, level:'low', lane:1, alive:true, lifting:false,
      turboOn:false, shieldTime:0, _turboWasOn:false,
      jumpZ:0, jumpVy:0, canJump:true, jumpCooldown:0
    });
    setStage(1);
    comboCount=0; comboTimer=0; comboFlash=0; turboEnergy=100; shieldSpawnTimer=0; flashTime=0;
    blip(520,0.08,0.08); blip(780,0.08,0.07);
  }
  function toStart(){ running=false; paused=false; }
  function togglePause(){ if(!running) return; paused=!paused; if(!paused) last=performance.now(); if(pauseBtn) pauseBtn.textContent=paused?'Resume':'Pausa'; }

  // ===== Lift =====
  let liftAnim=null, eligibleSince=0;
  const AUTO_LIFT_DELAY=150, LIFT_TOL=18;

  function eligibleLift(){
    if(!player.alive || player.lifting) return null;
    const need = (player.level==='low') ? 'up' : 'down';
    for(const L of lifts){
      if(!L.active || L.dir!==need) continue;
      if (player.lane !== L.alignedLane) continue;
      if (player.x + player.w > L.x - LIFT_TOL && player.x < L.x + L.w + LIFT_TOL &&
          (player.y - player.jumpZ) + player.h > L.y && (player.y - player.jumpZ) < L.y + L.h) return L;
    }
    return null;
  }
  function manualLift(){ const L=eligibleLift(); if(L) startLift(L); }

  function teleportViaGhost(L){
    whoosh(); flashTime = 0.25;
    for(let i=0;i<16;i++){
      particles.push({
        x: player.x + player.w/2, y: (player.y - player.jumpZ) + player.h/2,
        vx: (Math.random()*80+80), vy: (Math.random()*40-20),
        ttl: 0.25 + Math.random()*0.2
      });
    }
    // swap level e sposta avanti
    player.level = (player.level==='low') ? 'high' : 'low';
    player.x = Math.min(player.x + 400, W*0.62);
    // riallinea y al nuovo piano (mantieni salto corrente)
    const base = (player.level==='low')?levelY.low:levelY.high;
    player.y = base - player.lane*laneGap - (player.h/2);
    score += 200; floats.push({ x: player.x, y: (player.y - player.jumpZ)-12, text:'+200 GHOST', ttl:1.2 });
  }

  function startLift(L){
    if (player.jumpZ > 0) return; // niente lift mentre salti
    // NPC family = game over immediato
    if (L.npc === 'family') {
      L.blink = 0.6; player.alive = false; running = false; crash();
      floats.push({ x: L.x+L.w/2, y: L.y-10, text:'LIFT OCCUPATO!', ttl:1.4 });
      return;
    }
    // Ghost lift = teletrasporto istantaneo
    if (L.ghost) {
      L.active=false; teleportViaGhost(L); return;
    }
    // Normale anim
    player.lifting=true;
    const delta=(levelY.low - levelY.high)*(L.dir==='up'?1:-1);
    liftAnim={ t:0, fromY:player.y, toY:player.y - delta };
    L.active=false; sweep(L.dir==='up'?420:520, L.dir==='up'?980:360, 0.22, 0.08);
    score += 50; if(scoreEl) scoreEl.textContent = score;
  }

  // ===== Jump =====
  const JUMP_V0 = -320;     // velocità iniziale (negativa = verso l'alto nello spazio canvas)
  const GRAVITY = 780;      // accelerazione “in basso”
  const JUMP_COOLDOWN = 0.35; // s

  function tryJump(){
    if (!player.alive || player.lifting) return;
    if (!player.canJump || player.jumpCooldown > 0) return;
    // avvia salto
    player.jumpZ = 0;
    player.jumpVy = JUMP_V0;    // verso l’alto
    player.canJump = false;
    player.jumpCooldown = JUMP_COOLDOWN;
    jumpSound();
  }

  // ===== Helpers =====
  function laneUp(){ if(!player.lifting && player.lane<LANES-1) player.lane++; }
  function laneDown(){ if(!player.lifting && player.lane>0)     player.lane--; }
  function overlapRelaxed(a,b,p){
    return a.x - p < b.x + b.w + p &&
           a.x + a.w + p > b.x - p &&
           (a.y - a.jumpZ) - p < b.y + b.h + p &&
           (a.y - a.jumpZ) + a.h + p > b.y - p;
  }

  // ===== Update =====
  function update(dt){
    // Jump physics
    if (player.jumpCooldown > 0) player.jumpCooldown = Math.max(0, player.jumpCooldown - dt);
    if (player.jumpVy !== 0 || player.jumpZ > 0){
      player.jumpVy += GRAVITY * dt;              // gravità “tira giù”
      player.jumpZ = Math.max(0, player.jumpZ - player.jumpVy * dt * 0.001); 
      // Nota: sottraggo vy*dt*0.001 per trasformare px/s in offset coerente con il frame;
      // l’importante è che jumpZ cresca salendo e torni a 0 atterrando
      if (player.jumpZ <= 0){ player.jumpZ = 0; player.jumpVy = 0; player.canJump = true; }
    }

    // Turbo energy
    const wantTurbo = player.turboOn || !!keys['Space'] || (isMobile && holdTurbo);
    if (wantTurbo && turboEnergy > 1) {
      turboEnergy = Math.max(0, turboEnergy - TURBO_USE * dt);
      if (!player._turboWasOn) { blip(460,0.04,0.06,'triangle'); player._turboWasOn=true; }
    } else {
      turboEnergy = Math.min(100, turboEnergy + TURBO_REGEN * dt);
      if (player._turboWasOn) { blip(260,0.05,0.05,'triangle'); player._turboWasOn=false; }
    }
    if (player.shieldTime > 0) player.shieldTime = Math.max(0, player.shieldTime - dt);
    if (flashTime > 0) flashTime -= dt;

    const turboActive = wantTurbo && turboEnergy > 1;
    const targetSpeed = turboActive ? player.turbo : player.speed;

    // Movement X
    const right = keys['ArrowRight']||keys['KeyD']||holdRight;
    const left  = keys['ArrowLeft'] ||keys['KeyA']||holdLeft;
    player.vx = right ? 1 : left ? -1 : 0;
    player.x += player.vx * 180 * dt;
    player.x = Math.max(40, Math.min(W*0.62, player.x));

    // Lane change keyboard
    if((keys['ArrowUp']||keys['KeyW']) && !player.lifting){ laneUp(); keys['ArrowUp']=keys['KeyW']=false; blip(760,0.05,0.06); }
    if((keys['ArrowDown']||keys['KeyS']) && !player.lifting){ laneDown(); keys['ArrowDown']=keys['KeyS']=false; blip(540,0.05,0.06); }

    // Y / lift anim (la y “di base” non è influenzata dal salto; il render userà y - jumpZ)
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

    // Auto-lift (disattivato durante salto)
    const L= (player.jumpZ>0 ? null : eligibleLift());
    if(L){ if(!eligibleSince) eligibleSince=performance.now(); else if(performance.now()-eligibleSince>=AUTO_LIFT_DELAY) startLift(L); }
    else { eligibleSince=0; }

    // Spawning dinamico
    if (obstacles.length < 5 && Math.random() < (0.06 + (stage-1)*0.01)) spawnObstacle();
    const upC=lifts.filter(l=>l.dir==='up').length, dnC=lifts.filter(l=>l.dir==='down').length;
    if(upC<2 && Math.random()<0.10) spawnLift('up');
    if(dnC<2 && Math.random()<0.08) spawnLift('down');

    // Bonus spawn
    const bonusRoll = Math.random();
    if (bonuses.length < 3) {
      if (bonusRoll < 0.010) spawnBonus(100);
      else if (bonusRoll < 0.013) spawnBonus(500);
      else if (bonusRoll < 0.014) spawnBonus(1000);
    }
    // Shield spawn ~ 1/min
    shieldSpawnTimer += dt;
    if (shieldSpawnTimer > 50 && Math.random() < 0.003) { spawnShield(); shieldSpawnTimer = 0; }

    // UFO spawn
    if (Math.random() < (stage>=2 ? 0.0025 : 0.0012) && ufos.length < 1) spawnUFO();

    // Update obstacles
    for(const o of obstacles){
      const boost = (player.level===o.level ? targetSpeed*0.45 : targetSpeed*0.25);
      o.x -= (o.speed + boost) * dt * 60;
      if (o.type==='bush') { o.theta += dt * 6.5; o.y += Math.sin(o.theta*2) * 0.2; }
      if(!o.scored && o.x + o.w < player.x){ o.scored=true; score+=5; blip(900,0.05,0.05,'triangle'); }
    }

    // Update lifts
    for(const L2 of lifts){
      L2.x -= (BASE_SCROLL + 1.1 + (turboActive?0.4:0)) * dt * 60;
      if (L2.npc === 'family' && L2.blink != null) L2.blink = Math.max(0, L2.blink - dt);
    }

    // Update bonuses + COMBO
    if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) comboCount = 0; }
    for (const b of bonuses){
      b.x -= (BASE_SCROLL + 1.2) * dt * 60; b.ttl -= dt;
      if (b.level === player.level && b.active && overlapRelaxed(player,b,-4)){
        b.active = false;
        let points = b.points, isX2=false;
        comboCount += 1;
        if (comboCount >= 3) { points *= 2; isX2=true; comboFlash=0.8; }
        comboTimer = COMBO_WINDOW;
        score += points;
        bonusChime(b.points, isX2);
        floats.push({ x: b.x, y: (b.y - player.jumpZ), text: `+${points}${isX2?' COMBO':''}`, ttl: 1.2 });
      }
    }

    // Update shields pickups
    for (const s of shields){
      s.x -= (BASE_SCROLL + 1.0) * dt * 60; s.ttl -= dt;
      if (s.level === player.level && s.active && overlapRelaxed(player,s,-4)){
        s.active=false; player.shieldTime = 15.0; shieldPickupSound();
        floats.push({ x:s.x, y:(s.y - player.jumpZ), text:'SHIELD ON', ttl:1.2 });
      }
    }

    // Update UFOs
    for (const u of ufos){
      u.x -= (u.speed + (turboActive?0.1:0)) * dt * 60;
      u.t += dt;
      if (stage>=3 && Math.random()<0.005){
        const pts = (Math.random()<0.5?100:500);
        spawnBonus(pts);
      }
    }

    // Update particles (ghost whoosh)
    for (const p of particles){
      p.x += p.vx * dt; p.y += p.vy * dt; p.ttl -= dt; p.vy *= 0.92; p.vx *= 0.94;
    }

    // Cleanup
    for(let i=obstacles.length-1;i>=0;i--) if(obstacles[i].x + obstacles[i].w < -60) obstacles.splice(i,1);
    for(let i=lifts.length-1;i>=0;i--)     if(lifts[i].x + lifts[i].w < -70)       lifts.splice(i,1);
    for(let i=bonuses.length-1;i>=0;i--)   if(bonuses[i].x + bonuses[i].w < -60 || bonuses[i].ttl<=0 || !bonuses[i].active) bonuses.splice(i,1);
    for(let i=ufos.length-1;i>=0;i--)      if(ufos[i].x + ufos[i].w < -80) ufos.splice(i,1);
    for(let i=shields.length-1;i>=0;i--)   if(shields[i].x + shields[i].w < -60 || shields[i].ttl<=0 || !shields[i].active) shields.splice(i,1);
    for(let i=particles.length-1;i>=0;i--) if(particles[i].ttl<=0) particles.splice(i,1);

    // Collisioni con ostacoli
    if (player.alive){
      for(const o of obstacles){
        if(o.level!==player.level) continue;

        // Se sto saltando abbastanza alto sopra un blocco/tumbleweed, lascio passare
        const JUMP_CLEARANCE = 14;                  // quanto “spessore” devo superare
        const jumpingOver = (player.jumpZ > JUMP_CLEARANCE);

        if (jumpingOver){
          // se sono in overlap X ma alto a sufficienza, ignora
          const xOverlap = player.x < o.x + o.w && player.x + player.w > o.x;
          if (xOverlap) continue;
        }

        if(overlapRelaxed(player,o,-3)){
          if (player.shieldTime > 0){
            player.shieldTime = 0; shieldBreakSound();
            floats.push({ x: player.x, y: (player.y - player.jumpZ)-12, text:'SHIELD!', ttl:1.0 });
            player.x = Math.max(40, player.x - 20);
            o.x = -9999;
          } else {
            player.alive=false; running=false; crash();
          }
          break;
        }
      }
    }

    // Score & time + Best
    elapsed += dt;
    score += Math.floor(1 * dt); // +1/s
    if (timeEl)  timeEl.textContent  = elapsed.toFixed(1);
    if (scoreEl) scoreEl.textContent = score;
    if (score > best){ best = score; localStorage.setItem('liftRunnerBest', String(best)); }

    // Level progression
    if (stage===1 && (elapsed>45 || score>2000)) setStage(2);
    if (stage===2 && (elapsed>90 || score>4500)) setStage(3);
    if (stageMsg.t>0) stageMsg.t -= dt;
  }

  // ===== Draw =====
  function draw(){
    // Flash (teleport)
    if (flashTime > 0){
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = Math.min(0.35, flashTime*1.4);
      ctx.fillRect(0,0,W,H);
      ctx.globalAlpha = 1;
    }

    // BG per stage
    ctx.fillStyle = STAGES[stage].sky; ctx.fillRect(0,0,W,H);
    drawStars(STAGES[stage].star);
    drawRoad(levelY.high, STAGES[stage].road, STAGES[stage].dash);
    drawRoad(levelY.low,  STAGES[stage].road, STAGES[stage].dash);

    for(const l of lifts) drawLift(l);
    for(const o of obstacles) drawObstacle(o);
    for(const b of bonuses)   drawBonus(b);
    for(const s of shields)   drawShieldPickup(s);
    for(const u of ufos)      drawUFO(u);
    for(const p of particles) drawParticle(p);
    for(const f of floats)    drawFloat(f);

    drawCar(player);

    // HUD in-canvas
    ctx.save();
    ctx.fillStyle='rgba(8,12,28,0.55)'; ctx.fillRect(10,10,230,86);
    ctx.fillStyle='#ecf2ff'; ctx.font='bold 14px system-ui,Segoe UI,Arial';
    ctx.fillText(`⏱ ${elapsed.toFixed(1)}s`, 16, 28);
    ctx.fillText(`🏁 ${score}`, 16, 46);
    ctx.textAlign='right'; ctx.fillText(`Best: ${best}`, 236, 28);

    // Turbo bar
    ctx.textAlign='left';
    ctx.fillText('Turbo', 16, 62);
    ctx.strokeStyle='#2dd4bf'; ctx.lineWidth=2;
    ctx.strokeRect(64, 50, 120, 10);
    ctx.fillStyle='#22c55e';
    ctx.fillRect(64, 50, 120 * (turboEnergy/100), 10);

    // Shield timer
    if (player.shieldTime > 0){
      ctx.fillStyle='#a5f3fc';
      ctx.fillText(`Shield ${player.shieldTime.toFixed(0)}s`, 16, 78);
    }

    // Jump hint (cooldown)
    if (!player.canJump || player.jumpCooldown>0){
      ctx.fillStyle='#fde68a';
      ctx.fillText(`Jump CD ${player.jumpCooldown.toFixed(1)}s`, 16, 92);
    }
    ctx.restore();

    // Combo HUD
    if (comboCount >= 2 || comboTimer > 0){
      const a = comboFlash>0 ? Math.min(1, comboFlash/0.8) : Math.max(0.3, comboTimer/COMBO_WINDOW);
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle='#ffd166';
      ctx.font='bold 18px system-ui,Segoe UI,Arial';
      ctx.textAlign='center';
      ctx.fillText(`COMBO ${comboCount >= 3 ? 'x2!' : `${comboCount}/3`}`, W/2, 36);
      ctx.restore();
      if (comboFlash>0) comboFlash -= 0.05;
    }

    // Stage overlay
    if (stageMsg.t>0){
      const a = Math.min(1, stageMsg.t / 0.8);
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle = '#ecf2ff'; ctx.font = 'bold 28px system-ui,Segoe UI,Arial';
      ctx.textAlign = 'center'; ctx.fillText(stageMsg.text, W/2, 64);
      ctx.restore();
    }

    // Overlays
    const tip = isMobile
      ? 'D-pad • A=LIFT • B=TURBO • X=JUMP • Shield • Ghost lift 👻'
      : '← → • ↑/↓ corsia • L=LIFT • Spazio=TURBO • X/J=JUMP • Shield • Ghost';
    if(!running || paused || !player.alive){
      ctx.fillStyle='rgba(8,12,28,0.72)'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#ecf2ff'; ctx.textAlign='center';
      if(!running){
        ctx.font='bold 34px system-ui,Segoe UI,Arial'; ctx.fillText('TAP ANYWHERE TO START', W/2, H/2);
        ctx.font='15px system-ui,Segoe UI,Arial'; ctx.fillText(tip, W/2, H/2+28);
        ctx.fillText(`Best: ${best}`, W/2, H/2+48);
      } else if(paused){
        ctx.font='bold 34px system-ui,Segoe UI,Arial'; ctx.fillText('PAUSA', W/2, H/2);
      } else if(!player.alive){
        ctx.font='bold 34px system-ui,Segoe UI,Arial'; ctx.fillText('GAME OVER', W/2, H/2);
        ctx.font='15px system-ui,Segoe UI,Arial'; ctx.fillText(isMobile ? 'Tocca per ripartire' : 'Premi R per ripartire', W/2, H/2+28);
        ctx.fillText(`Best: ${best}`, W/2, H/2+48);
      }
    }
  }

  function drawFloat(f){
    ctx.save(); ctx.globalAlpha = Math.max(0, f.ttl/1.2);
    ctx.fillStyle='#ecf2ff'; ctx.font='bold 14px system-ui,Segoe UI,Arial';
    ctx.fillText(f.text, f.x, f.y); ctx.restore();
  }
  function drawParticle(p){
    ctx.save(); ctx.globalAlpha = Math.max(0, p.ttl/0.45);
    ctx.fillStyle='rgba(255,255,255,0.85)';
    ctx.fillRect(p.x, p.y, 2, 2); ctx.restore();
  }
  function drawRoad(yBase, road='#0f1834', dash='#223069'){
    ctx.fillStyle=road; ctx.fillRect(0,yBase,W,roadH);
    ctx.strokeStyle=dash; ctx.lineWidth=2;
    for(let i=0;i<LANES;i++){
      const y=yBase - i*laneGap - laneGap/2;
      ctx.setLineDash([12,10]); ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  function drawLift(L){
    const occupied = L.npc === 'family';
    const isGhost  = !!L.ghost;
    if (occupied){
      const blinkOn = L.blink && Math.floor(performance.now()/120)%2===0;
      ctx.fillStyle = blinkOn ? '#ff5a5a' : '#7a2b2b';
    } else if (isGhost){
      ctx.fillStyle = '#6d28d9';
      ctx.fillRect(L.x-2,L.y-2,L.w+4,L.h+4);
      ctx.fillStyle = '#8b5cf6';
    } else {
      ctx.fillStyle=L.active?'#2dd36f':'#2a7a54';
    }
    ctx.fillRect(L.x,L.y,L.w,L.h);
    // piloni
    ctx.fillStyle='#1b254d';
    ctx.fillRect(L.x+6, levelY.low-4, 8, -(levelY.low - (L.y+L.h)));
    ctx.fillRect(L.x+L.w-14, levelY.low-4, 8, -(levelY.low - (L.y+L.h)));
    // direzione
    ctx.fillStyle=isGhost ? '#efe9ff' : '#eaffef';
    const cx=L.x+L.w/2, cy=L.y+L.h/2;
    ctx.beginPath();
    const dirUp = L.dir==='up';
    if(dirUp){ ctx.moveTo(cx,cy-6); ctx.lineTo(cx-6,cy+4); ctx.lineTo(cx+6,cy+4); }
    else { ctx.moveTo(cx,cy+6); ctx.lineTo(cx-6,cy-4); ctx.lineTo(cx+6,cy-4); }
    ctx.closePath(); ctx.fill();

    // NPC family stick-figures
    if (occupied){
      const px = L.x + L.w*0.75, py = L.y - 2;
      ctx.save(); ctx.strokeStyle='#ffe6e6'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(px, py-10, 5, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px, py-5); ctx.lineTo(px, py+10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px, py+10); ctx.lineTo(px-5, py+18); ctx.moveTo(px, py+10); ctx.lineTo(px+5, py+18); ctx.stroke();
      const cx2 = px-12, cy2 = py-2;
      ctx.beginPath(); ctx.arc(cx2, cy2-6, 3.2, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx2, cy2-2); ctx.lineTo(cx2, cy2+8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx2, cy2+8); ctx.lineTo(cx2-3, cy2+14); ctx.moveTo(cx2, cy2+8); ctx.lineTo(cx2+3, cy2+14); ctx.stroke();
      ctx.restore();
    }
  }
  function drawObstacle(o){
    if (o.type==='block'){
      ctx.fillStyle='#ef4444'; ctx.fillRect(o.x,o.y,o.w,o.h);
      ctx.fillStyle='#ffd4d4'; ctx.fillRect(o.x+4,o.y+4,o.w-8,6);
    } else {
      const r = o.w/2, cx = o.x + r, cy = o.y + r;
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(o.theta||0);
      ctx.fillStyle='#c59b6d'; ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#7a5c36'; ctx.lineWidth=2;
      for(let i=0;i<6;i++){ const a=i*Math.PI/3; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r); ctx.stroke(); }
      ctx.restore();
    }
  }
  function drawBonus(b){
    const color = b.points>=1000 ? '#a78bfa' : (b.points>=500 ? '#60a5fa' : '#22c55e');
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(b.x + b.w/2, b.y + b.h/2, b.w/2, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.6)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(b.x + b.w/2, b.y + b.h/2, b.w/2 + 2, 0, Math.PI*2); ctx.stroke();
  }
  function drawShieldPickup(s){
    if (!s.active) return;
    ctx.save();
    ctx.shadowColor = '#93c5fd'; ctx.shadowBlur = 8;
    ctx.fillStyle='#60a5fa';
    ctx.beginPath(); ctx.arc(s.x + s.w/2, s.y + s.h/2, s.w/2, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
  function drawUFO(u){
    ctx.save(); ctx.translate(u.x, u.y);
    ctx.fillStyle='#8ab4ff'; ctx.beginPath();
    ctx.ellipse(0,0, u.w*0.5, u.h*0.38, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.85)'; ctx.beginPath();
    ctx.ellipse(-4,-8, u.w*0.25, u.h*0.28, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle='#ffd166';
    for(let i=-2;i<=2;i++){ ctx.beginPath(); ctx.arc(i*10, 8, 3, 0, Math.PI*2); ctx.fill(); }
    ctx.restore();
  }
  function drawCar(p){
    const py = p.y - p.jumpZ; // applica quota salto al disegno e alle hitbox
    if (p.shieldTime > 0){
      const a = 0.35 + 0.15*Math.sin(performance.now()/120);
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle='#93c5fd';
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(p.x-6, py-6, p.w+12, p.h+12, 10); ctx.fill(); }
      else ctx.fillRect(p.x-6, py-6, p.w+12, p.h+12);
      ctx.restore();
    }
    ctx.fillStyle=p.alive?'#22c55e':'#7a2b2b'; ctx.fillRect(p.x,py,p.w,p.h);
    ctx.fillStyle='#cfeee0'; ctx.fillRect(p.x+10,py+4,p.w-20,p.h-10);
    ctx.fillStyle='#ffe066'; ctx.fillRect(p.x+p.w-6,py+6,4,6);
  }
  function drawStars(color='#1d2a55'){
    ctx.fillStyle=color;
    for(let i=0;i<60;i++){
      const x=(i*53 + (elapsed*40)%W)%W, y=(i*37)%H;
      ctx.fillRect(x,y,2,2);
    }
  }

  // ===== Loop =====
  function loop(now){
    const dt=Math.min(0.033,(now-last)/1000); last=now;
    if(running && !paused && player.alive) update(dt);
    draw();
    if (timeEl)  timeEl.textContent  = elapsed.toFixed(1);
    if (scoreEl) scoreEl.textContent = String(score);
    requestAnimationFrame(loop);
  }

  // Kick
  requestAnimationFrame(ts=>{ last=ts; draw(); requestAnimationFrame(loop); });
})();
