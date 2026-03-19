// ─── TOP-DOWN BROWSER SHOOTER ───────────────────────────────────────────────

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const W = 800;
const H = 600;

// ─── GAME STATES ────────────────────────────────────────────────────────────

const STATE = { MENU: 'MENU', PLAYING: 'PLAYING', LEVEL_COMPLETE: 'LEVEL_COMPLETE', GAME_OVER: 'GAME_OVER' };
let state = STATE.MENU;

// ─── INPUT ───────────────────────────────────────────────────────────────────

const keys = {};
const mouse = { x: W / 2, y: H / 2, down: false };

document.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
    if (e.code === 'Enter') {
        if (state === STATE.MENU) startGame();
        else if (state === STATE.GAME_OVER) { state = STATE.MENU; menuTime = 0; titleY = -80; initMenuEnemies(); }
    }
    if (e.code === 'Escape' && state === STATE.PLAYING) paused = !paused;
});
document.addEventListener('keyup', e => { keys[e.code] = false; });
canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) * (W / r.width);
    mouse.y = (e.clientY - r.top) * (H / r.height);
});
canvas.addEventListener('mousedown', e => { if (e.button === 0) mouse.down = true; });
canvas.addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ─── GLOBALS ─────────────────────────────────────────────────────────────────

let paused = false;
let score = 0;
let level = 1;
let wave = 1;
let totalWaves = 2;

// Screen shake
let shakeX = 0, shakeY = 0, shakeIntensity = 0;

// Screen flash
let flashColor = 'rgba(255,0,0,1)', flashAlpha = 0;

// Entities
let player = null;
let bullets = [];
let enemies = [];
let particles = [];
let muzzleFlash = null;

// Wave management
let levelWaves = [];        // array of arrays of enemy type strings
let currentWaveIndex = 0;
let enemiesToSpawn = [];
let spawnTimer = 0;
let spawnInterval = 1.0;
let waveCleared = false;
let waveClearTimer = 0;

// Level complete
let levelCompleteTimer = 0;
const LEVEL_COMPLETE_DELAY = 3.5;

// Menu
let menuTime = 0;
let titleY = -80;
let menuEnemies = [];

// ─── ENEMY TYPES ─────────────────────────────────────────────────────────────

const ET = { GRUNT: 'GRUNT', RUNNER: 'RUNNER', TANK: 'TANK' };

// ─── FACTORY FUNCTIONS ───────────────────────────────────────────────────────

function makePlayer() {
    return {
        x: W / 2, y: H / 2,
        w: 20, h: 20,
        speed: 200,
        hp: 100, maxHp: 100,
        angle: 0,
        shootCooldown: 0,
        shootRate: 0.13,
        invincible: 0,
        alive: true,
    };
}

function makeBullet(x, y, angle) {
    const spd = 520;
    return {
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        w: 5, h: 5,
        damage: 25,
        trail: [],
        life: 2.0,
    };
}

function makeEnemy(type, x, y) {
    const base = { x, y, angle: 0, hitFlash: 0, alive: true };
    switch (type) {
        case ET.GRUNT:  return { ...base, type, w: 20, h: 20, hp: 50,  maxHp: 50,  speed: 75,  color: '#ff2222', scoreVal: 10 };
        case ET.RUNNER: return { ...base, type, w: 16, h: 16, hp: 30,  maxHp: 30,  speed: 165, color: '#ff8800', scoreVal: 20, zigTimer: 0, zigDir: 1 };
        case ET.TANK:   return { ...base, type, w: 30, h: 30, hp: 150, maxHp: 150, speed: 45,  color: '#aa44ff', scoreVal: 50 };
    }
}

function makeParticle(x, y, color) {
    const angle = Math.random() * Math.PI * 2;
    const spd = 60 + Math.random() * 160;
    const life = 0.35 + Math.random() * 0.3;
    return { x, y, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
             w: 3 + Math.random() * 4, h: 3 + Math.random() * 4,
             color, life, maxLife: life };
}

// ─── LEVEL WAVE DEFINITIONS ──────────────────────────────────────────────────

