/* Lift Runner — canvas prototype (v1.2)
 * Migliorie:
 *  - Input tastiera robusto (e.code, preventDefault per Space/Arrow/L/P)
 *  - Turbo evidente (Space) e scorrimento dt-scaled
 *  - Focus automatico canvas
 *  - Lifts bidirezionali: UP (dal piano basso al piano alto) e DOWN (dal piano alto al piano basso)
 *  - HUD "LIFT ↑ ✓" / "LIFT ↓ ✓" quando l’auto è allineata; beep sintetico su stato "agganciabile"
 *  - Nessun asset esterno
 */

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  // Focus tastiera
  canvas.tabIndex = 0;
  window.addEventListener('load', () => { try{ canvas.focus(); }catch{} });
  canvas.addEventListener('pointerdown', () => { try{ canvas.focus(); }catch{} });

  // UI
  const timeEl  = document.getElementById('time');
  const scoreEl = document.getElementById('score');
  const liftBtn = document.getElementById('liftBtn');
  const pauseBtn= document.getElementById('pauseBtn');

  // Mondo
  const lanesPerLevel = 3;
  const levelY = { low: H - 120, high: H - 320 }; // baseline di ciascun piano
  const laneGap = 28;
  const roadHeight = 12;
  const scrollSpeedBase = 3.2; // "unità/frame", useremo dt*60 per coerenza col prototipo

  const player = {
    x: 120,
    y: levelY.low - 2*laneGap,
    w: 54, h: 28,
    vx: 0,
    speed: 3.6, turbo: 6.2,
    level: 'low', // 'low' | 'high'
    lane: 1,      // 0..2
    alive: true,
    lifting: false
  };

  // Entità
  const obstacles = [];
  const lifts = []; // {x,y,w,h, alignedLane, active, dir: 'up'|'down'}

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
    const lane = 1; // più facile centrare la corsia centrale
    const x0 = W + 200 + Math.random()*400;
    const yBase = (type === 'up' ? levelY.low : levelY.high);
    lifts.push({
      x: x0, y: yBase - lane*laneGap - 6,
      w: 86, h: 16,
      alignedLane: lane,
      active: true,
      dir: type // 'up' = low->high, 'down' = high->low
    });
  }

  // Precarico
  for (let i=0;i<5;i++) spawnObstacle();
  for (let i=0;i<2;i++) spawnLift('up');
  spawnLift('down');

  // ===== INPUT =====
  const keys = Object.create(null);
  const handled = new Set([
    'ArrowLeft','ArrowRight','ArrowUp','ArrowDown',
    'KeyA','KeyD','KeyW','KeyS','Space','KeyL','KeyP','KeyR'
  ]);

  window.addEventListener('keydown', e => {
    const code = e.code || e.key;
    keys[code] = true;
    if (handled.has(code)) e.preventDefault();

    if (code === 'KeyP') togglePause();
    if (code === 'KeyL') tryLift();    // stesso tasto per su o giù in base al lift disponibile
    if (code === 'KeyR' && !player.alive) resetGame();
  }, {passive:false});

  window.addEventListener('keyup', e => {
    const code = e.code || e.key;
    keys[code] = false;
    if (handled.has(code)) e.preventDefault();
  }, {passive:false});

  liftBtn.addEventListener('click', () => tryLift());
  pauseBtn.addEventListener('click', () => togglePause());

  // Touch: swipe orizzontale = vx, bottone HUD = tryLift
  let touchStart = null;
  canvas.addEventListener('touchstart', e => { touchStart = e.touches[0]; }, {passive:true});
  canvas.addEventListener('touchmove', e => {
    if (!touchStart) return;
    const dx = e.touches[0].clientX - touchStart.clientX;
    if (Math.abs(dx) > 16) player.vx = Math.sign(dx) * 1.2;
  }, {passive:true});
  canvas.addEventListener('touchend', () => { player.vx = 0; touchStart = null; });

  // Pausa
  let paused = false;
  function togglePause(){
    paused = !paused;
    pauseBtn.textContent = paused ? 'Resume' : 'Pausa';
    last = performance.now();
    requestAnimationFrame(loop);
  }

  // ===== AUDIO BEEP (sintesi) =====
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
  // sblocca audio al primo input
  ['pointerdown','keydown'].forEach(type=>{
    window.addEventListener(type, () => { ensureAudio(); audioCtx && audioCtx.resume && audioCtx.resume(); }, {once:true});
  });

  // ===== LIFT LOGIC =====
  let liftAnim = null; // {t, fromY, toY}
  function rectOverlap(a,b,pad=0){
    return a.x < b.x + b.w + pad &&
           a.x + a.w > b.x - pad &&
           a.y < b.y + b.h + pad &&
           a.y + a.h > b.y - pad;
  }

  // Rileva se il player è "agganciabile" a un lift su/giù compatibile
  function eligibleLift(){
    if (!player.alive || player.lifting) return null;
    const TOL = 8;
    // Serve un lift del piano corrente: su (se low) o giù (se high)
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
    const delta = (levelY.low - levelY.high) * (L.dir === 'up' ? 1 : -1); // verso alto o basso
    liftAnim = { t:0, fromY: player.y, toY: player.y - delta };
    L.active = false;
  }

  // HUD beep quando cambia stato "agganciabile"
  let lastEligibleDir = null; // 'up' | 'down' | null
  function updateHudEligible(){
    const L = eligibleLift();
    let label = 'LIFT';
    let dir = null;
    if (L) {
      dir = L.dir;
      label = (dir === 'up') ? 'LIFT ↑ ✓' : 'LIFT ↓ ✓';
    }
    liftBtn.textContent = label;

    if (dir !== lastEligibleDir){
      if (dir) { // appena diventato agganciabile
        beep(dir === 'up' ? 920 : 720, 0.045, 0.07);
      }
      lastEligibleDir = dir;
    }
  }

  // ===== GAME LOOP =====
  let last = performance.now();
  let elapsed = 0;
  let score = 0;

  function update(dt){
    const turboOn = !!keys['Space'];
    const targetSpeed = turboOn ? player.turbo : player.speed;

    // Movimento X player
    const right = keys['ArrowRight'] || keys['KeyD'];
    const left  = keys['ArrowLeft']  || keys['KeyA'];
    player.vx = right ? 1 : left ? -1 : 0;
    player.x += player.vx * 180 * dt;
    player.x = Math.max(40, Math.min(W*0.6, player.x));

    // Cambio corsia (edge triggered)
    if ((keys['ArrowUp']||keys['KeyW']) && !player.lifting) {
      if (player.lane < lanesPerLevel-1) player.lane++;
      keys['ArrowUp'] = keys['KeyW'] = false;
    }
    if ((keys['ArrowDown']||keys['KeyS']) && !player.lifting) {
      if (player.lane > 0) player.lane--;
      keys['ArrowDown'] = keys['KeyS'] = false;
    }

    // Y / animazioni lift
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

    // Scorrimento mondo (dt*60 per compatibilità con scale originali)
    for (const o of obstacles) {
      const boost = (player.level===o.level ? targetSpeed*0.45 : targetSpeed*0.25);
      o.x -= (o.speed + boost) * dt * 60;
    }
    for (const L of lifts) {
      const boost = 1.4 + (turboOn? 0.6 : 0.2);
      L.x -= (scrollSpeedBase + boost) * dt * 60;
    }

    // Cleanup & respawn
    for (let i=obstacles.length-1;i>=0;i--) if (obstacles[i].x + obstacles[i].w < -40) obstacles.splice(i,1);
    for (let i=lifts.length-1;i>=0;i--)     if (lifts[i].x + lifts[i].w < -40)   lifts.splice(i,1);

    if (obstacles.length < 6) spawnObstacle();
    // Mantieni 1–2 lift up e 1–2 lift down in coda
    const upCount   = lifts.filter(L=>L.dir==='up').length;
    const downCount = lifts.filter(L=>L.dir==='down').length;
    if (upCount   < 2 && Math.random()<0.010) spawnLift('up');
    if (downCount < 2 && Math.random()<0.010) spawnLift('down');

    // Collisioni (stesso piano)
    for (const o of obstacles){
      if (o.level === player.level && rectOverlap(player,o)) {
        player.alive = false;
        break;
      }
    }

    // HUD stato lift
    updateHudEligible();

    // Tempo e punteggio
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

    drawCar(player);
  }

  function drawLift(L){
    // piattaforma
    ctx.fillStyle = L.active ? '#2dd36f' : '#2a7a54';
    ctx.fillRect(L.x, L.y, L.w, L.h);
    // piloni fino al piano basso
    ctx.fillStyle = '#1b254d';
    ctx.fillRect(L.x+6, levelY.low-4, 8, -(levelY.low - (L.y+L.h)));
    ctx.fillRect(L.x+L.w-14, levelY.low-4, 8, -(levelY.low - (L.y+L.h)));
    // freccia direzione
    ctx.fillStyle = '#eaffef';
    const cx = L.x + L.w/2, cy = L.y + L.h/2;
    ctx.beginPath();
    if (L.dir === 'up'){
      ctx.moveTo(cx, cy-6); ctx.lineTo(cx-6, cy+4); ctx.lineTo(cx+6, cy+4);
    } else {
      ctx.moveTo(cx, cy+6); ctx.lineTo(cx-6, cy-4); ctx.lineTo(cx+6, cy-4);
    }
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
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
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

  function easeInOutCubic(t){
    return t<0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
  }

  function loop(now){
    if (paused) return;
    const dt = Math.min(0.033, (now - last)/1000);
    last = now;
    if (player.alive) update(dt);
    draw();

    if (!player.alive){
      // overlay
      ctx.fillStyle = 'rgba(8,12,28,0.6)';
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle = '#ecf2ff';
      ctx.font = 'bold 32px system-ui,Segoe UI,Arial';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', W/2, H/2 - 10);
      ctx.font = '16px system-ui,Segoe UI,Arial';
      ctx.fillText('Premi R per ricominciare', W/2, H/2 + 22);
      return;
    }
    requestAnimationFrame(loop);
  }

  function resetGame(){
    obstacles.length = 0; lifts.length = 0;
    for (let i=0;i<5;i++) spawnObstacle();
    for (let i=0;i<2;i++) spawnLift('up');
    spawnLift('down');
    player.x = 120;
    player.level='low';
    player.lane = 1;
    player.alive = true;
    player.lifting = false;
    elapsed = 0; score = 0; last = performance.now();
    requestAnimationFrame(loop);
  }

  // Start
  requestAnimationFrame(ts => { last = ts; loop(ts); });
})();
