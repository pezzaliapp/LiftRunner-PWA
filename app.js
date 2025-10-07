/* Lift Runner — canvas prototype (v1.6 — iPhone ready)
 * - Controlli touch nel canvas: ← → (hold), ↑/↓ (tap), LIFT (tap)
 * - Nessuna modifica all’HTML: i bottoni sono disegnati e gestiti via JS
 * - Disabilita scroll/zoom su canvas (touchAction:none, preventDefault su touch/pointer)
 * - Lifts bidirezionali con stesso tasto L / bottone LIFT
 * - Input tastiera ancora attivo per desktop (e.code + preventDefault)
 * - Turbo (Space), movimento dt-scaled, hint “PRESS L”
 * - WebAudio sbloccato al primo tap
 */

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  // iPhone: evita scroll/zoom durante il gioco
  canvas.style.touchAction = 'none';
  document.addEventListener('gesturestart', e => e.preventDefault(), {passive:false});
  document.addEventListener('gesturechange', e => e.preventDefault(), {passive:false});
  document.addEventListener('gestureend', e => e.preventDefault(), {passive:false});

  // Focus tastiera (per desktop)
  canvas.tabIndex = 0;
  const giveFocus = () => { try{ canvas.focus(); }catch{} };
  window.addEventListener('load', giveFocus);
  canvas.addEventListener('pointerdown', giveFocus);

  // UI DOM
  const timeEl  = document.getElementById('time');
  const scoreEl = document.getElementById('score');
  const liftBtn = document.getElementById('liftBtn');
  const pauseBtn= document.getElementById('pauseBtn');

  // Mondo
  const lanesPerLevel = 3;
  const levelY = { low: H - 120, high: H - 320 };
  const laneGap = 28;
  const roadHeight = 12;
  const scrollSpeedBase = 3.2;

  const player = {
    x: 120,
    y: levelY.low - 2*laneGap,
    w: 54, h: 28,
    vx: 0,
    speed: 3.6, turbo: 6.2,
    level: 'low',
    lane: 1,
    alive: true,
    lifting: false
  };

  const obstacles = [];
  const lifts = []; // {x,y,w,h,alignedLane,active,dir:'up'|'down'}

  // Spawn
  function spawnObstacle() {
    const level = Math.random() < 0.55 ? 'low' : 'high';
    const lane = Math.floor(Math.random() * lanesPerLevel);
    obstacles.push({
      x: W + 20 + Math.random()*200,
      y: (level==='low'? levelY.low : levelY.high) - lane*laneGap - 4,
      w: 44, h: 22, level, lane,
      speed: scrollSpeedBase + Math.random()*1.4
    });
  }
  function spawnLift(type = (Math.random() < 0.6 ? 'up' : 'down')) {
    const lane = 1; // centrale
    const x0 = W + 200 + Math.random()*380;
    const yBase = (type === 'up' ? levelY.low : levelY.high);
    lifts.push({
      x: x0, y: yBase - lane*laneGap - 6,
      w: 120, h: 16,          // un po' più lungo per facilità
      alignedLane: lane,
      active: true,
      dir: type
    });
  }
  for (let i=0;i<5;i++) spawnObstacle();
  for (let i=0;i<2;i++) spawnLift('up');
  spawnLift('down');

  // ===== Tastiera (desktop) =====
  const keys = Object.create(null);
  const handled = new Set([
    'ArrowLeft','ArrowRight','ArrowUp','ArrowDown',
    'KeyA','KeyD','KeyW','KeyS','Space','KeyL','KeyP','KeyR'
  ]);
  function onKeyDown(e){
    const code = e.code || e.key;
    keys[code] = true;
    if (handled.has(code)) e.preventDefault();
    if (code === 'KeyP') togglePause();
    if (code === 'KeyL') tryLift();
    if (code === 'KeyR' && !player.alive) resetGame();
  }
  function onKeyUp(e){
    const code = e.code || e.key;
    keys[code] = false;
    if (handled.has(code)) e.preventDefault();
  }
  window.addEventListener('keydown', onKeyDown, {passive:false});
  window.addEventListener('keyup',   onKeyUp,   {passive:false});

  // ===== Touch/Pointer per movimento orizzontale (swipe dolce) =====
  let swipeStart = null;
  canvas.addEventListener('touchstart', e => { swipeStart = e.touches[0]; }, {passive:true});
  canvas.addEventListener('touchmove', e => {
    if (!swipeStart) return;
    const dx = e.touches[0].clientX - swipeStart.clientX;
    if (Math.abs(dx) > 16) player.vx = Math.sign(dx) * 1.2;
  }, {passive:true});
  canvas.addEventListener('touchend', () => { player.vx = 0; swipeStart = null; });

  // ===== Bottoni touch disegnati nel canvas =====
  // Layout: sinistra ← → ; destra ↑ ↓ ; centro-basso LIFT
  const BTN = {
    left:  { x: 16,       y: H - 84, w: 56, h: 56, hold:false },
    right: { x: 16 + 64,  y: H - 84, w: 56, h: 56, hold:false },
    up:    { x: W - 64,   y: H - 160,w: 48, h: 48, flash:0 },
    down:  { x: W - 64,   y: H - 100,w: 48, h: 48, flash:0 },
    lift:  { x: (W/2)-48, y: H - 84, w: 96, h: 56, flash:0 }
  };
  function setBtnGeometry(){ // ricomputa se cambi dimensioni canvas (non previsto qui)
    BTN.left.y = BTN.right.y = BTN.lift.y = H - 84;
    BTN.up.y = H - 160; BTN.down.y = H - 100;
    BTN.up.x = BTN.down.x = W - 64;
    BTN.lift.x = (W/2)-48;
  }

  function roundRect(x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y);
    ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h-r);
    ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    ctx.lineTo(x+r, y+h);
    ctx.quadraticCurveTo(x, y+h, x, y+h-r);
    ctx.lineTo(x, y+r);
    ctx.quadraticCurveTo(x, y, x+r, y);
    ctx.closePath();
  }
  function drawBtnRect(b, pressed, label, font='bold 22px system-ui,Segoe UI,Arial'){
    const r = 12;
    // ombra
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(b.x+2, b.y+4, b.w, b.h, r); ctx.fill();
    // pulsante
    ctx.fillStyle = pressed ? '#1c8c7a' : '#1a2755';
    ctx.strokeStyle = pressed ? '#54e0c2' : '#2dd4bf';
    ctx.lineWidth = 2;
    roundRect(b.x, b.y, b.w, b.h, r); ctx.fill(); ctx.stroke();
    // label
    ctx.fillStyle = '#e6f7ff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = font;
    ctx.fillText(label, b.x + b.w/2, b.y + b.h/2);
  }
  function pointFromEvent(ev){
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = ('touches' in ev && ev.touches.length) ? ev.touches[0].clientX : ev.clientX;
    const clientY = ('touches' in ev && ev.touches.length) ? ev.touches[0].clientY : ev.clientY;
    return { x: (clientX - rect.left)*scaleX, y: (clientY - rect.top)*scaleY };
  }
  function hit(pt, b){ return pt.x>=b.x && pt.x<=b.x+b.w && pt.y>=b.y && pt.y<=b.y+b.h; }

  function laneUp(){ if (!player.lifting && player.lane < lanesPerLevel-1) player.lane++; }
  function laneDown(){ if (!player.lifting && player.lane > 0) player.lane--; }
  function flash(b){ b.flash = performance.now()+120; }

  // Pointer handling (iPhone-friendly): preventDefault per evitare scroll
  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    const pt = pointFromEvent(e);
    if (hit(pt, BTN.left))  { BTN.left.hold = true;  return; }
    if (hit(pt, BTN.right)) { BTN.right.hold = true; return; }
    if (hit(pt, BTN.up))    { laneUp();   flash(BTN.up);   return; }
    if (hit(pt, BTN.down))  { laneDown(); flash(BTN.down); return; }
    if (hit(pt, BTN.lift))  { tryLift();  flash(BTN.lift); return; }
  }, {passive:false});
  const releaseHolds = () => { BTN.left.hold = BTN.right.hold = false; };
  canvas.addEventListener('pointerup',   e => { e.preventDefault(); releaseHolds(); }, {passive:false});
  canvas.addEventListener('pointercancel', e => { e.preventDefault(); releaseHolds(); }, {passive:false});
  canvas.addEventListener('pointerleave',  e => { e.preventDefault(); releaseHolds(); }, {passive:false});

  // ===== Pausa =====
  let paused = false;
  function togglePause(){
    paused = !paused;
    pauseBtn.textContent = paused ? 'Resume' : 'Pausa';
    last = performance.now();
    requestAnimationFrame(loop);
  }
  liftBtn.addEventListener('click', () => tryLift());
  pauseBtn.addEventListener('click', () => togglePause());

  // ===== Audio (beep sintetico) =====
  let audioCtx = null;
  function ensureAudio(){
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext||window.webkitAudioContext)(); } catch {}
    }
  }
  function beep(freq=880, dur=0.06, gain=0.08){
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.value = gain;
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  }
  ['pointerdown','touchstart','keydown'].forEach(type=>{
    window.addEventListener(type, () => { ensureAudio(); audioCtx && audioCtx.resume && audioCtx.resume(); }, {once:true, passive:true});
  });

  // ===== Lift =====
  let liftAnim = null; // {t, fromY, toY}
  function rectOverlap(a,b,pad=0){
    return a.x < b.x + b.w + pad &&
           a.x + a.w > b.x - pad &&
           a.y < b.y + b.h + pad &&
           a.y + a.h > b.y - pad;
  }
  function eligibleLift(){
    if (!player.alive || player.lifting) return null;
    const TOL = 12;
    const needDir = (player.level === 'low') ? 'up' : 'down';
    for (const L of lifts){
      if (!L.active || L.dir !== needDir) continue;
      if (player.lane !== L.alignedLane) continue;
      if (player.x + player.w > L.x - TOL && player.x < L.x + L.w + TOL &&
          player.y + player.h > L.y && player.y < L.y + L.h) {
        return L;
      }
    }
    return null;
  }
  function tryLift(){
    const L = eligibleLift();
    if (!L) return;
    player.lifting = true;
    const delta = (levelY.low - levelY.high) * (L.dir === 'up' ? 1 : -1);
    liftAnim = { t:0, fromY: player.y, toY: player.y - delta };
    L.active = false;
  }

  // HUD (bottone DOM) e hint visivo
  let lastEligibleDir = null;
  function updateHudEligible(){
    const L = eligibleLift();
    let label = 'LIFT';
    let dir = null;
    if (L) { dir = L.dir; label = (dir === 'up') ? 'LIFT ↑ ✓' : 'LIFT ↓ ✓'; }
    liftBtn.textContent = label;
    if (dir !== lastEligibleDir){
      if (dir) beep(dir === 'up' ? 920 : 720, 0.045, 0.07);
      lastEligibleDir = dir;
    }
    // Fumetto "PRESS L" sopra l'auto (utile anche su iPhone per mostrare il momento giusto)
    hintPressL = !!L;
  }
  let hintPressL = false;

  // ===== Loop =====
  let last = performance.now();
  let elapsed = 0;
  let score = 0;

  function update(dt){
    const turboOn = !!keys['Space'];
    const targetSpeed = turboOn ? player.turbo : player.speed;

    // Movimento orizzontale: tastiera o touch-hold
    const right = keys['ArrowRight'] || keys['KeyD'] || BTN.right.hold;
    const left  = keys['ArrowLeft']  || keys['KeyA'] || BTN.left.hold;
    player.vx = right ? 1 : left ? -1 : 0;
    player.x += player.vx * 180 * dt;
    player.x = Math.max(40, Math.min(W*0.6, player.x));

    // Cambio corsia tastiera
    if ((keys['ArrowUp']||keys['KeyW']) && !player.lifting) {
      laneUp(); keys['ArrowUp'] = keys['KeyW'] = false;
    }
    if ((keys['ArrowDown']||keys['KeyS']) && !player.lifting) {
      laneDown(); keys['ArrowDown'] = keys['KeyS'] = false;
    }

    // Y / lift
    if (!player.lifting){
      const base = player.level==='low' ? levelY.low : levelY.high;
      const targetY = base - player.lane*laneGap - (player.h/2);
      player.y += (targetY - player.y) * Math.min(1, dt*10);
    } else {
      const duration = 0.9;
      liftAnim.t += dt/duration;
      const k = easeInOutCubic(Math.min(1, liftAnim.t));
      player.y = liftAnim.fromY + (liftAnim.toY - liftAnim.fromY) * k;
      if (liftAnim.t >= 1){
        player.lifting = false;
        player.level = (player.level === 'low') ? 'high' : 'low';
        liftAnim = null;
      }
    }

    // Scorrimento mondo
    for (const o of obstacles) {
      const boost = (player.level===o.level ? targetSpeed*0.45 : targetSpeed*0.25);
      o.x -= (o.speed + boost) * dt * 60;
    }
    for (const L of lifts) {
      const boost = 1.2 + (turboOn? 0.5 : 0.2);
      L.x -= (scrollSpeedBase + boost) * dt * 60;
    }

    // Cleanup & respawn
    for (let i=obstacles.length-1;i>=0;i--) if (obstacles[i].x + obstacles[i].w < -40) obstacles.splice(i,1);
    for (let i=lifts.length-1;i>=0;i--)     if (lifts[i].x + lifts[i].w < -40)   lifts.splice(i,1);
    if (obstacles.length < 6) spawnObstacle();
    const upCount   = lifts.filter(L=>L.dir==='up').length;
    const downCount = lifts.filter(L=>L.dir==='down').length;
    if (upCount   < 2 && Math.random()<0.010) spawnLift('up');
    if (downCount < 2 && Math.random()<0.010) spawnLift('down');

    // Collisioni
    for (const o of obstacles){
      if (o.level === player.level && rectOverlap(player,o)) { player.alive = false; break; }
    }

    // HUD stato
    updateHudEligible();

    // Score/time
    elapsed += dt;
    score += Math.floor((turboOn ? 14 : 10) * dt);
    timeEl.textContent = elapsed.toFixed(1);
    scoreEl.textContent = score;
  }

  function draw(){
    ctx.clearRect(0,0,W,H);
    drawStars();
    drawRoad(levelY.high);
    drawRoad(levelY.low);

    // Lifts
    for (const L of lifts) drawLift(L);

    // Ostacoli
    for (const o of obstacles){
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = '#ffd4d4';
      ctx.fillRect(o.x+4, o.y+4, o.w-8, 6);
    }

    // Player
    drawCar(player);

    // Hint "PRESS L"
    if (hintPressL && player.alive && !player.lifting){
      ctx.save();
      ctx.font = 'bold 16px system-ui,Segoe UI,Arial';
      ctx.fillStyle = '#eaffef';
      ctx.textAlign = 'center';
      const px = player.x + player.w/2;
      const py = player.y - 14;
      ctx.fillText('PRESS L / LIFT', px, py);
      ctx.restore();
    }

    // Bottoni touch
    const now = performance.now();
    drawBtnRect(BTN.left,  BTN.left.hold,  '←');
    drawBtnRect(BTN.right, BTN.right.hold, '→');
    drawBtnRect(BTN.up,    now < BTN.up.flash,   '↑', 'bold 20px system-ui,Segoe UI,Arial');
    drawBtnRect(BTN.down,  now < BTN.down.flash, '↓', 'bold 20px system-ui,Segoe UI,Arial');
    // LIFT: mostra ✓ se agganciabile
    const can = !!eligibleLift();
    drawBtnRect(BTN.lift,  now < BTN.lift.flash, can ? 'LIFT ✓' : 'LIFT', 'bold 18px system-ui,Segoe UI,Arial');
  }

  function drawLift(L){
    ctx.fillStyle = L.active ? '#2dd36f' : '#2a7a54';
    ctx.fillRect(L.x, L.y, L.w, L.h);
    ctx.fillStyle = '#1b254d';
    ctx.fillRect(L.x+6, levelY.low-4, 8, -(levelY.low - (L.y+L.h)));
    ctx.fillRect(L.x+L.w-14, levelY.low-4, 8, -(levelY.low - (L.y+L.h)));
    ctx.fillStyle = '#eaffef';
    const cx = L.x + L.w/2, cy = L.y + L.h/2;
    ctx.beginPath();
    if (L.dir === 'up'){ ctx.moveTo(cx, cy-6); ctx.lineTo(cx-6, cy+4); ctx.lineTo(cx+6, cy+4); }
    else { ctx.moveTo(cx, cy+6); ctx.lineTo(cx-6, cy-4); ctx.lineTo(cx+6, cy-4); }
    ctx.closePath(); ctx.fill();
  }

  function drawRoad(yBase){
    ctx.fillStyle = '#0f1834';
    ctx.fillRect(0, yBase, W, roadHeight);
    ctx.strokeStyle = '#223069';
    ctx.lineWidth = 2;
    for (let i=0;i<lanesPerLevel;i++){
      const y = yBase - i*laneGap - (laneGap/2);
      ctx.setLineDash([12,10]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawCar(p){
    ctx.fillStyle = p.alive ? '#22c55e' : '#7a2b2b';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#cfeee0';
    ctx.fillRect(p.x+10, p.y+4, p.w-20, p.h-10);
    ctx.fillStyle = '#ffe066';
    ctx.fillRect(p.x+p.w-6, p.y+6, 4, 6);
  }

  function drawStars(){
    ctx.fillStyle = '#0b1022';
    ctx.fillRect(0,0,W,H);
    ctx.fillStyle = '#1d2a55';
    for (let i=0;i<60;i++){
      const x = (i*53 + (elapsed*40)%W)%W;
      const y = (i*37)%H;
      ctx.fillRect(x, y, 2, 2);
    }
  }

  function easeInOutCubic(t){ return t<0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; }

  function loop(now){
    if (paused) return;
    const dt = Math.min(0.033, (now - last)/1000);
    last = now;
    if (player.alive) update(dt);
    draw();

    if (!player.alive){
      ctx.fillStyle = 'rgba(8,12,28,0.6)';
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle = '#ecf2ff';
      ctx.font = 'bold 32px system-ui,Segoe UI,Arial';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', W/2, H/2 - 10);
      ctx.font = '16px system-ui,Segoe UI,Arial';
      ctx.fillText('Tocca LIFT o premi R per ricominciare', W/2, H/2 + 22);
      // restart con R (desktop) o tocco su LIFT
      return;
    }
    requestAnimationFrame(loop);
  }

  function resetGame(){
    obstacles.length = 0; lifts.length = 0;
    for (let i=0;i<5;i++) spawnObstacle();
    for (let i=0;i<2;i++) spawnLift('up');
    spawnLift('down');
    player.x = 120; player.level='low'; player.lane = 1;
    player.alive = true; player.lifting = false;
    elapsed = 0; score = 0; last = performance.now();
    requestAnimationFrame(loop);
  }

  // Start
  requestAnimationFrame(ts => { last = ts; loop(ts); });
})();
