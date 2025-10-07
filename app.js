/* Lift Runner — canvas prototype (v1.7 — iPhone ready + LIFT tollerante)
 * - iPhone: controlli touch nel canvas (← → hold, ↑/↓ tap, LIFT tap), touchAction:none
 * - Tastiera desktop (e.code + preventDefault), turbo Space
 * - LIFT ora SENZA vincolo corsia: basta essere sopra la piattaforma della direzione corretta
 * - Hitbox più ampia (TOL=22) + evidenziazione piattaforma quando attivabile
 * - Hint "PRESS L / LIFT" sopra l’auto quando sei in presa
 * - Nessun asset esterno
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

  // Focus (per tastiera su desktop)
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
  const LIFT_TOL = 22; // tolleranza laterale generosa

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
    const lane = 1; // estetica allineata al centro, ma NON più vincolante per il trigger
    const x0 = W + 200 + Math.random()*380;
    const yBase = (type === 'up' ? levelY.low : levelY.high);
    lifts.push({
      x: x0, y: yBase - lane*laneGap - 6,
      w: 120, h: 16,
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

  // ===== Swipe dolce orizzontale =====
  let swipeStart = null;
  canvas.addEventListener('touchstart', e => { swipeStart = e.touches[0]; }, {passive:true});
  canvas.addEventListener('touchmove', e => {
    if (!swipeStart) return;
    const dx = e.touches[0].clientX - swipeStart.clientX;
    if (Math.abs(dx) > 16) player.vx = Math.sign(dx) * 1.2;
  }, {passive:true});
  canvas.addEventListener('touchend', () => { player.vx = 0; swipeStart = null; });

  // ===== Bottoni touch disegnati nel canvas =====
  const BTN = {
    left:  { x: 16,       y: H - 84, w: 56, h: 56, hold:false },
    right: { x: 16 + 64,  y: H - 84, w: 56, h: 56, hold:false },
    up:    { x: W - 64,   y: H - 160,w: 48, h: 48, flash:0 },
    down:  { x: W - 64,   y: H - 100,w: 48, h: 48, flash:0 },
    lift:  { x: (W/2)-48, y: H - 84, w: 96, h: 56, flash:0 }
  };
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
  canvas.addEventListener('pointerup',     e => { e.preventDefault(); releaseHolds(); }, {passive:false});
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
  function ensureAudio(){ if (!audioCtx) { try { audioCtx = new (window.AudioContext||window.webkitAudioContext)(); } catch {} } }
  function beep(freq=880, dur=0.06, gain=0.08){
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'square'; osc.frequency.setValueAtTime(freq, t0);
    g.gain.value = gain; osc.connect(g).connect(audioCtx.destination);
    osc.start(t0); osc.stop(t0 + dur);
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

  // Ritorna il lift attivabile (stesso piano/direzione), SENZA vincolo corsia
  function eligibleLift(){
    if (!player.alive || player.lifting) return null;
    const needDir = (player.level === 'low') ? 'up' : 'down';
    // preferisci quello più vicino al centro del player
    let best=null, bestDx=1e9;
    for (const L of lifts){
      if (!L.active || L.dir !== needDir) continue;
      if (!rectOverlap(player, L, LIFT_TOL)) continue;
      const dx = Math.abs((player.x + player.w/2) - (L.x + L.w/2));
      if (dx < bestDx) { best=L; bestDx=dx; }
    }
    return best;
  }

  function tryLift(){
    const L = eligibleLift();
    if (!L) return;
    player.lifting = true;
    const delta = (levelY.low - levelY.high) * (L.dir === 'up' ? 1 : -1);
    liftAnim = { t:0, fromY: player.y, toY: player.y - delta };
    L.active = false;
  }

  // HUD e hint
  let lastEligibleDir = null;
  let hintPressL = false;
  let eligibleCurrent = null; // per evidenziare il lift nel draw
  function updateHudEligible(){
    const L = eligibleLift();
    eligibleCurrent = L;
    let label = 'LIFT';
    let dir = null;
    if (L) { dir = L.dir; label = (dir === 'up') ? 'LIFT ↑ ✓' : 'LIFT ↓ ✓'; }
    liftBtn.textContent = label;
    if (dir !== lastEligibleDir){
      if (dir) beep(dir === 'up' ? 920 : 720, 0.045, 0.07);
      lastEligibleDir = dir;
    }
    hintPressL = !!L;
  }

  // ===== Loop =====
  let last = performance.now();
  let elapsed = 0;
  let score = 0;

  function update(dt){
    const turboOn = !!keys['Space'];
    const targetSpeed = turboOn ? player.turbo : player.speed;

    // Orizzontale: tastiera o touch-hold
    const right = keys['ArrowRight'] || keys['KeyD'] || BTN.right.hold;
    const left  = keys['ArrowLeft']  || keys['KeyA'] || BTN.left.hold;
    player.vx = right ? 1 : left ? -1 : 0;
    player.x += player.vx * 180 * dt;
    player.x = Math.max(40, Math.min(W*0.6, player.x));

    // Cambio corsia tastiera
    if ((keys['ArrowUp']||keys['KeyW']) && !player.lifting) { laneUp();   keys['ArrowUp']=keys['KeyW']=false; }
    if ((keys['ArrowDown']||keys['KeyS']) && !player.lifting){ laneDown(); keys['ArrowDown']=keys['KeyS']=false; }

    // Y / lift anim
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

    // Cleanup & spawn
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
    for (const L of lifts) drawLift(L, L===eligibleCurrent);

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
   