function buildLevelWaves(lvl) {
    if (lvl === 1) return [
        repeat(ET.GRUNT, 5),
        repeat(ET.GRUNT, 5),
    ];
    if (lvl === 2) return [
        [...repeat(ET.GRUNT, 6), ...repeat(ET.RUNNER, 2)],
        [...repeat(ET.GRUNT, 4), ...repeat(ET.RUNNER, 4)],
        [...repeat(ET.GRUNT, 2), ...repeat(ET.RUNNER, 4)],
    ];
    // Level 3+
    const extra = lvl - 3;
    const numWaves = 3 + Math.floor(extra / 2);
    const waves = [];
    for (let w = 0; w < numWaves; w++) {
        const base = 4 + extra;
        const grunts  = Math.max(1, base - w);
        const runners = 1 + Math.floor(w * 1.2);
        const tanks   = lvl >= 3 ? 1 + Math.floor(w / 2) : 0;
        waves.push([...repeat(ET.GRUNT, grunts), ...repeat(ET.RUNNER, runners), ...repeat(ET.TANK, tanks)]);
    }
    return waves;
}

function repeat(val, n) { return Array(n).fill(val); }

// ─── SPAWN ───────────────────────────────────────────────────────────────────

function spawnAtEdge(type) {
    const edge = Math.floor(Math.random() * 4);
    const m = 40;
    let x, y;
    switch (edge) {
        case 0: x = rand(W);  y = -m;     break;
        case 1: x = W + m;   y = rand(H); break;
        case 2: x = rand(W);  y = H + m;  break;
        case 3: x = -m;      y = rand(H); break;
    }
    return makeEnemy(type, x, y);
}

function rand(n) { return Math.random() * n; }

// ─── GAME FLOW ────────────────────────────────────────────────────────────────

function startGame() {
    player   = makePlayer();
    bullets  = [];
    enemies  = [];
    particles = [];
    muzzleFlash = null;
    score = 0;
    paused = false;
    shakeIntensity = 0;
    flashAlpha = 0;
    state = STATE.PLAYING;
    startLevel(1);
}

function startLevel(lvl) {
    level      = lvl;
    levelWaves = buildLevelWaves(lvl);
    totalWaves = levelWaves.length;
    currentWaveIndex = 0;
    startWave(0);
}

function startWave(idx) {
    wave           = idx + 1;
    enemiesToSpawn = shuffle([...levelWaves[idx]]);
    enemies        = [];
    bullets        = [];
    spawnTimer     = 0.5;
    waveCleared    = false;
    waveClearTimer = 0;
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function screenShake(amt) { shakeIntensity = Math.max(shakeIntensity, amt); }
function screenFlash(color, alpha) { flashColor = color; flashAlpha = alpha; }

// ─── UPDATE ───────────────────────────────────────────────────────────────────

function updatePlaying(dt) {
    if (paused) return;

    updatePlayer(dt);
    updateBullets(dt);
    updateEnemies(dt);
    updateParticles(dt);
    updateMuzzleFlash(dt);
    updateWaveLogic(dt);

    // Screen shake decay
    if (shakeIntensity > 0.1) {
        shakeX = (Math.random() - 0.5) * shakeIntensity * 2;
        shakeY = (Math.random() - 0.5) * shakeIntensity * 2;
        shakeIntensity *= 0.88;
    } else {
        shakeX = 0; shakeY = 0; shakeIntensity = 0;
    }

    // Flash decay
    if (flashAlpha > 0) { flashAlpha *= 0.82; if (flashAlpha < 0.01) flashAlpha = 0; }
}

function updatePlayer(dt) {
    if (!player || !player.alive) return;

    let dx = 0, dy = 0;
    if (keys['KeyW'] || keys['ArrowUp'])    dy -= 1;
    if (keys['KeyS'] || keys['ArrowDown'])  dy += 1;
    if (keys['KeyA'] || keys['ArrowLeft'])  dx -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) dx += 1;
    if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }

    player.x = clamp(player.x + dx * player.speed * dt, player.w / 2, W - player.w / 2);
    player.y = clamp(player.y + dy * player.speed * dt, player.h / 2, H - player.h / 2);

    player.angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);

    if (player.shootCooldown > 0) player.shootCooldown -= dt;
    if (mouse.down && player.shootCooldown <= 0) {
        player.shootCooldown = player.shootRate;
        const ml = 16;
        const mx = player.x + Math.cos(player.angle) * ml;
        const my = player.y + Math.sin(player.angle) * ml;
        bullets.push(makeBullet(mx, my, player.angle));
        muzzleFlash = { x: mx, y: my, life: 0.07, maxLife: 0.07, radius: 9 };
    }

    if (player.invincible > 0) player.invincible -= dt;
}

