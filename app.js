/* Lift Runner — v4.0 Full Edition
 * LIFT corretto + JUMP verso l’alto + pneumatici cadenti e rotolanti
 * Tutto funzionante per tastiera e mobile.
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

  const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
  canvas.style.touchAction = 'none';
  const focusCanvas = ()=>{ try{ canvas.focus(); }catch{} };
  window.addEventListener('load', focusCanvas);
  canvas.addEventListener('pointerdown', focusCanvas);

  // ===== World =====
  const LANES = 3, laneGap = 32;
  const levelY = { low: H - 120, high: H - 320 };
  const BASE_SCROLL = 3.0;

  const player = {
    x:120, y:levelY.low - laneGap*2,
    w:50, h:24, vx:0, speed:3.6, turbo:6.4,
    level:'low', lane:1, alive:true, lifting:false,
    turboOn:false, shieldTime:0, _turboWasOn:false
  };

  // Jump fisica
  const JUMP = { active:false, vy:0, gravity:900, impulse:-260 };
  let jumpHintT = 0;

  // ===== Arrays entità =====
  const obstacles=[], lifts=[], bonuses=[], shields=[], ufos=[], floats=[], particles=[];

  // ===== Audio helpers =====
  let actx=null, muted=false;
  const ensureAudio=()=>{ if(!actx){ try{ actx=new (window.AudioContext||window.webkitAudioContext)(); }catch{} } };
  const blip=(f=660,d=0.07,g=0.1,type='square')=>{
    if(muted||!actx)return;const t=actx.currentTime;
    const o=actx.createOscillator(),v=actx.createGain();
    o.type=type;o.frequency.setValueAtTime(f,t);
    v.gain.setValueAtTime(g,t);v.gain.linearRampToValueAtTime(0.0001,t+d);
    o.connect(v).connect(actx.destination);o.start(t);o.stop(t+d);
  };
  const sweep=(f0=420,f1=920,d=0.22,g=0.08)=>{
    if(muted||!actx)return;const t=actx.currentTime;
    const o=actx.createOscillator(),v=actx.createGain();
    o.type='sawtooth';o.frequency.setValueAtTime(f0,t);
    o.frequency.exponentialRampToValueAtTime(f1,t+d);
    v.gain.value=g;v.gain.exponentialRampToValueAtTime(0.0001,t+d);
    o.connect(v).connect(actx.destination);o.start(t);o.stop(t+d);
  };
  const crash=()=>{
    if(muted||!actx)return;const t=actx.currentTime;
    const b=actx.createBuffer(1,actx.sampleRate*0.25,actx.sampleRate);
    const d=b.getChannelData(0);
    for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,2);
    const s=actx.createBufferSource(),v=actx.createGain();
    v.gain.value=0.20;v.gain.exponentialRampToValueAtTime(0.0001,t+0.25);
    s.buffer=b;s.connect(v).connect(actx.destination);s.start(t);
  };
  const bonusChime=(pts)=>{ if(muted||!actx)return;
    if(pts>=1000)sweep(520,1400,0.25,0.08);
    else if(pts>=500){blip(900,0.05,0.08);setTimeout(()=>blip(680,0.06,0.08),60);}
    else blip(780,0.06,0.07);
  };
  const shieldPickupSound=()=>blip(980,0.08,0.09,'triangle');
  const shieldBreakSound=()=>blip(240,0.08,0.12,'square');

  // ===== Livelli =====
  const STAGES={
    1:{sky:'#0b1022',road:'#0f1834',dash:'#223069',name:'NOTTE'},
    2:{sky:'#1b1230',road:'#2a1a3f',dash:'#ca6bee',name:'ALBA'},
    3:{sky:'#231a10',road:'#3b2a14',dash:'#d1a15a',name:'DESERTO'}
  };
  let stage=1;

  // ===== Input =====
  const keys=Object.create(null);
  window.addEventListener('keydown',e=>{
    keys[e.code]=true;
    if(e.code==='KeyL') manualLift();      // lift fisso
    if(e.code==='KeyX'||e.code==='KeyA') attemptLiftOrJump();
    if(e.code==='Space') player.turboOn=true;
  });
  window.addEventListener('keyup',e=>{
    keys[e.code]=false;
    if(e.code==='Space') player.turboOn=false;
  });

  // Pulsante HUD
  liftBtn.onclick=()=>attemptLiftOrJump();
  pauseBtn.onclick=()=>paused=!paused;

  // ===== D-pad mobile =====
  const isTouch=/iPhone|iPad|Android/i.test(navigator.userAgent);
  let holdLeft=false,holdRight=false,holdTurbo=false;
  if(isTouch) createPad();
  function createPad(){
    const bar=document.createElement('div');
    bar.id='padBar';
    bar.innerHTML=`<style>
      #padBar{display:flex;justify-content:space-between;gap:10px;padding:6px;background:#0d1330}
      .padBtn{width:54px;height:54px;border-radius:10px;background:#1a2755;color:#fff;border:1px solid #2dd4bf;
        font:bold 20px system-ui;margin:3px;}
      .padBtn:active{background:#2dd4bf;color:#000}
    </style>
    <div>
      <button id="pl" class="padBtn">←</button>
      <button id="pr" class="padBtn">→</button>
    </div>
    <div>
      <button id="pa" class="padBtn">A</button>
      <button id="pb" class="padBtn">B</button>
    </div>`;
    wrap.appendChild(bar);
    const pl=bar.querySelector('#pl'),pr=bar.querySelector('#pr'),
          pa=bar.querySelector('#pa'),pb=bar.querySelector('#pb');
    pl.onpointerdown=()=>holdLeft=true; pr.onpointerdown=()=>holdRight=true;
    pl.onpointerup=pr.onpointerup=()=>{holdLeft=holdRight=false;};
    pa.onclick=()=>attemptLiftOrJump();
    pb.onpointerdown=()=>holdTurbo=true; pb.onpointerup=()=>holdTurbo=false;
  }

  // ===== Helpers =====
  function rectOverlap(a,b,p=0){
    return a.x-p<b.x+b.w+p&&a.x+a.w+p>b.x-p&&a.y-p<b.y+b.h+p&&a.y+a.h+p>b.y-p;
  }

  function laneUp(){ if(player.lane<LANES-1) player.lane++; }
  function laneDown(){ if(player.lane>0) player.lane--; }

  // ===== Spawn =====
  function spawnObstacle(){
    const lvl=Math.random()<0.5?'low':'high';
    const lane=Math.floor(Math.random()*LANES);
    const type=Math.random()<0.3?'tire':(Math.random()<0.5?'bush':'block');
    obstacles.push({
      type,level:lvl,lane,
      x:W+100,y:(lvl==='low'?levelY.low:levelY.high)-lane*laneGap-10,
      w:(type==='block'?40:28),h:(type==='block'?20:28),
      speed:BASE_SCROLL+Math.random()*1.2,theta:0,vy:0,falling:false
    });
  }
  function spawnLift(dir=Math.random()<0.5?'up':'down'){
    lifts.push({x:W+200,y:(dir==='up'?levelY.low:levelY.high)-laneGap,h:16,w:140,dir,active:true});
  }
  function dropTire(L){
    obstacles.push({
      type:'tire',level:'high',lane:1,
      x:L.x+L.w/2,y:levelY.high-80,w:28,h:28,
      vy:0,falling:true,speed:BASE_SCROLL+0.6,theta:0
    });
  }
    // ===== Lift & Jump =====
  let liftAnim=null;
  function eligibleLift(){
    if(!player.alive||player.lifting) return null;
    const need = (player.level==='low') ? 'up':'down';
    for(const L of lifts){
      if(!L.active||L.dir!==need) continue;
      if(player.x+player.w>L.x-20 && player.x<L.x+L.w+20) return L;
    }
    return null;
  }

  function manualLift(){
    const L=eligibleLift();
    if(L) startLift(L);
  }

  function attemptLiftOrJump(){
    const L=eligibleLift();
    if(L) startLift(L);
    else doJump();
  }

  function doJump(){
    if(player.lifting||JUMP.active) return;
    JUMP.active=true; JUMP.vy=JUMP.impulse;
    jumpHintT=0.4; blip(700,0.05,0.08,'triangle');
  }

  function startLift(L){
    player.lifting=true; L.active=false;
    const delta=(levelY.low-levelY.high)*(L.dir==='up'?1:-1);
    liftAnim={t:0,fromY:player.y,toY:player.y-delta};
    sweep(420,900,0.25,0.08);
    score+=50;
    if(Math.random()<0.3&&L.dir==='down') dropTire(L);
  }

  // ===== Stato generale =====
  let running=false,paused=false,last=performance.now(),elapsed=0,score=0,best=+localStorage.getItem('liftBest')||0;
  let turboEnergy=100;

  function startGame(){
    running=true;paused=false;elapsed=0;score=0;
    obstacles.length=lifts.length=bonuses.length=shields.length=ufos.length=particles.length=floats.length=0;
    for(let i=0;i<3;i++) spawnObstacle(); spawnLift('up'); spawnLift('down');
    Object.assign(player,{x:120,level:'low',lane:1,alive:true,lifting:false,turboOn:false,shieldTime:0});
    blip(520,0.08,0.08); blip(780,0.08,0.07);
  }

  // ===== Update =====
  function update(dt){
    if(liftBtn) liftBtn.textContent = eligibleLift() ? 'LIFT ✓' : 'JUMP';
    const wantTurbo = player.turboOn || holdTurbo || keys['Space'];
    turboEnergy += (wantTurbo ? -25*dt : 15*dt);
    turboEnergy=Math.max(0,Math.min(100,turboEnergy));
    const turboActive = wantTurbo && turboEnergy>1;

    // movimento orizzontale
    const right=keys['ArrowRight']||holdRight,left=keys['ArrowLeft']||holdLeft;
    player.vx = right?1:left?-1:0;
    player.x += player.vx * (turboActive?240:160)*dt;
    player.x = Math.max(40,Math.min(W*0.62,player.x));

    // cambio corsia
    if(keys['ArrowUp']){ laneUp(); keys['ArrowUp']=false; blip(760,0.05,0.06); }
    if(keys['ArrowDown']){ laneDown(); keys['ArrowDown']=false; blip(540,0.05,0.06); }

    // jump / lift animazione
    if(!player.lifting){
      if(JUMP.active){
        JUMP.vy += JUMP.gravity*dt;
        player.y += JUMP.vy*dt;
      }
      const base=(player.level==='low'?levelY.low:levelY.high);
      const ground=base-player.lane*laneGap-player.h/2;
      if(!JUMP.active||player.y>=ground){ player.y=ground; JUMP.active=false; }
    }else{
      liftAnim.t+=dt/0.8;
      const t=Math.min(1,liftAnim.t);
      player.y=liftAnim.fromY+(liftAnim.toY-liftAnim.fromY)*t;
      if(t>=1){ player.lifting=false; player.level=(player.level==='low'?'high':'low'); liftAnim=null; }
    }

    // spawna nuovi elementi
    if(obstacles.length<6&&Math.random()<0.05) spawnObstacle();
    if(lifts.length<3&&Math.random()<0.05) spawnLift();

    // aggiorna ostacoli
    for(const o of obstacles){
      o.x -= (BASE_SCROLL+(turboActive?1:0))*dt*60;
      if(o.type==='tire'){
        o.theta+=dt*6;
        if(o.falling){
          o.vy+=1100*dt; o.y+=o.vy*dt;
          const g=levelY.low-o.h;
          if(o.y>=g){ o.y=g;o.falling=false;o.level='low';o.vy=0; }
        }
      }
    }

    // collisioni
    if(player.alive){
      for(const o of obstacles){
        if(o.level!==player.level) continue;
        const hit = rectOverlap(player,o,-3);
        if(hit){
          if(player.shieldTime>0){ player.shieldTime=0; shieldBreakSound(); o.x=-9999; }
          else{ player.alive=false; running=false; crash(); }
          break;
        }
      }
    }

    // score + tempo
    elapsed+=dt; score+=Math.floor(dt*2);
    if(timeEl) timeEl.textContent=elapsed.toFixed(1);
    if(scoreEl) scoreEl.textContent=score;
    if(score>best){best=score;localStorage.setItem('liftBest',best);}
  }
    // ===== Disegno =====
  function draw(){
    // Palette stage con fallback se STAGES/stage non sono definiti nel Blocco 1
    const PALETTE = (typeof STAGES !== 'undefined' && STAGES[stage]) ? STAGES[stage] : {
      sky:'#0b1022', star:'#1d2a55', road:'#0f1834', dash:'#223069'
    };

    // sfondo
    ctx.fillStyle = PALETTE.sky; ctx.fillRect(0,0,W,H);
    drawStars(PALETTE.star);
    drawRoad(levelY.high, PALETTE.road, PALETTE.dash);
    drawRoad(levelY.low,  PALETTE.road, PALETTE.dash);

    // mondo
    for(const L of lifts)     drawLift(L);
    for(const o of obstacles) drawObstacle(o);
    for(const b of bonuses)   drawBonus(b);
    for(const s of shields)   drawShieldPickup(s);
    for(const u of ufos)      drawUFO(u);
    for(const p of particles) drawParticle(p);
    for(const f of floats)    drawFloat(f);

    // player
    drawCar(player);

    // HUD compatto in-canvas
    drawHudCompact();

    // Overlay (start/pausa/game over)
    if(!running || paused || !player.alive){
      const tipMobile  = 'D-pad • A=LIFT/JUMP • B=TURBO';
      const tipDesktop = '← → • ↑/↓ corsia • L=Lift • X=Lift/Jump • Spazio=Turbo';
      const tip = (typeof isMobile!=='undefined' && isMobile) ? tipMobile : tipDesktop;

      ctx.fillStyle='rgba(8,12,28,0.72)'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#ecf2ff'; ctx.textAlign='center';
      if(!running){
        ctx.font='bold 34px system-ui,Segoe UI,Arial'; ctx.fillText('TAP ANYWHERE TO START', W/2, H/2);
        ctx.font='15px system-ui,Segoe UI,Arial'; ctx.fillText(tip, W/2, H/2+28);
        ctx.fillText(`Best: ${best||0}`, W/2, H/2+48);
      } else if(paused){
        ctx.font='bold 34px system-ui,Segoe UI,Arial'; ctx.fillText('PAUSA', W/2, H/2);
      } else if(!player.alive){
        ctx.font='bold 34px system-ui,Segoe UI,Arial'; ctx.fillText('GAME OVER', W/2, H/2);
        ctx.font='15px system-ui,Segoe UI,Arial'; ctx.fillText('Tocca per ripartire', W/2, H/2+28);
        ctx.fillText(`Best: ${best||0}`, W/2, H/2+48);
      }
    }
  }

  function drawHudCompact(){
    // box HUD
    ctx.save();
    ctx.fillStyle='rgba(8,12,28,0.55)';
    ctx.fillRect(10,10,240,78);

    ctx.fillStyle='#ecf2ff';
    ctx.font='bold 14px system-ui,Segoe UI,Arial';
    ctx.textAlign='left';
    ctx.fillText(`⏱ ${elapsed.toFixed(1)}s`, 16, 28);
    ctx.fillText(`🏁 ${score}`, 16, 46);
    ctx.textAlign='right';
    ctx.fillText(`Best: ${best||0}`, 244, 28);

    // Turbo bar
    ctx.textAlign='left';
    ctx.fillText('Turbo', 16, 64);
    ctx.strokeStyle='#2dd4bf'; ctx.lineWidth=2;
    ctx.strokeRect(64, 52, 120, 10);
    ctx.fillStyle='#22c55e';
    const pct = (typeof turboEnergy!=='undefined' ? turboEnergy : 0) / 100;
    ctx.fillRect(64, 52, 120*Math.max(0,Math.min(1,pct)), 10);

    // Shield timer
    if (player.shieldTime>0){
      ctx.fillStyle='#a5f3fc';
      ctx.fillText(`Shield ${player.shieldTime.toFixed(0)}s`, 16, 80);
    }
    ctx.restore();
  }

  function drawRoad(yBase, road='#0f1834', dash='#223069'){
    ctx.fillStyle=road; ctx.fillRect(0,yBase,W,12);
    ctx.strokeStyle=dash; ctx.lineWidth=2;
    for(let i=0;i<LANES;i++){
      const y=yBase - i*laneGap - laneGap/2;
      ctx.setLineDash([12,10]); ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  function drawLift(L){
    const isGhost = !!L.ghost, occupied = L.npc==='family';
    if (occupied){
      const blinkOn = Math.floor(performance.now()/120)%2===0;
      ctx.fillStyle = blinkOn ? '#ff5a5a' : '#7a2b2b';
    } else if (isGhost){
      ctx.fillStyle='#6d28d9'; ctx.fillRect(L.x-2,L.y-2,L.w+4,L.h+4);
      ctx.fillStyle='#8b5cf6';
    } else {
      ctx.fillStyle=L.active ? '#2dd36f' : '#2a7a54';
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
    if(L.dir==='up'){ ctx.moveTo(cx,cy-6); ctx.lineTo(cx-6,cy+4); ctx.lineTo(cx+6,cy+4); }
    else { ctx.moveTo(cx,cy+6); ctx.lineTo(cx-6,cy-4); ctx.lineTo(cx+6,cy-4); }
    ctx.closePath(); ctx.fill();

    // NPC family stilizzato
    if (occupied){
      const px=L.x+L.w*0.75, py=L.y-2;
      ctx.save(); ctx.strokeStyle='#ffe6e6'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(px, py-10, 5, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px, py-5); ctx.lineTo(px, py+10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px, py+10); ctx.lineTo(px-5, py+18); ctx.moveTo(px, py+10); ctx.lineTo(px+5, py+18); ctx.stroke();
      const cx2=px-12, cy2=py-2;
      ctx.beginPath(); ctx.arc(cx2, cy2-6, 3.2, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx2, cy2-2); ctx.lineTo(cx2, cy2+8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx2, cy2+8); ctx.lineTo(cx2-3, cy2+14); ctx.moveTo(cx2, cy2+8); ctx.lineTo(cx2+3, cy2+14); ctx.stroke();
      ctx.restore();
    }
  }

  function drawObstacle(o){
    if(o.type==='block'){
      ctx.fillStyle='#ef4444'; ctx.fillRect(o.x,o.y,o.w,o.h);
      ctx.fillStyle='#ffd4d4'; ctx.fillRect(o.x+4,o.y+4,o.w-8,6);
    } else if(o.type==='bush'){
      const r=o.w/2, cx=o.x+r, cy=o.y+r;
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(o.theta||0);
      ctx.fillStyle='#c59b6d'; ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#7a5c36'; ctx.lineWidth=2;
      for(let i=0;i<6;i++){ const a=i*Math.PI/3; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r); ctx.stroke(); }
      ctx.restore();
    } else { // tire
      const r=o.w/2, cx=o.x+r, cy=o.y+r;
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(o.theta||0);
      ctx.fillStyle='#212121'; ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#3c3c3c'; ctx.beginPath(); ctx.arc(0,0,r*0.62,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#9a9a9a'; ctx.lineWidth=2;
      for(let i=0;i<6;i++){ const a=i*Math.PI/3; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(a)*r*0.62, Math.sin(a)*r*0.62); ctx.stroke(); }
      ctx.restore();
    }
  }

  function drawBonus(b){
    const color = b.points>=1000 ? '#a78bfa' : b.points>=500 ? '#60a5fa' : '#22c55e';
    ctx.fillStyle=color; ctx.beginPath();
    ctx.arc(b.x+b.w/2, b.y+b.h/2, b.w/2, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.6)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(b.x+b.w/2, b.y+b.h/2, b.w/2+2, 0, Math.PI*2); ctx.stroke();
  }

  function drawShieldPickup(s){
    if(!s.active) return;
    ctx.save();
    ctx.shadowColor='#93c5fd'; ctx.shadowBlur=8;
    ctx.fillStyle='#60a5fa';
    ctx.beginPath(); ctx.arc(s.x+s.w/2, s.y+s.h/2, s.w/2, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function drawUFO(u){
    ctx.save(); ctx.translate(u.x,u.y);
    ctx.fillStyle='#8ab4ff'; ctx.beginPath();
    ctx.ellipse(0,0, u.w*0.5, u.h*0.38, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.85)'; ctx.beginPath();
    ctx.ellipse(-4,-8, u.w*0.25, u.h*0.28, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle='#ffd166';
    for(let i=-2;i<=2;i++){ ctx.beginPath(); ctx.arc(i*10,8,3,0,Math.PI*2); ctx.fill(); }
    ctx.restore();
  }

  function drawParticle(p){
    ctx.save(); ctx.globalAlpha = Math.max(0, p.ttl/0.45);
    ctx.fillStyle='rgba(255,255,255,0.85)'; ctx.fillRect(p.x,p.y,2,2);
    ctx.restore();
  }

  function drawFloat(f){
    ctx.save(); ctx.globalAlpha=Math.max(0,f.ttl/1.2);
    ctx.fillStyle='#ecf2ff'; ctx.font='bold 14px system-ui,Segoe UI,Arial';
    ctx.fillText(f.text, f.x, f.y); ctx.restore();
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
    const dt = Math.min(0.033,(now-last)/1000); last=now;
    if(running && !paused && player.alive) update(dt);
    draw();

    // sincronizza HUD DOM (se presente)
    if(timeEl)  timeEl.textContent = elapsed.toFixed(1);
    if(scoreEl) scoreEl.textContent = String(score);

    requestAnimationFrame(loop);
  }

  // ===== Input tap per start/restart =====
  canvas.addEventListener('pointerdown', e=>{
    if(!running || !player.alive){
      e.preventDefault();
      ensureAudio(); actx && actx.resume && actx.resume();
      startGame();
    }
  }, {passive:false});

  // ===== Kick =====
  requestAnimationFrame(ts=>{ last=ts; draw(); requestAnimationFrame(loop); });

  // ===== Utility di discesa pneumatico da lift (richiamata nel Blocco 2) =====
  function dropTire(L){
    const startX = L.x + L.w*0.5;
    const startY = levelY.high - laneGap*1 - 6 - 28;
    obstacles.push({
      type:'tire', level:'high', lane:1,
      x:startX, y:startY, w:28, h:28,
      speed: BASE_SCROLL + 0.6, theta: 0, vy: 0, falling:true, scored:false
    });
  }
})();
