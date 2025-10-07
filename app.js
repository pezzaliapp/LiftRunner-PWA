/* Lift Runner — canvas prototype (v1)
 * - Mondo side-scroll
 * - Due piani (inferiore/superiore), 3 corsie per piano
 * - Lifts: se l'auto è allineata e premi "L", si anima la salita e l’auto viene rilasciata sul piano alto
 * - PWA friendly, nessun asset esterno
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
  const levelY = { low: H - 120, high: H - 320 }; // baseline di ciascun piano
  const laneGap = 28; // distanza verticale fra corsie sullo stesso piano
  const roadHeight = 12;
  const scrollSpeedBase = 3.2;

  const player = {
    x: 120, y: levelY.low - 2*laneGap,
    w: 54, h: 28,
    vx: 0, speed: 3.6, turbo: 6.2,
    level: 'low', lane: 1, // 0..2
    alive: true, lifting: false
  };

  // Obstacles + lifts (scorrono da destra a sinistra)
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
    // un lift prende 3 segmenti: rampa-in, piattaforma, rampa-out (semplificato: blocco unico “safe zone”)
    const lane = 1; // centrale (facile da centrare)
    const x0 = W + 200 + Math.random()*400;
    lifts.push({
      x: x0, y: levelY.low - lane*laneGap - 6,
      w: 80, h: 16,
      alignedLane: lane, // corsia necessaria per agganciare
      active: true
    });
  }

  // Precarico: mettiamo qualcosa in scena
  for (let i=0;i<5;i++) spawnObstacle();
  for (let i=0;i<2;i++) spawnLift();

  // Input
  const keys = {};
  window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (e.key === 'p' || e.key === 'P') togglePause();
    if (e.key === 'l' || e.key === 'L') tryLift();
  });
  window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
  liftBtn.addEventListener('click', () => tryLift());
  pauseBtn.addEventListener('click', () => togglePause());

  // Mobile quick controls (swipe horiz to move, tap HUD LIFT to lift)
  let touchStart = null;
  canvas.addEventListener('touchstart', e => {
    touchStart = e.touches[0];
  }, {passive:true});
  canvas.addEventListener('touchmove', e => {
    if (!touchStart) return;
    const dx = e.touches[0].clientX - touchStart.clientX;
    if (Math.abs(dx) > 16) {
      player.vx = Math.sign(dx) * 1.2;
    }
  }, {passive:true});
  canvas.addEventListener('touchend', () => {
    player.vx = 0; touchStart = null;
  });

  function togglePause(){
    paused = !paused;
    pauseBtn.textContent = paused ? 'Resume' : 'Pausa';
    last = performance.now();
    requestAnimationFrame(loop);
  }

  // Lift mechanics
  let liftAnim = null; // {t:0..1, fromY, toY}
  function tryLift(){
    if (!player.alive || player.lifting || player.level==='high') return;
    // Deve essere sopra un lift attivo e nella corsia giusta
    const hitLift = lifts.find(L => L.active && rectOverlap(player, L) && player.lane===L.alignedLane);
    if (hitLift) {
      player.lifting = true;
      liftAnim = {
        t: 0,
        fromY: player.y,
        toY: player.y - (levelY.low - levelY.high) // delta verso l'alto
      };
      // disattiva la piattaforma finché non esce dallo schermo
      hitLift.active = false;
    }
  }

  function rectOverlap(a,b){
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // Game state
  let t0 = performance.now();
  let last = t0;
  let elapsed = 0;
  let score = 0;
  let paused = false;

  function update(dt){
    // Player input (orizzontale)
    const targetSpeed = keys[' '] ? player.turbo : player.speed;
    player.vx = (keys['arrowright']||keys['d']) ? 1 : (keys['arrowleft']||keys['a']) ? -1 : 0;
    player.x += player.vx * 180 * dt; // pixel/sec scaled
    player.x = Math.max(40, Math.min(W*0.6, player.x)); // limiti visivi

    // Lane change on same level
    if ((keys['arrowup']||keys['w']) && !player.lifting) {
      if (player.lane < lanesPerLevel-1) { player.lane++; keys['arrowup']=keys['w']=false; }
    }
    if ((keys['arrowdown']||keys['s']) && !player.lifting) {
      if (player.lane > 0) { player.lane--; keys['arrowdown']=keys['s']=false; }
    }

    // Allinea y in base a level+lane (se non in animazione lift)
    if (!player.lifting) {
      const base = player.level==='low' ? levelY.low : levelY.high;
      const targetY = base - player.lane*laneGap - (player.h/2);
      // easing leggero
      player.y += (targetY - player.y) * Math.min(1, dt*10);
    } else {
      // animazione lift
      const duration = 0.9; // s
      liftAnim.t += dt/duration;
      const k = easeInOutCubic(Math.min(1, liftAnim.t));
      const y = liftAnim.fromY + (liftAnim.toY - liftAnim.fromY)*k;
      player.y = y;
      if (liftAnim.t >= 1) {
        player.lifting = false;
        player.level = 'high';
        liftAnim = null;
      }
    }

    // Scorrimento mondo
    const worldSpeed = scrollSpeedBase + (targetSpeed - player.speed)*0.6;
    for (const o of obstacles) o.x -= (o.speed + (player.level===o.level? targetSpeed*0.4 : targetSpeed*0.2));
    for (const L of lifts) L.x -= (scrollSpeedBase + 1.2);

    // Respawn / cleanup
    cleanupAndSpawn();

    // Collisioni solo con ostacoli sullo stesso piano
    for (const o of obstacles) {
      if (o.level === player.level && rectOverlap(player, o)) {
        player.alive = false;
      }
    }

    // Scoring semplice: sopravvivenza + sorpassi
    elapsed += dt;
    score += Math.floor(10*dt);
    timeEl.textContent = elapsed.toFixed(1);
    scoreEl.textContent = score;
  }

  function cleanupAndSpawn(){
    // rimuovi fuori schermo
    for (let i=obstacles.length-1;i>=0;i--) if (obstacles[i].x + obstacles[i].w < -40) obstacles.splice(i,1);
    for (let i=lifts.length-1;i>=0;i--) if (lifts[i].x + lifts[i].w < -40) lifts.splice(i,1);

    // mantieni densità
    if (obstacles.length < 6) spawnObstacle();
    if (Math.random() < 0.008 && lifts.length < 2 && player.level==='low') spawnLift();
  }

  function draw(){
    // sfondo a bande orizzontali per i due piani
    ctx.clearRect(0,0,W,H);
    // stars
    drawStars();

    // strade (linee base dei piani)
    drawRoad(levelY.high);
    drawRoad(levelY.low);

    // lifts
    for (const L of lifts) {
      ctx.fillStyle = L.active ? '#2dd36f' : '#2a7a54';
      ctx.fillRect(L.x, L.y, L.w, L.h);
      // piloni
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

    // player car
    drawCar(player);
  }

  function drawRoad(yBase){
    ctx.fillStyle = '#0f1834';
    ctx.fillRect(0, yBase, W, roadHeight);
    // corsie tratteggiate
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
    // corpo
    ctx.fillStyle = p.alive ? '#22c55e' : '#7a2b2b';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    // tetto
    ctx.fillStyle = '#cfeee0';
    ctx.fillRect(p.x+10, p.y+4, p.w-20, p.h-10);
    // luci
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

    // Game over overlay
    if (!player.alive){
      ctx.fillStyle = 'rgba(8,12,28,0.6)';
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle = '#ecf2ff';
      ctx.font = 'bold 32px system-ui,Segoe UI,Arial';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', W/2, H/2 - 10);
      ctx.font = '16px system-ui,Segoe UI,Arial';
      ctx.fillText('Premi R per ricominciare', W/2, H/2 + 22);
      window.addEventListener('keydown', resetOnce, {once:true});
      return;
    }
    requestAnimationFrame(loop);
  }

  function resetOnce(e){
    if (e.key.toLowerCase() !== 'r') { window.addEventListener('keydown', resetOnce, {once:true}); return; }
    // reset
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