function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 7) b.trail.shift();
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        if (b.life <= 0 || b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30) {
            bullets.splice(i, 1);
        }
    }
}

function updateEnemies(dt) {
    // Spawn next enemy
    spawnTimer -= dt;
    if (spawnTimer <= 0 && enemiesToSpawn.length > 0) {
        spawnTimer = spawnInterval;
        enemies.push(spawnAtEdge(enemiesToSpawn.pop()));
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (!e.alive) { enemies.splice(i, 1); continue; }

        if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt * 8);

        if (!player || !player.alive) continue;

        const dx = player.x - e.x;
        const dy = player.y - e.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        e.angle = Math.atan2(dy, dx);

        if (e.type === ET.RUNNER) {
            e.zigTimer += dt;
            if (e.zigTimer > 0.4 + Math.random() * 0.2) { e.zigTimer = 0; e.zigDir *= -1; }
            const px = -dy / dist;
            const py = dx / dist;
            e.x += (dx / dist * e.speed + px * e.speed * 0.55 * e.zigDir) * dt;
            e.y += (dy / dist * e.speed + py * e.speed * 0.55 * e.zigDir) * dt;
        } else {
            e.x += dx / dist * e.speed * dt;
            e.y += dy / dist * e.speed * dt;
        }

        // Bullet collision
        for (let j = bullets.length - 1; j >= 0; j--) {
            if (aabb(bullets[j], e)) {
                e.hp -= bullets[j].damage;
                e.hitFlash = 1;
                bullets.splice(j, 1);
                if (e.hp <= 0) killEnemy(e);
                break;
            }
        }

        // Player collision
        if (player.invincible <= 0 && aabb(player, e)) {
            damagePlayer(20);
        }
    }
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 0.93; p.vy *= 0.93;
        p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function updateMuzzleFlash(dt) {
    if (muzzleFlash) { muzzleFlash.life -= dt; if (muzzleFlash.life <= 0) muzzleFlash = null; }
}

function updateWaveLogic(dt) {
    if (waveCleared) {
        waveClearTimer -= dt;
        if (waveClearTimer <= 0) {
            if (currentWaveIndex + 1 < levelWaves.length) {
                currentWaveIndex++;
                startWave(currentWaveIndex);
            } else {
                state = STATE.LEVEL_COMPLETE;
                levelCompleteTimer = LEVEL_COMPLETE_DELAY;
            }
        }
        return;
    }
    if (enemiesToSpawn.length === 0 && enemies.length === 0) {
        waveCleared = true;
        waveClearTimer = (currentWaveIndex + 1 < levelWaves.length) ? 2.0 : 1.0;
    }
}

function updateLevelComplete(dt) {
    levelCompleteTimer -= dt;
    if (flashAlpha > 0) { flashAlpha *= 0.82; if (flashAlpha < 0.01) flashAlpha = 0; }
    if (levelCompleteTimer <= 0) {
        startLevel(level + 1);
        state = STATE.PLAYING;
    }
}

function damagePlayer(dmg) {
    if (!player || !player.alive || player.invincible > 0) return;
    player.hp = Math.max(0, player.hp - dmg);
    player.invincible = 1.2;
    screenShake(10);
    screenFlash('#ff0000', 0.35);
    if (player.hp <= 0) {
        player.alive = false;
        for (let i = 0; i < 16; i++) particles.push(makeParticle(player.x, player.y, '#00ffff'));
        setTimeout(() => { state = STATE.GAME_OVER; menuTime = 0; }, 1600);
    }
}

function killEnemy(e) {
    e.alive = false;
    score += e.scoreVal;
    for (let i = 0; i < 8; i++) particles.push(makeParticle(e.x, e.y, e.color));
}

