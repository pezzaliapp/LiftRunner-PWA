/* Lift Runner — canvas prototype (v1.1)
 * Fix: key handling Space/L con e.code + preventDefault, HUD "LIFT ✓", aggancio meno stretto
 */

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  // UI
  const timeEl = document.getElementById('time');
  const scoreEl = document.getElementById('score');
  const liftBtn = document.getElementById('liftBtn');
  const pauseBtn = document.getElementById('pauseBtn');

  // World config
  const lanesPerLevel = 3;
  const levelY = { low: H - 120, high: H - 320 };
  const laneGap = 28;
  const roadHeight = 12;
  const scrollSpeedBase = 3.2;

  const player = {
    x: 120, y: levelY.low - 2*laneGap,
    w: 54, h: 28,
    vx: 0, speed: 3.6, turbo: 6.2,
    level: 'low', lane: 1,
    alive: true, lifting: false
  };

  // Obstacles + lifts
  const obstacles = [];
  const lifts = [];

  // Spawn helpers
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

  function spawnLift() {
    const lane = 1; // centrale
    const x0 = W + 200 + Math.random()*400;
    lifts.push({
      x: x0, y: levelY.low - lane*laneGap - 6,
      w: 86, h: 16,
      alignedLane: lane,
      active: true
    });
  }

  for (let i=0;i<5;i++) spawnObstacle();
  for (let i=0;i<2;i++) spawnLift();

  // ---------- INPUT ----------
  const keys = { left:false, right:false, up:false, down:false, space:false };

  function isSpace(ev){ return ev.code==='Space' || ev.key===' ' || ev.key==='Spacebar' || ev.key==='Space'; }
  function isKeyL(ev){ return ev.code==='KeyL' || ev.key==='l' || ev.key==='L'; }
  function isKeyP(ev){ return ev.code==='KeyP' || ev.key==='p' || ev.key==='P'; }

  window.addEventListener('keydown', e => {
    // frecce
    if (e.key==='ArrowLeft')  { keys.left = true;  e.preventDefault(); }
    if (e.key==='ArrowRight') { keys.right = true; e.preventDefault(); }
    if (e.key==='ArrowUp')    { keys.up = true;    e.preventDefault(); }
    if (e.key==='ArrowDown')  { keys.down = true;  e.preventDefault(); }

    if (isSpace(e)) { keys.space = true; e.preventDefault(); }
    if (isKeyL(e)) { tryLift(); e.preventDefault(); }
    if (isKeyP(e)) { togglePause(); e.preventDefault(); }
  }, {passive:false});

  window.addEventListener('keyup', e => {
    if (e.key==='ArrowLeft')  keys.left = false;
    if (e.key==='ArrowRight') keys.right = false;
    if (e.key==='ArrowUp')    keys.up = false;
    if (e.key==='ArrowDown')  keys.down = false;
    if (isSpace(e)) keys.space = false;
  });

  liftBtn.addEventListener('click', () => tryLift());
  pauseBtn.addEventListener('click', () => togglePause());

  // Mobile quick controls (swipe)
  let touchStart = null;
  canvas.addEventListener('touchstart', e => { touchStart = e.touches[0]; }, {passive:true});
  canvas.addEventListener('touchmove', e => {
    if (!touchStart) return;
    const dx = e.touches[0].clientX - touchStart.clientX;
    if (Math.abs(dx) > 16) { player.vx = Math.sign(dx) * 1.2; }
  }, {passive:true});
  canvas.addEventListener('touchend', () => { player.vx = 0; touchStart = null; });

  function togglePause(){
    paused = !paused;
    pauseBtn.textContent = paused ? 'Resume' : 'Pausa';
    last = performance.now();
    requestAnimationFrame(loop);
  }

  // ---------- LIFT ----------
  let liftAnim = null; // {t, fromY, toY}
  function rectOverlap(a,b){
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function canAttachLift(){
    if (player.level!=='low' || player.lifting || !player.alive) return null;
    // tolleranza laterale per facilitare l’aggancio
    const TOL = 8;
    for (const L of lifts){
      if (!L.active) continue;
      if (player.lane !== L.alignedLane) continue;
      // rettangolo “generoso”
      if (player.x + player.w > L.x - TOL && player.x < L.x + L.w + TOL &&
          player.y + player.h > L.y && player.y < L.y + L.h) {
        return L;
      }
    }
    return null;
  }

  function tryLift(){
    const hitLift = canAttachLift();
    if (!hitLift) return;
    player.lifting = true;
    liftAnim = {
      t: 0,
      fromY: player.y,
      toY: player.y - (levelY.low - levelY.high)
    };
    hitLift.active = false;
  }

  // ---------- GAME LOOP ----------
  let t0 = performance.now();
  let last = t0;
  let elapsed = 0;
  let score = 0;
  let paused = false;

  function update(dt){
    // Input orizzontale
    const baseSpeed = player.speed;
    const targetSpeed = keys.space ? player.turbo : baseSpeed;

    player.vx = (keys.right ? 1 : 0) + (keys.left ? -1 : 0);
    player.x += player.vx * 180 * dt;
    player.x = Math.max(40, Math.min(W*0.6, player.x));

    // Lane change
    if (keys.up && !player.lifting) {
      if (player.lane < lanesPerLevel-1) { player.lane++; keys.up = false; }
    }
    if (keys.down && !player.lifting) {
      if (player.lane > 0) { player.lane--; keys.down = false; }
    }

    // Allineamento Y / animazione lift
    if (!player.lifting) {
      const base = player.level==='low' ? levelY.low : levelY.high;
      const targetY = base - player.lane*laneGap - (player.h/2);
      player.y += (targetY - player.y) * Math.min(1, dt*10);
    } else {
      const duration = 0.9;
      liftAnim.t += dt/duration;
      const k = easeInOutCubic(Math.min(1, liftAnim.t));
      player.y = liftAnim.fromY + (liftAnim.toY - liftAnim.fromY)*k;
      if (liftAnim.t >= 1) {
        player.lifting = false;
        player.level = 'high';
        liftAnim = null;
      }
    }

    // Scorrimento mondo (turbo influenza di più il piano attuale)
    for (const o of obstacles) {
      const boost = (player.level===o.level ? targetSpeed*0.45 : targetSpeed*0.25);
      o.x -= (o.speed + boost);
    }
    for (const L of lifts) L.x -= (scrollSpeedBase + 1.2 + targetSpeed*0.1);

    cleanupAndSpawn();

    // Collisioni (solo stesso piano)
    for (const o of obstacles) {
      if (o.level === player.level && rectOverlap(player, o)) player.alive = false;
    }

    // HUD: mostra pronto al lift
    const eligible = !!canAttachLift();
    liftBtn.textContent = eligible ? 'LIFT ✓' : 'LIFT';

    // Score/time
    elapsed += dt;
    score += Math.floor(10*dt + (keys.space? 3:0)); // piccolo bonus col turbo
    timeEl.textContent = elapsed.toFixed(1);
    scoreEl.textContent = score;
  }

  function cleanupAndSpawn(){
    for (let i=obstacles.length-1;i>=0;i--) if (obstacles[i].x + obstacles[i].w < -40) obstacles.splice(i,1);
    for (let i=lifts.length-1;i>=0;i--) if (lifts[i].x + lifts[i].w < -40) lifts.splice(i,1);

    if (obstacles.length < 6) spawnObstacle();
    if (Math.random() < 0.010 && lifts.length < 2 && player.level==='low') spawnLift();
  }

  function draw(){
    ctx.clearRect(0,0,W,H);
    drawStars();
    drawRoad(levelY.high);
    drawRoad(levelY.low);

    // lifts
    for (const L of lifts) {
      ctx.fillStyle = L.active ? '#2dd36f' : '#2a7a54';
      ctx.fillRect(L.x, L.y, L.w, L.h);
      ctx.fillStyle = '#1b254d';
      ctx.fillRect(L.x+6, levelY.low-4, 8, -(levelY.low - (L.y+L.h)));
      ctx.fillRect(L.x+L.w-14, levelY.low-4, 8, -(levelY.low - (L.y+L.h)));
    }

    // obstacles
    for (const o of obstacles) {
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = '#ffd4d4';
      ctx.fillRect(o.x+4, o.y+4, o.w-8, 6);
    }

    drawCar(player);
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
      ctx.fillText('Premi R per ricominciare', W/2, H/2 + 22);
      const once = (e) => {
        if (e.key.toLowerCase() !== 'r') { window.addEventListener('keydown', once, {once:true}); return; }
        resetGame();
      };
      window.addEventListener('keydown', once, {once:true});
      return;
    }
    requestAnimationFrame(loop);
  }

  function resetGame(){
    obstacles.length = 0; lifts.length = 0;
    for (let i=0;i<5;i++) spawnObstacle();
    for (let i=0;i<2;i++) spawnLift();
    player.x = 120; player.level='low'; player.lane=1; player.alive=true; player.lifting=false;
    elapsed = 0; score = 0; last = performance.now();
    requestAnimationFrame(loop);
  }

  // start
  requestAnimationFrame(ts => { last = ts; loop(ts); });
})();
