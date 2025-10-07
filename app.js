// Lift Runner — v1.9 (autostart ovunque + auto-lift + iPhone-friendly)
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  // iPhone: niente zoom/gesture
  canvas.style.touchAction = 'none';

  // HUD DOM (presenti nel tuo HTML)
  const timeEl  = document.getElementById('time');
  const scoreEl = document.getElementById('score');
  const liftBtn = document.getElementById('liftBtn');
  const pauseBtn= document.getElementById('pauseBtn');

  // Focus tastiera (desktop)
  canvas.tabIndex = 0; const focusCanvas=()=>{ try{ canvas.focus(); }catch{} };
  window.addEventListener('load', focusCanvas); canvas.addEventListener('pointerdown', focusCanvas);

  // ----- Mondo -----
  const lanesPerLevel = 3;
  const levelY = { low: H - 120, high: H - 320 };
  const laneGap = 32;
  const roadHeight = 12;
  const BASE_SCROLL = 3.0;

  const player = {
    x: 120, y: levelY.low - 2*laneGap,
    w: 50, h: 24,
    vx: 0,
    speed: 3.6, turbo: 6.2,
    level: 'low', lane: 1,
    alive: true, lifting: false
  };

  const obstacles = [];
  const lifts = []; // {x,y,w,h,dir:'up',active}

  function spawnObstacle() {
    const level = Math.random() < 0.5 ? 'low' : 'high';
    const lane = Math.floor(Math.random()*lanesPerLevel);
    const lastX = obstacles.length ? obstacles[obstacles.length-1].x : W;
    const minGapX = 140 + Math.random()*80; // passaggi più larghi
    obstacles.push({
      x: Math.max(W + 40, lastX + minGapX),
      y: (level==='low'? levelY.low : levelY.high) - lane*laneGap - 6,
      w: 40, h: 20, level, lane, speed: BASE_SCROLL + Math.random()*1.2
    });
  }
  function spawnLiftUp() {
    const lane = 1, yBase = levelY.low;
    const lastLiftX = lifts.length ? lifts[lifts.length-1].x : W;
    const gap = 260 + Math.random()*140;
    lifts.push({ x: Math.max(W+160, lastLiftX+gap), y: yBase - lane*laneGap - 6, w: 140, h: 16, dir:'up', active:true });
  }

  // Precarico (mostra qualcosa anche prima dello start)
  for (let i=0;i<3;i++) spawnObstacle();
  for (let i=0;i<2;i++) spawnLiftUp();

  // ----- Stato -----
  let running = false;   // parte con schermata START
  let paused = false;
  let last = performance.now();
  let elapsed = 0, score = 0;

  // ----- Autostart OVUNQUE -----
  function startGame(){
    running = true; paused = false; last = performance.now();
    obstacles.length=0; lifts.length=0;
    for (let i=0;i<3;i++) spawnObstacle();
    for (let i=0;i<2;i++) spawnLiftUp();
    Object.assign(player,{ x:120, level:'low', lane:1, alive:true, lifting:false });
    elapsed=0; score=0;
  }
  function maybeStart(){ if (!running) startGame(); }
  // qualsiasi input fa partire
  ['pointerdown','touchstart','keydown','click'].forEach(t => {
    window.addEventListener(t, maybeStart, {passive:true});
  });

  function softReset(){ running=false; } // torna allo stato START
  function togglePause(){ if (!running) return; paused=!paused; if (!paused){ last=performance.now(); } }

  // ----- Tastiera -----
  const keys = Object.create(null);
  const handled = new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS','Space','KeyL','KeyP','KeyR']);
  function onKeyDown(e){
    const code = e.code || e.key; keys[code] = true;
    if (handled.has(code)) e.preventDefault();
    if (code==='KeyP') togglePause();
    if (code==='KeyL') manualLift();
    if (code==='KeyR' && !player.alive) softReset();
  }
  function onKeyUp(e){ const code = e.code || e.key; keys[code] = false; if (handled.has(code)) e.preventDefault(); }
  window.addEventListener('keydown', onKeyDown, {passive:false});
  window.addEventListener('keyup',   onKeyUp,   {passive:false});
  if (liftBtn) liftBtn.addEventListener('click', ()=>{ manualLift(); maybeStart(); });
  if (pauseBtn) pauseBtn.addEventListener('click', ()=>togglePause());

  // ----- Touch zone (iPhone) -----
  let holdLeft=false, holdRight=false;
  canvas.addEventListener('pointerdown', ev=>{
    ev.preventDefault();
    maybeStart();
    const pt = getPoint(ev);
    if (hit(pt, BTN.lift)) { BTN.lift.flash = performance.now()+140; manualLift(); return; }
    if (pt.x < W*0.35) { holdLeft=true; return; }
    if (pt.x > W*0.65) { (pt.y < H*0.55) ? laneUp() : laneDown(); return; }
  }, {passive:false});
  ['pointerup','pointerleave','pointercancel'].forEach(t=>{
    canvas.addEventListener(t, e=>{ e.preventDefault(); holdLeft=false; holdRight=false; }, {passive:false});
  });
  canvas.addEventListener('pointermove', ev=>{
    if (!running) return;
    if (!(ev.buttons&1)) return;
    const pt = getPoint(ev);
    holdLeft = (pt.x < W*0.35);
    holdRight= (pt.x > W*0.65);
  });
  function getPoint(ev){ const r=canvas.getBoundingClientRect(); const sx=canvas.width/r.width, sy=canvas.height/r.height;
    return { x:(ev.clientX-r.left)*sx, y:(ev.clientY-r.top)*sy }; }

  // ----- Lift (solo UP in questo step) -----
  let liftAnim=null;                // {t,fromY,toY}
  let eligibleSince=0;              // ms
  const AUTO_LIFT_DELAY=150;        // ms

  function currentEligibleLift(){
    if (!player.alive || player.lifting || player.level!=='low') return null;
    const TOL=18;
    for (const L of lifts){
      if (!L.active || L.dir!=='up') continue;
      if (player.lane!==1) continue; // corsia centrale
      if (player.x + player.w > L.x - TOL && player.x < L.x + L.w + TOL &&
          player.y + player.h > L.y && player.y < L.y + L.h) return L;
    }
    return null;
  }
  function manualLift(){ const L=currentEligibleLift(); if (L) startLift(L); }
  function startLift(L){
    player.lifting = true;
    liftAnim = { t:0, fromY: player.y, toY: player.y - (levelY.low - levelY.high) };
    L.active = false;
  }

  // ----- Update/Draw -----
  function update(dt){
    const turboOn = !!keys['Space'];
    const targetSpeed = turboOn ? player.turbo : player.speed;

    // X: tastiera o touch-hold
    const right = keys['ArrowRight'] || keys['KeyD'] || holdRight;
    const left  = keys['ArrowLeft']  || keys['KeyA'] || holdLeft;
    player.vx = right ? 1 : left ? -1 : 0;
    player.x += player.vx * 180 * dt;
    player.x = Math.max(40, Math.min(W*0.6, player.x));

    // Cambio corsia edge
    if ((keys['ArrowUp']||keys['KeyW']) && !player.lifting){ laneUp(); keys['ArrowUp']=keys['KeyW']=false; }
    if ((keys['ArrowDown']||keys['KeyS']) && !player.lifting){ laneDown(); keys['ArrowDown']=keys['KeyS']=false; }

    // Y / anim lift
    if (!player.lifting){
      const base = (player.level==='low') ? levelY.low : levelY.high;
      const targetY = base - player.lane*laneGap - (player.h/2);
      player.y += (targetY - player.y) * Math.min(1, dt*10);
    } else {
      const dur=0.8; liftAnim.t += dt/dur;
      const k = easeInOutCubic(Math.min(1, liftAnim.t));
      player.y = liftAnim.fromY + (liftAnim.toY - liftAnim.fromY)*k;
      if (liftAnim.t>=1){ player.lifting=false; player.level='high'; liftAnim=null; }
    }

    // Auto-lift
    const el = currentEligibleLift();
    if (el){
      if (!eligibleSince) eligibleSince = performance.now();
      else if (performance.now()-eligibleSince >= AUTO_LIFT_DELAY) startLift(el);
    } else { eligibleSince = 0; }

    // Scorrimento
    for (const o of obstacles){
      const boost = (player.level===o.level? targetSpeed*0.45 : targetSpeed*0.25);
      o.x -= (o.speed + boost) * dt * 60;
    }
    for (const L of lifts){ L.x -= (BASE_SCROLL + 1.1) * dt * 60; }

    // Cleanup & respawn
    for (let i=obstacles.length-1;i>=0;i--) if (obstacles[i].x + obstacles[i].w < -50) obstacles.splice(i,1);
    for (let i=lifts.length-1;i>=0;i--)     if (lifts[i].x + lifts[i].w < -60) lifts.splice(i,1);
    if (obstacles.length < 5 && Math.random()<0.06) spawnObstacle();
    if (lifts.length < 2 && Math.random()<0.10) spawnLiftUp();

    // Collisioni (tolleranti: pad=-3)
    for (const o of obstacles){
      if (o.level!==player.level) continue;
      if (overlapRelaxed(player,o,-3)){ player.alive=false; running=false; break; }
    }

    // HUD
    elapsed += dt; score += Math.floor((turboOn ? 14 : 10) * dt);
    if (timeEl)  timeEl.textContent  = elapsed.toFixed(1);
    if (scoreEl) scoreEl.textContent = score;
  }

  function overlapRelaxed(a,b,pad){
    return a.x - pad < b.x + b.w + pad &&
           a.x + a.w + pad > b.x - pad &&
           a.y - pad < b.y + b.h + pad &&
           a.y + a.h + pad > b.y - pad;
  }
  function laneUp(){ if (!player.lifting && player.lane < lanesPerLevel-1) player.lane++; }
  function laneDown(){ if (!player.lifting && player.lane > 0) player.lane--; }

  // UI in-canvas: solo bottone LIFT (facoltativo)
  const BTN = { lift: { x:(W/2)-48, y:H-84, w:96, h:56, flash:0 } };

  function draw(){
    ctx.clearRect(0,0,W,H);
    drawStars(); drawRoad(levelY.high); drawRoad(levelY.low);

    for (const L of lifts) drawLift(L);
    for (const o of obstacles) drawObstacle(o);
    drawCar(player);

    // Hint READY
    if (currentEligibleLift() && player.alive && !player.lifting){
      ctx.save(); ctx.font='bold 16px system-ui,Segoe UI,Arial'; ctx.fillStyle='#eaffef'; ctx.textAlign='center';
      ctx.fillText('LIFT READY', player.x + player.w/2, player.y - 14); ctx.restore();
    }

    // Bottone LIFT
    drawLiftButton();

    // Overlay testi
    if (!running || !player.alive || paused){
      ctx.fillStyle = 'rgba(8,12,28,0.72)'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle = '#ecf2ff'; ctx.textAlign='center';
      if (!running){
        ctx.font='bold 34px system-ui,Segoe UI,Arial'; ctx.fillText('TAP ANYWHERE TO START', W/2, H/2);
        ctx.font='15px system-ui,Segoe UI,Arial'; ctx.fillText('Muovi tenendo premuto la metà sinistra/destra — LIFT automatico', W/2, H/2+28);
      } else if (!player.alive){
        ctx.font='bold 34px system-ui,Segoe UI,Arial'; ctx.fillText('GAME OVER', W/2, H/2);
        ctx.font='15px system-ui,Segoe UI,Arial'; ctx.fillText('Tocca per ripartire', W/2, H/2+28);
      } else if (paused){
        ctx.font='bold 34px system-ui,Segoe UI,Arial'; ctx.fillText('PAUSA', W/2, H/2);
      }
    }
  }

  function drawRoad(yBase){
    ctx.fillStyle='#0f1834'; ctx.fillRect(0,yBase,W,roadHeight);
    ctx.strokeStyle='#223069'; ctx.lineWidth=2;
    for (let i=0;i<lanesPerLevel;i++){
      const y=yBase - i*laneGap - laneGap/2;
      ctx.setLineDash([12,10]); ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  function drawLift(L){
    ctx.fillStyle = L.active ? '#2dd36f' : '#2a7a54';
    ctx.fillRect(L.x,L.y,L.w,L.h);
    ctx.fillStyle = '#1b254d';
    ctx.fillRect(L.x+6, levelY.low-4, 8, -(levelY.low - (L.y+L.h)));
    ctx.fillRect(L.x+L.w-14, levelY.low-4, 8, -(levelY.low - (L.y+L.h)));
    ctx.fillStyle = '#eaffef';
    const cx=L.x+L.w/2, cy=L.y+L.h/2;
    ctx.beginPath(); ctx.moveTo(cx,cy-6); ctx.lineTo(cx-6,cy+4); ctx.lineTo(cx+6,cy+4); ctx.closePath(); ctx.fill();
  }
  function drawObstacle(o){
    ctx.fillStyle='#ef4444'; ctx.fillRect(o.x,o.y,o.w,o.h);
    ctx.fillStyle='#ffd4d4'; ctx.fillRect(o.x+4,o.y+4,o.w-8,6);
  }
  function drawCar(p){
    ctx.fillStyle = p.alive ? '#22c55e' : '#7a2b2b';
    ctx.fillRect(p.x,p.y,p.w,p.h);
    ctx.fillStyle='#cfeee0'; ctx.fillRect(p.x+10,p.y+4,p.w-20,p.h-10);
    ctx.fillStyle='#ffe066'; ctx.fillRect(p.x+p.w-6,p.y+6,4,6);
  }
  function drawLiftButton(){
    const b=BTN.lift, r=12, ready=!!currentEligibleLift(), pressed=performance.now()<b.flash;
    ctx.fillStyle='rgba(0,0,0,0.35)'; roundRect(b.x+2,b.y+4,b.w,b.h,r); ctx.fill();
    ctx.fillStyle= pressed ? '#1c8c7a' : '#1a2755';
    ctx.strokeStyle=pressed ? '#54e0c2' : '#2dd4bf'; ctx.lineWidth=2;
    roundRect(b.x,b.y,b.w,b.h,r); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#e6f7ff'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.font='bold 18px system-ui,Segoe UI,Arial';
    ctx.fillText(ready ? 'LIFT ✓' : 'LIFT', b.x+b.w/2, b.y+b.h/2);
  }
  function roundRect(x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
    ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
  }
  function easeInOutCubic(t){ return t<0.5? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; }

  // Loop
  function loop(now){
    const dt = Math.min(0.033, (now - last)/1000); last = now;
    if (running && !paused && player.alive) update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(ts=>{ last=ts; draw(); requestAnimationFrame(loop); });
})();