function aabb(a, b) {
    return Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
           Math.abs(a.y - b.y) < (a.h + b.h) / 2;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// ─── DRAW HELPERS ─────────────────────────────────────────────────────────────

function drawBackground() {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,55,0,0.38)';
    ctx.lineWidth = 1;
    const gs = 40;
    for (let x = 0; x <= W; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}

function drawPlayer() {
    if (!player || !player.alive) return;
    if (player.invincible > 0 && Math.floor(player.invincible * 12) % 2 === 0) return;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    // Body
    ctx.fillStyle = '#00ffff';
    ctx.fillRect(-10, -10, 20, 20);
    // Treads
    ctx.fillStyle = '#008888';
    ctx.fillRect(-10, -10, 4, 20);
    ctx.fillRect(6, -10, 4, 20);
    // Cockpit
    ctx.fillStyle = '#004455';
    ctx.fillRect(-4, -4, 8, 8);
    // Gun barrel
    ctx.fillStyle = '#00bbbb';
    ctx.fillRect(4, -3, 14, 6);
    ctx.restore();
}

function drawBullets() {
    for (const b of bullets) {
        // Trail
        for (let i = 0; i < b.trail.length; i++) {
            const t = b.trail[i];
            const frac = i / b.trail.length;
            ctx.globalAlpha = frac * 0.55;
            ctx.fillStyle = '#ffff00';
            const s = b.w * frac;
            ctx.fillRect(t.x - s / 2, t.y - s / 2, s, s);
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffff44';
        ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(b.x - 1.5, b.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
}

function drawEnemyShape(e) {
    const flash = e.hitFlash > 0;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle);

    if (e.type === ET.GRUNT) {
        ctx.fillStyle = flash ? '#ffffff' : e.color;
        ctx.fillRect(-e.w / 2, -e.h / 2, e.w, e.h);
        ctx.fillStyle = flash ? '#ffaaaa' : '#880000';
        ctx.fillRect(-e.w / 4, -e.h / 4, e.w / 2, e.h / 2);
    } else if (e.type === ET.RUNNER) {
        ctx.fillStyle = flash ? '#ffffff' : e.color;
        ctx.beginPath();
        ctx.moveTo(e.w / 2, 0);
        ctx.lineTo(-e.w / 2, -e.h / 2);
        ctx.lineTo(-e.w / 2, e.h / 2);
        ctx.closePath();
        ctx.fill();
        // Eye dot
        ctx.fillStyle = flash ? '#ffddaa' : '#441100';
        ctx.fillRect(e.w / 6, -2, 4, 4);
    } else if (e.type === ET.TANK) {
        ctx.fillStyle = flash ? '#ffffff' : e.color;
        ctx.fillRect(-e.w / 2, -e.h / 2, e.w, e.h);
        // Treads
        ctx.fillStyle = flash ? '#ddbbff' : '#550077';
        ctx.fillRect(-e.w / 2, -e.h / 2, 5, e.h);
        ctx.fillRect(e.w / 2 - 5, -e.h / 2, 5, e.h);
        // Inner hull
        ctx.fillStyle = flash ? '#eeddff' : '#7722aa';
        ctx.fillRect(-e.w / 3, -e.h / 3, e.w * 2 / 3, e.h * 2 / 3);
        // Barrel
        ctx.fillStyle = flash ? '#ffffff' : '#440066';
        ctx.fillRect(2, -4, e.w / 2 + 6, 8);
    }

    ctx.restore();

    // HP bar (only when damaged)
    if (e.hp < e.maxHp) {
        const bw = e.w + 6, bh = 4;
        const bx = e.x - bw / 2, by = e.y - e.h / 2 - 8;
        ctx.fillStyle = '#222';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = e.hp / e.maxHp > 0.5 ? '#00ff44' : e.hp / e.maxHp > 0.25 ? '#ffaa00' : '#ff2222';
        ctx.fillRect(bx, by, bw * (e.hp / e.maxHp), bh);
    }
}

function drawParticles() {
    for (const p of particles) {
        ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
    }
    ctx.globalAlpha = 1;
}

function drawMuzzleFlash() {
    if (!muzzleFlash) return;
    const t = muzzleFlash.life / muzzleFlash.maxLife;
    ctx.globalAlpha = t;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(muzzleFlash.x, muzzleFlash.y, muzzleFlash.radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffaa';
    ctx.beginPath(); ctx.arc(muzzleFlash.x, muzzleFlash.y, muzzleFlash.radius * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
}

function drawHUD() {
    // Health bar
    const hbW = 164, hbH = 16;
    const hpPct = player ? player.hp / player.maxHp : 0;
    ctx.fillStyle = '#222';
    ctx.fillRect(10, 10, hbW, hbH);
    ctx.fillStyle = hpPct > 0.5 ? '#00ff44' : hpPct > 0.25 ? '#ffaa00' : '#ff2222';
    ctx.fillRect(10, 10, hbW * hpPct, hbH);
    ctx.strokeStyle = '#00bb44';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, hbW, hbH);
    ctx.fillStyle = '#00ff00';
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('HP', 14, 23);

    // Score
    ctx.fillStyle = '#00ff00';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`SCORE: ${score}`, W - 10, 24);

    // Level / wave
    ctx.textAlign = 'center';
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillStyle = '#00cc00';
    ctx.fillText(`LEVEL ${level}  \u2014  WAVE ${wave}/${totalWaves}`, W / 2, H - 12);

    // Wave clear message
    if (waveCleared && waveClearTimer > 0 && currentWaveIndex + 1 < levelWaves.length) {
        const a = clamp(waveClearTimer * 1.5, 0, 1);
        ctx.globalAlpha = a;
        ctx.fillStyle = '#ffff00';
        ctx.font = '18px "Press Start 2P", monospace';
        ctx.fillText('WAVE CLEAR!', W / 2, H / 2 - 20);
        ctx.globalAlpha = 1;
    }

    // Paused overlay
    if (paused) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#00ff00';
        ctx.font = '22px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('PAUSED', W / 2, H / 2 - 16);
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.fillStyle = '#00bb00';
        ctx.fillText('ESC TO RESUME', W / 2, H / 2 + 18);
    }
    ctx.textAlign = 'left';
}

function drawScreenFlash() {
    if (flashAlpha <= 0) return;
    ctx.fillStyle = flashColor;
    ctx.globalAlpha = flashAlpha;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
}

// ─── MENU ────────────────────────────────────────────────────────────────────

function initMenuEnemies() {
    menuEnemies = [];
    const types = [ET.GRUNT, ET.GRUNT, ET.RUNNER, ET.RUNNER, ET.TANK, ET.GRUNT, ET.RUNNER, ET.TANK];
    for (const type of types) {
        menuEnemies.push({
            type,
            x: Math.random() * W, y: Math.random() * H,
            angle: Math.random() * Math.PI * 2,
            w: type === ET.TANK ? 30 : type === ET.RUNNER ? 16 : 20,
            h: type === ET.TANK ? 30 : type === ET.RUNNER ? 16 : 20,
            speed: 25 + Math.random() * 20,
            color: type === ET.GRUNT ? '#ff2222' : type === ET.RUNNER ? '#ff8800' : '#aa44ff',
            hitFlash: 0, alive: true,
        });
    }
}

function updateMenu(dt) {
    menuTime += dt;
    titleY += (180 - titleY) * Math.min(dt * 4, 1);
    for (const e of menuEnemies) {
        e.x += Math.cos(e.angle) * e.speed * dt;
        e.y += Math.sin(e.angle) * e.speed * dt;
        if (e.x < 0 || e.x > W) e.angle = Math.PI - e.angle;
        if (e.y < 0 || e.y > H) e.angle = -e.angle;
        e.x = clamp(e.x, 0, W);
        e.y = clamp(e.y, 0, H);
    }
}

function drawMenu() {
    drawBackground();

    // Drifting background enemies
    ctx.globalAlpha = 0.25;
    for (const e of menuEnemies) drawEnemyShape(e);
    ctx.globalAlpha = 1;

    // Title shadow
    ctx.textAlign = 'center';
    ctx.font = 'bold 28px "Press Start 2P", monospace';
    ctx.fillStyle = '#002200';
    ctx.fillText('TOP-DOWN', W / 2 + 3, titleY + 3);
    ctx.fillText('SHOOTER', W / 2 + 3, titleY + 44);

    // Title
    ctx.fillStyle = '#00ff00';
    ctx.fillText('TOP-DOWN', W / 2, titleY);
    ctx.fillStyle = '#44ff44';
    ctx.fillText('SHOOTER', W / 2, titleY + 40);

    // Blink prompt
    if (Math.floor(menuTime * 1.8) % 2 === 0) {
        ctx.font = '11px "Press Start 2P", monospace';
        ctx.fillStyle = '#00ff00';
        ctx.fillText('PRESS ENTER TO START', W / 2, H / 2 + 50);
    }

    // Controls hint
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillStyle = '#006600';
    ctx.fillText('WASD/ARROWS: MOVE   MOUSE: AIM   CLICK: SHOOT   ESC: PAUSE', W / 2, H - 28);

    // Enemy legend
    const legendY = H / 2 + 100;
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillStyle = '#ff2222'; ctx.fillText('\u25A0 GRUNT  10pts', W / 2 - 170, legendY);
    ctx.fillStyle = '#ff8800'; ctx.fillText('\u25B6 RUNNER  20pts', W / 2 - 10, legendY);
    ctx.fillStyle = '#aa44ff'; ctx.fillText('\u25A0 TANK  50pts', W / 2 + 160, legendY);

    ctx.textAlign = 'left';
}

function drawGameOver() {
    drawBackground();
    drawParticles();

    ctx.textAlign = 'center';
    // Title
    ctx.font = '28px "Press Start 2P", monospace';
    ctx.fillStyle = '#ff0000';
    ctx.fillText('GAME OVER', W / 2, H / 2 - 70);
    // Stats
    ctx.font = '13px "Press Start 2P", monospace';
    ctx.fillStyle = '#00ff00';
    ctx.fillText(`SCORE: ${score}`, W / 2, H / 2 - 10);
    ctx.fillText(`LEVEL: ${level}`, W / 2, H / 2 + 22);
    // Prompt
    if (Math.floor(menuTime * 1.8) % 2 === 0) {
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.fillStyle = '#ffff00';
        ctx.fillText('PRESS ENTER TO CONTINUE', W / 2, H / 2 + 80);
    }
    ctx.textAlign = 'left';
}

function drawLevelComplete() {
    drawBackground();

    // Scanline wipe
    const prog = 1 - clamp(levelCompleteTimer / LEVEL_COMPLETE_DELAY, 0, 1);
    ctx.fillStyle = 'rgba(0,80,0,0.07)';
    const scanH = H * prog;
    for (let y = 0; y < scanH; y += 4) ctx.fillRect(0, y, W, 2);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#00ff00';
    ctx.font = '22px "Press Start 2P", monospace';
    ctx.fillText('LEVEL COMPLETE!', W / 2, H / 2 - 80);

    ctx.font = '13px "Press Start 2P", monospace';
    ctx.fillStyle = '#44ff44';
    ctx.fillText(`LEVEL ${level} CLEARED`, W / 2, H / 2 - 30);

    ctx.fillStyle = '#00ff00';
    ctx.fillText(`SCORE: ${score}`, W / 2, H / 2 + 10);

    const nxt = Math.ceil(levelCompleteTimer);
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillStyle = '#ffff00';
    ctx.fillText(`NEXT LEVEL IN ${nxt}...`, W / 2, H / 2 + 60);

    ctx.textAlign = 'left';
}

// ─── MAIN LOOP ────────────────────────────────────────────────────────────────

let lastTime = 0;

function gameLoop(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
    lastTime = timestamp;

    ctx.save();

    switch (state) {
        case STATE.MENU:
            updateMenu(dt);
            drawMenu();
            break;

        case STATE.PLAYING:
            updatePlaying(dt);
            ctx.translate(shakeX, shakeY);
            drawBackground();
            drawParticles();
            drawBullets();
            drawMuzzleFlash();
            for (const e of enemies) drawEnemyShape(e);
            drawPlayer();
            drawScreenFlash();
            drawHUD();
            break;

        case STATE.LEVEL_COMPLETE:
            updateLevelComplete(dt);
            drawLevelComplete();
            break;

        case STATE.GAME_OVER:
            menuTime += dt;
            drawGameOver();
            break;
    }

    ctx.restore();
    requestAnimationFrame(gameLoop);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

initMenuEnemies();
requestAnimationFrame(gameLoop);
