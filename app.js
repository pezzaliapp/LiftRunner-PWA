/* Lift Runner — v2.0 (solido, iPhone-ready, start overlay)
 * - Funziona con il tuo HTML (time/score/liftBtn/pauseBtn)
 * - START overlay nel canvas, avvio con tap o tasto
 * - Controlli touch (soft-buttons + aree sinistra/destra), tastiera desktop
 * - Lift UP/DOWN, auto-lift (150ms) + manuale (L o bottone)
 * - Collisioni tolleranti, corridoi più larghi
 */

(() => {
  // ===== Canvas & UI =====
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  const timeEl  = document.getElementById('time');
  const scoreEl = document.getElementById('score');
  const liftBtn = document.getElementById('liftBtn');
  const pauseBtn= document.getElementById('pauseBtn');

  // iPhone: blocca gesture
  canvas.style.touchAction = 'none';

  // Focus per tastiera desktop
  canvas.tabIndex = 0;
  const focusCanvas = () => { try { canvas.focus(); } catch(_){} };
  window.addEventListener('load', focusCanvas);
  canvas.addEventListener('pointerdown', focusCanvas);

  // ===== Mondo & Player =====
  const LANES = 3;
  const laneGap = 32;
  const levelY = { low: H - 120, high: H - 320 };
  const roadH = 12;
  const BASE_SCROLL = 3.0;

  const player = {
    x: 120, y: levelY.low - 2*laneGap,
    w: 50, h: 24,
    vx: 0,
    speed: 3.6, turbo: 6.2,
    level: 'low',         // 'low' | 'high'
    lane: 1,              // 0..2
    alive: true,
    lifting: false
  };

  const obstacles = [];   // {x,y,w,h,level,lane,speed}
  const lifts = [];       // {x,y,w,h,dir:'up'|'down',active,alignedLane}

  // ===== Spawn =====
  function spawnObstacle() {
    const level = Math.random() < 0.5 ? 'low' : 'high';
    const lane = Math.floor(Math.random()*LANES);
    const lastX = obstacles.length ? obstacles[obstacles.length-1].x : W;
    const minGapX = 140 + Math.random()*90; // corridoi larghi
    obstacles.push({
      x: Math.max(W + 40, lastX + minGapX),
      y: (level==='low' ? levelY.low : levelY.high) - lane*laneGap - 6,
      w: 40, h: 20, level, lane,
      speed: BASE_SCROLL + Math.random()*1.2
    });
  }
  function spawnLift(dir = (Math.random() < 0.6 ? 'up' : 'down')) {
    const lane = 1;                   // centrale (più facile)
    const yBase = (dir==='up' ? levelY.low : levelY.high);
    const lastX = lifts.length ? lifts[lifts.length-1].x : W;
    const gap = 260 + Math.random()*160;
    lifts.push({
      x: Math.max(W + 160, lastX + gap),
      y: yBase - lane*laneGap - 6,
      w: 140, h: 16,
      dir, active: true,
      alignedLane: lane
    });
  }

  // Precarico (mostra qualcosa anche prima di partire)
  for (let i=0;i<3;i++) spawnObstacle();
  spawnLift('up'); spawnLift('down');

  // ===== Stato gioco =====
  let running = false;   // overlay START finché false
  let paused  = false;
  let last    = performance.now();
  let elapsed = 0;
  let score   = 0;

  // ===== Input tastiera =====
  const keys = Object.create(null);
  const handled = new Set([
    'ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS','Space','KeyL','KeyP','KeyR'
  ]);
  window.addEventListener('keydown', e => {
    const code = e.code || e.key; keys[code] = true;
    if (handled.has(code)) e.preventDefault();
    if (!running) startGame();
    if (code==='KeyP') togglePause();
    if (code==='KeyL') tryManualLift();
    if (code==='KeyR' && !player.alive) toStart();
  }, {passive:false});
  window.addEventListener('keyup', e => {
    const code = e.code || e.key; keys[code] = false;
    if (handled.has(code)) e.preventDefault();
  }, {passive:false});

  if (liftBtn) liftBtn.addEventListener('click', () => { tryManualLift(); if (!running) startGame(); });
  if (pauseBtn) pauseBtn.addEventListener('click', togglePause);

  // ===== Touch / Pointer (iPhone) =====
  // Zone grandi + soft buttons nel canvas
  let holdLeft = false, holdRight = false;

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (!running) startGame();
    const pt = getPoint(e);
    if (hit(pt, BTN.up))   { laneUp();   BTN.up.flash   = performance.now()+120; return; }
    if (hit(pt, BTN.down)) { laneDown(); BTN.down.flash = performance.now()+120; return; }
    if (hit(pt, BTN.lift)) { BTN.lift.flash = performance.now()+140; tryManualLift(); return; }

    // Aree laterali (hold)
    if      (pt.x <  W*0.33) { holdLeft  = true; return; }
    else if (pt.x >= W*0.67) { holdRight = true; return; }
  }, {passive:false});
  const release = () => { holdLeft=false; holdRight=false; };
  ['pointerup','pointerleave','pointercancel'].forEach(t=>{
    canvas.addEventListener(t, e=>{ e.preventDefault(); release(); }, {passive:false});
  });
  canvas.addEventListener('pointermove', e => {
    if (!running || !(e.buttons & 1)) return;
    const pt = getPoint(e);
    holdLeft  = (pt.x <  W*0.33);
    holdRight = (pt.x >= W*0.67);
  }, {passive:true});

  function getPoint(ev){
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width / r.width, sy = canvas.height / r.height;
    return { x:(ev.clientX-r.left)*sx, y:(ev.clientY-r.top)*sy };
  }

  // ===== START / PAUSA =====
  function startGame(){
    running = true;
    paused = false;
    last = performance.now();

    // reset base
    obstacles.length = 0; lifts.length = 0;
    for (let i=0;i<3;i++) spawnObstacle();
    spawnLift('up'); spawnLift('down');

    player.x = 120; player.level='low'; player.lane=1;
    player.alive = true; player.lifting = false;
    elapsed = 0; score = 0;
  }
  function toStart(){ running = false; paused = false; }
  function togglePause(){
    if (!running) return;
    paused = !paused;
    if (!paused) last = performance.now();
    if (pauseBtn) pauseBtn.textContent = paused ? 'Resume' : 'Pausa';
  }

  // ===== Lift =====
  let liftAnim = null;            // {t,fromY,toY}
  let eligibleSince = 0;          // ms
  const AUTO_LIFT_DELAY = 150;    // ms
  const LIFT_TOL = 18;            // X tolerance

  function currentEligibleLift(){
    if (!player.alive || player.lifting) return null;
    const needDir = (player.level === 'low') ? 'up' : 'down';
    for (const L of lifts){
      if (!L.active || L.dir !== needDir) continue;
      // vincolo corsia: centrale, per coerenza col disegno
      if (player.lane !== L.alignedLane) continue;
      if (player.x + player.w > L.x - LIFT_TOL && player.x < L.x + L.w + LIFT_TOL &&
          player.y + player.h > L.y && player.y < L.y + L.h) return L;
    }
    return null;
  }
  function tryManualLift(){
    const L = currentEligibleLift();
    if (L) startLift(L);
  }
  function startLift(L){
    player.lifting = true;
    const delta = (levelY.low - levelY.high) * (L.dir === 'up' ? 1 : -1);
    liftAnim = { t:0, fromY: player.y, toY: player.y - delta };
    L.active = false;
  }

  // ===== Update / Draw =====
  function update(dt){
    const turboOn = !!keys['Space'];
    const targetSpeed = turboOn ? player.turbo : player.speed;

    // Orizzontale: tastiera + aree touch
    const right = keys['ArrowRight'] || keys['KeyD'] || holdRight;
    const left  = keys['ArrowLeft']  || keys['KeyA'] || holdLeft;
    player.vx = right ? 1 : left ? -1 : 0;
    player.x += player.vx * 180 * dt;
    player.x = Math.max(40, Math.min(W*0.6, player.x));

    // Cambio corsia tastiera (edge)
    if ((keys['ArrowUp']||keys['KeyW']) && !player.lifting){ laneUp();   keys['ArrowUp']=keys['KeyW']=false; }
    if ((keys['ArrowDown']||keys['KeyS']) && !player.lifting){ laneDown(); keys['ArrowDown']=keys['KeyS']=false; }

    // Y / Lift anim
    if (!player.lifting){
      const base = (player.level==='low') ? levelY.low : levelY.high;
      const targetY = base - player.lane*laneGap - (player.h/2);
      player.y += (targetY - player.y) * Math.min(1, dt*10);
    } else {
      const dur = 0.85; liftAnim.t += dt/dur;
      const k = easeInOutCubic(Math.min(1, liftAnim.t));
      player.y = liftAnim.fromY + (liftAnim.toY - liftAnim.fromY)*k;
      if (liftAnim.t >= 1){
        player.lifting = false;
        player.level = (player.level==='low') ? 'high' : 'low';
        liftAnim = null;
      }
    }

    // Auto-lift
    const L = currentEligibleLift();
    if (L){
      if (!eligibleSince) eligibleSince = performance.now();
      else if (performance.now()-eligibleSince >= AUTO_LIFT_DELAY) startLift(L);
    } else {
      eligibleSince = 0;
    }

    // Scorrimento
    for (const o of obstacles){
      const boost = (player.level===o.level ? targetSpeed*0.45 : targetSpeed*0.25);
      o.x -= (o.speed + boost) * dt * 60;
    }
    for (const l of lifts){
      const boost = 1.1 + (turboOn ? 0.4 : 0);
      l.x -= (BASE_SCROLL + boost) * dt * 60;
    }

    // Cleanup & respawn
    for (let i=obstacles.length-1;i>=0;i--) if (obstacles[i].x + obstacles[i].w < -60) obstacles.splice(i,1);
    for (let i=lifts.length-1;i>=0;i--)     if (lifts[i].x + lifts[i].w < -70)   lifts.splice(i,1);
    if (obstacles.length < 5 && Math.random()<0.06) spawnObstacle();
    const upCount   = lifts.filter(l=>l.dir==='up').length;
    const downCount = lifts.filter(l=>l.dir==='down').length;
    if (upCount   < 2 && Math.random()<0.10) spawnLift('up');
    if (downCount < 2 && Math.random()<0.08) spawnLift('down');

    // Collisioni (pad negativo = più permissivo)
    for (const o of obstacles){
      if (o.level !== player.level) continue;
      if (overlapRelaxed(player,o,-3)) { player.alive=false; running=false; break; }
    }

    // HUD
    elapsed += dt;
    score   += Math.floor((turboOn ? 14 : 10) * dt);
    if (timeEl)  timeEl.textContent  = elapsed.toFixed(1);
    if (scoreEl) scoreEl.textContent = score;
  }

  function laneUp(){ if (!player.lifting && player.lane < LANES-1) player.lane++; }
  function laneDown(){ if (!player.lifting && player.lane > 0) player.lane--; }

  function overlapRelaxed(a,b,pad){
    return a.x - pad < b.x + b.w + pad &&
           a.x + a.w + pad > b.x - pad &&
           a.y - pad < b.y + b.h + pad &&
           a.y + a.h + pad > b.y - pad;
  }

  // ===== Disegno =====
  const BTN = {
    left:  { x: 16,      y: H-84, w:56, h:56, hold:false }, // solo grafica (aree grandi usate sopra)
    right: { x: 16+64,   y: H-84, w:56, h:56, hold:false },
    up:    { x: W-64,    y: H-160, w:48, h:48, flash:0 },
    down:  { x: W-64,    y: H-100, w:48, h:48, flash:0 },
    lift:  { x: (W/2)-48,y: H-84,  w:96, h:56, flash:0 }
  };

  function draw(){
    ctx.clearRect(0,0,W,H);
    drawStars();
    drawRoad(levelY.high);
    drawRoad(levelY.low);

    for (const l of lifts) drawLift(l);
    for (const o of obstacles) drawObstacle(o);
    drawCar(player);

    // Hint READY
    const el = currentEligibleLift();
    if (el && player.alive && !player.lifting){
      ctx.save();
      ctx.font = 'bold 16px system-ui,Segoe UI,Arial';
      ctx.fillStyle = '#eaffef'; ctx.textAlign = 'center';
      ctx.fillText('LIFT READY', player.x + player.w/2, player.y - 14);
      ctx.restore();
    }

    // Soft buttons
    const now = performance.now();
    drawBtn(BTN.left,  holdLeft,  '←');
    drawBtn(BTN.right, holdRight, '→');
    drawBtn(BTN.up,    now < BTN.up.flash,   '↑', 'bold 20px system-ui,Segoe UI,Arial');
    drawBtn(BTN.down,  now < BTN.down.flash, '↓', 'bold 20px system-ui,Segoe UI,Arial');
    drawBtn(BTN.lift,  now < BTN.lift.flash, el ? 'LIFT ✓' : 'LIFT', 'bold 18px system-ui,Segoe UI,Arial');

    // Overlays
    if (!running || paused || !player.alive){
      ctx.fillStyle = 'rgba(8,12,28,0.72)';
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle = '#ecf2ff'; ctx.textAlign = 'center';
      if (!running){
        ctx.font = 'bold 34px system-ui,Segoe UI,Arial';
        ctx.fillText('TAP ANYWHERE TO START', W/2, H/2);
        ctx.font = '15px system-ui,Segoe UI,Arial';
        ctx.fillText('Muovi: tieni premuto sinistra/destra • ↑/↓ tap • LIFT automatico', W/2, H/2+28);
      } else if (paused){
        ctx.font = 'bold 34px system-ui,Segoe UI,Arial';
        ctx.fillText('PAUSA', W/2, H/2);
      } else if (!player.alive){
        ctx.font = 'bold 34px system-ui,Segoe UI,Arial';
        ctx.fillText('GAME OVER', W/2, H/2);
        ctx.font = '15px system-ui,Segoe UI,Arial';
        ctx.fillText('Tocca per ripartire', W/2, H/2+28);
      }
    }
  }

  function drawRoad(yBase){
    ctx.fillStyle = '#0f1834'; ctx.fillRect(0,yBase,W,roadH);
    ctx.strokeStyle = '#223069'; ctx.lineWidth = 2;
    for (let i=0;i<LANES;i++){
      const y = yBase - i*laneGap - laneGap/2;
      ctx.setLineDash([12,10]); ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  function drawLift(L){
    ctx.fillStyle = L.active ? '#2dd36f' : '#2a7a54';
    ctx.fillRect(L.x, L.y, L.w, L.h);
    // piloni fino al piano basso
    ctx.fillStyle = '#1b254d';
    ctx.fillRect(L.x+6, levelY.low-4, 8, -(levelY.low - (L.y+L.h)));
    ctx.fillRect(L.x+L.w-14, levelY.low-4, 8, -(levelY.low - (L.y+L.h)));
    // freccia
    ctx.fillStyle = '#eaffef';
    const cx = L.x + L.w/2, cy = L.y + L.h/2;
    ctx.beginPath();
    if (L.dir === 'up'){ ctx.moveTo(cx, cy-6); ctx.lineTo(cx-6, cy+4); ctx.lineTo(cx+6, cy+4); }
    else { ctx.moveTo(cx, cy+6); ctx.lineTo(cx-6, cy-4); ctx.lineTo(cx+6, cy-4); }
    ctx.closePath(); ctx.fill();
  }
  function drawObstacle(o){
    ctx.fillStyle = '#ef4444'; ctx.fillRect(o.x,o.y,o.w,o.h);
    ctx.fillStyle = '#ffd4d4'; ctx.fillRect(o.x+4,o.y+4,o.w-8,6);
  }
  function drawCar(p){
    ctx.fillStyle = p.alive ? '#22c55e' : '#7a2b2b';
    ctx.fillRect(p.x,p.y,p.w,p.h);
    ctx.fillStyle = '#cfeee0'; ctx.fillRect(p.x+10,p.y+4,p.w-20,p.h-10);
    ctx.fillStyle = '#ffe066'; ctx.fillRect(p.x+p.w-6,p.y+6,4,6);
  }

  // Soft button drawing
  function drawBtn(b, pressed, label, font='bold 22px system-ui,Segoe UI,Arial'){
    const r = 12;
    // shadow
    ctx.fillStyle='rgba(0,0,0,0.35)';
    roundRect(b.x+2,b.y+4,b.w,b.h,r); ctx.fill();
    // body
    ctx.fillStyle = pressed ? '#1c8c7a' : '#1a2755';
    ctx.strokeStyle = pressed ? '#54e0c2' : '#2dd4bf'; ctx.lineWidth = 2;
    roundRect(b.x,b.y,b.w,b.h,r); ctx.fill(); ctx.stroke();
    // label
    ctx.fillStyle='#e6f7ff'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font = font; ctx.fillText(label, b.x + b.w/2, b.y + b.h/2);
  }
  function roundRect(x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
    ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
  }

  function drawStars(){
    ctx.fillStyle = '#0b1022'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = '#1d2a55';
    for (let i=0;i<60;i++){
      const x = (i*53 + (elapsed*40)%W) % W;
      const y = (i*37) % H;
      ctx.fillRect(x,y,2,2);
    }
  }

  function easeInOutCubic(t){ return t<0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; }

  // ===== Loop =====
  function loop(now){
    const dt = Math.min(0.033, (now - last)/1000);
    last = now;

    if (running && !paused && player.alive) update(dt);
    draw();

    // HUD time/score anche da fermi
    if (timeEl && scoreEl && (!running || paused || !player.alive)){
      timeEl.textContent = elapsed.toFixed(1);
      scoreEl.textContent = String(score);
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(ts => { last = ts; draw(); requestAnimationFrame(loop); });

})();
