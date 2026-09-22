import './styles.css';
import { tempoAt, routeStep, steer, launchVelocity } from './climb-physics';

type Screen = 'home' | 'climb' | 'game' | 'shop' | 'stats' | 'achievements' | 'settings';
type PowerUp = 'joker' | 'freeze' | 'hint';

type PlayerData = {
  coins: number;
  currentLevel: number;
  maxLevelReached: number;
  inventory: Record<PowerUp, number>;
  stats: { totalGames: number; wins: number; totalMatches: number; bestMoves: number | null };
  achievements: string[];
  climb: { bestHeight: number; runs: number; totalLandings: number };
  settings: { sfx: boolean; haptics: boolean; music?: boolean };
};

type LevelConfig = { rows: number; cols: number; pairs: number; time: number };

type CardState = { id: number; value: string; element: HTMLButtonElement };

const STORAGE_KEY = 'hafizaProV2';
const DEFAULT_DATA: PlayerData = {
  coins: 100,
  currentLevel: 1,
  maxLevelReached: 1,
  inventory: { joker: 1, freeze: 0, hint: 0 },
  stats: { totalGames: 0, wins: 0, totalMatches: 0, bestMoves: null },
  achievements: [],
  climb: { bestHeight: 0, runs: 0, totalLandings: 0 },
  settings: { sfx: true, haptics: true, music: true },
};

const EMOJIS = ['🦁','🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦒','🦓','🦌','🐮','🐷','🐸','🐵','🍎','🍌','🍇','🍓','🍒','🍑','🍍','🥝','⚽','🏀','🏈','⚾','🎾','🚀','🛸','🎸','🎻','🎯','🪁','🌙'];
const SHOP = [
  { id: 'joker' as const, icon: '👁️', name: 'Gözcü', desc: 'Açıkta kalan tüm kartları kısa süre gösterir.', price: 50 },
  { id: 'freeze' as const, icon: '❄️', name: 'Zaman Dondur', desc: 'Sayaçlı seviyelerde zamanı 10 saniye durdurur.', price: 100 },
  { id: 'hint' as const, icon: '💡', name: 'İpucu', desc: 'Tahtadaki eşleşmelerden birini kısa süre gösterir.', price: 150 },
];
const ACHIEVEMENTS = [
  { id: 'first_win', icon: '🌱', title: 'İlk Adım', desc: 'İlk seviyeni tamamla.', unlocked: (d: PlayerData) => d.stats.wins >= 1 },
  { id: 'rich', icon: '🪙', title: 'Koleksiyoncu', desc: '500 altına ulaş.', unlocked: (d: PlayerData) => d.coins >= 500 },
  { id: 'veteran', icon: '🎯', title: 'Rutin', desc: '50 oyun başlat.', unlocked: (d: PlayerData) => d.stats.totalGames >= 50 },
  { id: 'master', icon: '🧠', title: 'Hafıza Ustası', desc: '20. seviyeye ulaş.', unlocked: (d: PlayerData) => d.maxLevelReached >= 20 },
];

const cloneDefault = (): PlayerData => structuredClone(DEFAULT_DATA);

function normalizeData(raw: unknown): PlayerData {
  const source = raw && typeof raw === 'object' ? raw as Partial<PlayerData> : {};
  return {
    ...cloneDefault(),
    ...source,
    inventory: { ...DEFAULT_DATA.inventory, ...(source.inventory ?? {}) },
    stats: { ...DEFAULT_DATA.stats, ...(source.stats ?? {}) },
    climb: { ...DEFAULT_DATA.climb, ...(source.climb ?? {}) },
    settings: { ...DEFAULT_DATA.settings, ...(source.settings ?? {}) },
    achievements: Array.isArray(source.achievements) ? source.achievements : [],
  };
}

const Store = {
  data: cloneDefault(),
  load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      this.data = saved ? normalizeData(JSON.parse(saved)) : cloneDefault();
    } catch {
      this.data = cloneDefault();
    }
    this.save();
  },
  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    renderGlobalStats();
  },
  reset() {
    localStorage.removeItem(STORAGE_KEY);
    this.data = cloneDefault();
    this.save();
    navigate('home');
    toast('İlerleme sıfırlandı.');
  },
};

function levelConfig(level: number): LevelConfig {
  let rows = 4;
  let cols = 4;
  let time = 0;
  if (level > 2) rows = 5;
  if (level > 5) { rows = 6; time = 120; }
  if (level > 10) { cols = 5; time = 180; }
  if (level > 15) { cols = 6; time = 240; }
  return { rows, cols, time, pairs: (rows * cols) / 2 };
}

function shuffle<T>(values: T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

const AudioFx = {
  ctx: null as AudioContext | null,
  master: null as GainNode | null,

  ensureContext() {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!this.ctx) {
      this.ctx = new AudioContextClass();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  },

  unlock() {
    const ctx = this.ensureContext();
    if (ctx?.state === 'suspended') void ctx.resume();
  },

  noise(type: 'crack' | 'break') {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const duration = type === 'crack' ? 0.035 : 0.05;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      const life = 1 - i / length;
      channel[i] = (Math.random() * 2 - 1) * Math.pow(life, type === 'crack' ? 2.8 : 2.1);
    }
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = type === 'crack' ? 3100 : 2300;
    filter.Q.value = 0.7;
    gain.gain.value = type === 'crack' ? 0.12 : 0.14;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
  },

  play(type: 'flip' | 'match' | 'win' | 'bounce' | 'fail' | 'crack' | 'break' | 'pickup' | 'shield' | 'milestone' | 'spring') {
    if (!Store.data.settings.sfx) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    if (ctx.state === 'suspended') void ctx.resume();
    if (type === 'crack' || type === 'break') {
      this.noise(type);
      return;
    }

    const now = ctx.currentTime;
    const profiles: Record<Exclude<typeof type, 'crack' | 'break'>, { tones: number[]; end?: number; duration: number; volume: number; wave: OscillatorType }> = {
      flip: { tones: [620], duration: 0.07, volume: 0.045, wave: 'sine' },
      match: { tones: [760, 940], duration: 0.09, volume: 0.075, wave: 'triangle' },
      win: { tones: [660, 830, 1040], duration: 0.11, volume: 0.08, wave: 'triangle' },
      bounce: { tones: [740], end: 1100, duration: 0.06, volume: 0.13, wave: 'triangle' },
      spring: { tones: [620, 1240], end: 1900, duration: 0.12, volume: 0.16, wave: 'triangle' },
      fail: { tones: [330], end: 210, duration: 0.13, volume: 0.075, wave: 'triangle' },
      pickup: { tones: [880, 1180], duration: 0.065, volume: 0.085, wave: 'sine' },
      shield: { tones: [540, 720, 900], duration: 0.075, volume: 0.09, wave: 'triangle' },
      milestone: { tones: [700, 920, 1180], duration: 0.09, volume: 0.085, wave: 'sine' },
    };
    const profile = profiles[type as Exclude<typeof type, 'crack' | 'break'>];
    profile.tones.forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + index * 0.055;
      osc.type = profile.wave;
      osc.frequency.setValueAtTime(frequency, start);
      if (profile.end && index === 0) osc.frequency.exponentialRampToValueAtTime(profile.end, start + profile.duration);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(profile.volume, start + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.001, start + profile.duration);
      osc.connect(gain).connect(this.master!);
      osc.start(start);
      osc.stop(start + profile.duration + 0.015);
    });
  },
};

function haptic(pattern: number | number[]) {
  if (Store.data.settings.haptics && navigator.vibrate) navigator.vibrate(pattern);
}


type PlatformKind = 'solid' | 'moving' | 'fragile' | 'spring' | 'boost';
type PickupKind = 'coin' | 'spring' | 'shield';
type Platform = {
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  kind: PlatformKind;
  breakTimer: number;
  broken: boolean;
  routeIndex: number;
  anchor: boolean;
  originX?: number;
  travel?: number;
};
type Pickup = { x: number; y: number; kind: PickupKind; collected: boolean };

const Climb = {
  canvas: null as HTMLCanvasElement | null,
  ctx: null as CanvasRenderingContext2D | null,
  running: false,
  rafId: 0,
  lastTime: 0,
  width: 360,
  height: 640,
  dpr: 1,
  cameraY: 0,
  gravity: 1500,
  velocityX: 0,
  elapsed: 0,
  accumulator: 0,
  launchFx: 0,
  jumpGravity: 1500,
  particles: [] as { x: number; y: number; vx: number; vy: number; life: number; color: string }[],
  keys: new Set<string>(),
  baseJump: 660,
  horizontalSpeed: 390,
  dragSensitivity: 0.9,
  ball: { x: 180, y: 58, prevY: 58, vy: 0, radius: 13 },
  targetX: 180,
  platforms: [] as Platform[],
  pickups: [] as Pickup[],
  highestPlatformY: 0,
  routeIndex: 0,
  safePoint: { x: 180, y: 30 },
  landings: 0,
  runHeight: 0,
  runCoins: 0,
  springJumps: 0,
  shieldCharges: 0,
  nextMilestone: 100,
  dragging: false,
  pointerId: -1,
  lastPointerX: 0,

  wrapX(value: number) {
    return ((value % this.width) + this.width) % this.width;
  },

  wrappedDelta(from: number, to: number) {
    let delta = to - from;
    if (delta > this.width / 2) delta -= this.width;
    if (delta < -this.width / 2) delta += this.width;
    return delta;
  },

  start() {
    activeMode = 'climb';
    AudioFx.unlock();
    Store.data.climb.runs += 1;
    Store.save();
    navigate('climb');
    this.canvas = byId<HTMLCanvasElement>('climbCanvas');
    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) throw new Error('Canvas context oluşturulamadı.');
    this.bindPointer();
    this.resize();
    this.reset();
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame((time) => this.loop(time));
  },

  reset() {
    cancelAnimationFrame(this.rafId);
    this.running = false;
    this.cameraY = 0;
    this.velocityX = 0;
    this.elapsed = 0;
    this.accumulator = 0;
    this.launchFx = 0;
    this.jumpGravity = 1500;
    this.baseJump = 660;
    this.dragging = false;
    this.pointerId = -1;
    this.keys.clear();
    this.particles = [];
    this.landings = 0;
    this.runHeight = 0;
    this.runCoins = 0;
    this.springJumps = 0;
    this.shieldCharges = 0;
    this.nextMilestone = 100;
    this.routeIndex = 0;
    this.pickups = [];

    const startWidth = Math.min(150, this.width * 0.42);
    const startX = (this.width - startWidth) / 2;
    const startY = 30;
    this.ball = { x: this.width / 2, y: startY + 13, prevY: startY + 13, vy: this.baseJump, radius: 13 };
    this.targetX = this.ball.x;
    this.safePoint = { x: this.ball.x, y: startY };
    this.platforms = [{
      x: startX,
      y: startY,
      width: startWidth,
      height: 12,
      vx: 0,
      kind: 'solid',
      breakTimer: 0,
      broken: false,
      routeIndex: 0,
      anchor: true,
    }];
    this.highestPlatformY = startY;
    this.generatePlatforms(this.height + 850);
    this.updateHud();
    byId('dragHint').classList.remove('hidden');
  },

  resize() {
    if (!this.canvas || !this.ctx) return;
    const oldWidth = this.width;
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    if (oldWidth > 0 && Math.abs(oldWidth - this.width) > 1 && this.platforms.length > 0) {
      const ratio = this.width / oldWidth;
      this.ball.x = this.wrapX(this.ball.x * ratio);
      this.targetX = this.wrapX(this.targetX * ratio);
      this.safePoint.x = this.wrapX(this.safePoint.x * ratio);
      this.platforms.forEach((platform) => {
        platform.width *= ratio;
        platform.x = Math.max(8, Math.min(this.width - platform.width - 8, platform.x * ratio));
        if (platform.originX !== undefined) platform.originX = platform.x;
        if (platform.travel !== undefined) platform.travel *= ratio;
      });
      this.pickups.forEach((pickup) => { pickup.x = this.wrapX(pickup.x * ratio); });
    }
  },

  bindPointer() {
    const canvas = this.canvas;
    if (!canvas || canvas.dataset.dragBound === '1') return;
    canvas.dataset.dragBound = '1';

    canvas.addEventListener('pointerdown', (event) => {
      if (!this.running || this.dragging || !event.isPrimary) return;
      event.preventDefault();
      AudioFx.unlock();
      this.dragging = true;
      this.pointerId = event.pointerId;
      this.lastPointerX = event.clientX;
      canvas.setPointerCapture(event.pointerId);
      byId('dragHint').classList.add('hidden');
    });

    canvas.addEventListener('pointermove', (event) => {
      if (!this.running || !this.dragging || event.pointerId !== this.pointerId) return;
      const dx = event.clientX - this.lastPointerX;
      this.lastPointerX = event.clientX;
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const scale = this.width / Math.max(1, rect.width);
      this.targetX = this.wrapX(this.targetX + dx * scale * this.dragSensitivity);
    });

    const release = (event: PointerEvent) => {
      if (event.pointerId !== this.pointerId) return;
      this.dragging = false;
      this.pointerId = -1;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('lostpointercapture', release);
    window.addEventListener('keydown', (event) => {
      if (!this.running || !['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(event.key)) return;
      event.preventDefault();
      this.keys.add(event.key);
      byId('dragHint').classList.add('hidden');
      AudioFx.unlock();
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.key));
    window.addEventListener('blur', () => { this.keys.clear(); this.dragging = false; this.pointerId = -1; });
    document.addEventListener('visibilitychange', () => { this.lastTime = performance.now(); this.accumulator = 0; this.keys.clear(); });
  },

  generatePlatforms(targetY: number) {
    let y = this.highestPlatformY;
    const previous = this.platforms.filter(p => p.anchor).sort((a, b) => b.y - a.y)[0];
    let lastCenter = previous ? previous.x + previous.width / 2 : this.width / 2;
    while (y < targetY) {
      this.routeIndex++;
      const step = routeStep(y, lastCenter, this.width);
      y = step.y;
      // Every row has a permanent, reachable landing. Risk platforms are optional detours.
      const pad = this.routeIndex > 12 && this.routeIndex % 13 === 0;
      this.platforms.push({ x: step.center - step.width / 2, y, width: step.width,
        height: 13, vx: 0, kind: pad ? 'spring' : 'solid', breakTimer: 0,
        broken: false, routeIndex: this.routeIndex, anchor: true });
      const roll = Math.random();
      if (roll < 0.27) this.pickups.push({ x: step.center, y: y + 32, kind: 'coin', collected: false });
      else if (this.routeIndex > 5 && roll < 0.32) this.pickups.push({ x: step.center, y: y + 34, kind: 'spring', collected: false });
      else if (this.routeIndex > 9 && roll < 0.35) this.pickups.push({ x: step.center, y: y + 34, kind: 'shield', collected: false });
      if (this.routeIndex > 5 && Math.random() < 0.24 + step.difficulty * 0.48) {
        const w = 56 + Math.random() * 16;
        const side = step.center < this.width / 2 ? 1 : -1;
        const x = step.center + side * (step.width / 2 + w / 2 + 18) - w / 2;
        if (x >= 10 && x + w <= this.width - 10) {
          const kind: PlatformKind = step.difficulty > 0.3 && Math.random() < 0.22 ? 'boost'
            : step.difficulty > 0.15 && Math.random() < 0.55 ? 'moving' : 'fragile';
          this.platforms.push({ x, y: y + 24, width: w, height: 12,
            vx: kind === 'moving' ? (Math.random() < 0.5 ? -1 : 1) : 0,
            originX: x, travel: 12, kind, breakTimer: 0, broken: false,
            routeIndex: this.routeIndex, anchor: false });
          this.pickups.push({ x: x + w / 2, y: y + 56, kind: 'coin', collected: false });
        }
      }
      lastCenter = step.center;
    }
    this.highestPlatformY = y;
  },

  loop(time: number) {
    if (!this.running) return;
    this.accumulator += Math.min(0.1, Math.max(0, (time - this.lastTime) / 1000));
    this.lastTime = time;
    while (this.accumulator >= 1 / 120 && this.running) {
      this.update(1 / 120);
      this.accumulator -= 1 / 120;
    }
    this.draw();
    if (this.running) this.rafId = requestAnimationFrame((next) => this.loop(next));
  },

  burst(x: number, y: number, color: string, count = 16) {
    for (let i = 0; i < count; i++) {
      const angle = Math.PI * 2 * i / count;
      this.particles.push({ x, y, vx: Math.cos(angle) * 100, vy: Math.sin(angle) * 130,
        life: 0.45, color });
    }
  },

  launch(multiplier = 1.65) {
    const meters = Math.max(0, this.ball.y - 43) / 10;
    this.ball.vy = Math.max(this.ball.vy, launchVelocity(meters, multiplier));
    this.jumpGravity = tempoAt(meters).gravity;
    this.launchFx = 0.65;
    this.burst(this.ball.x, this.ball.y - 10, '#8870f8', 22);
    AudioFx.play('spring');
    haptic([18, 20, 30]);
  },

  update(dt: number) {
    const ball = this.ball;

    this.elapsed += dt;
    this.launchFx = Math.max(0, this.launchFx - dt);
    const tempo = tempoAt(Math.max(0, ball.y - 43) / 10);
    this.baseJump = tempo.jump;
    this.gravity = tempo.gravity;
    this.horizontalSpeed = tempo.horizontal;
    const direction = Number(this.keys.has('ArrowRight') || this.keys.has('d')) - Number(this.keys.has('ArrowLeft') || this.keys.has('a'));
    if (direction) this.targetX = this.wrapX(this.targetX + direction * this.horizontalSpeed * dt);
    const dx = this.wrappedDelta(ball.x, this.targetX);
    const movement = steer(this.velocityX, dx, dt, Math.max(0, ball.y - 43) / 10);
    this.velocityX = movement.vx;
    ball.x = this.wrapX(ball.x + movement.step);
    ball.prevY = ball.y;
    // Freeze gravity for this flight; crossing an altitude boundary cannot shorten the jump.
    ball.y += ball.vy * dt - 0.5 * this.jumpGravity * dt * dt;
    ball.vy -= this.jumpGravity * dt;
    this.particles = this.particles.filter(p => p.life > 0);
    for (const p of this.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 450 * dt; }

    for (const platform of this.platforms) {
      if (platform.vx !== 0 && !platform.broken) {
        platform.x += platform.vx * tempo.moving * dt;
        const lo = Math.max(8, (platform.originX ?? platform.x) - (platform.travel ?? 12));
        const hi = Math.min(this.width - platform.width - 8, (platform.originX ?? platform.x) + (platform.travel ?? 12));
        if (platform.x <= lo || platform.x >= hi) {
          platform.x = Math.max(lo, Math.min(hi, platform.x));
          platform.vx *= -1;
        }
      }
      if (platform.breakTimer > 0) {
        platform.breakTimer -= dt;
        if (platform.breakTimer <= 0) {
          platform.broken = true;
          this.burst(platform.x + platform.width / 2, platform.y, '#db9954', 12);
          AudioFx.play('break');
        }
      }
    }

    if (ball.vy < 0) {
      const previousBottom = ball.prevY - ball.radius;
      const nextBottom = ball.y - ball.radius;
      for (const platform of [...this.platforms].sort((a, b) => b.y - a.y)) {
        if (platform.broken) continue;
        const hitRadius = ball.radius * 0.72;
        const horizontalHit = [ball.x, ball.x - this.width, ball.x + this.width].some((centerX) =>
          centerX + hitRadius > platform.x && centerX - hitRadius < platform.x + platform.width
        );
        const crossedTop = previousBottom >= platform.y && nextBottom <= platform.y;
        if (!horizontalHit || !crossedTop) continue;

        ball.y = platform.y + ball.radius;
        const boosted = this.springJumps > 0;
        const landingTempo = tempoAt(Math.max(0, ball.y - 43) / 10);
        this.jumpGravity = landingTempo.gravity;
        ball.vy = landingTempo.jump * (boosted ? 1.18 : 1);
        if (boosted) this.springJumps -= 1;
        this.landings += 1;
        Store.data.climb.totalLandings += 1;

        if (platform.kind !== 'fragile') {
          this.safePoint = { x: this.wrapX(platform.x + platform.width / 2), y: platform.y };
        }

        if (platform.kind === 'spring' || platform.kind === 'boost') this.launch(platform.kind === 'boost' ? 1.9 : 1.5);
        else AudioFx.play('bounce');
        if ((platform.kind === 'fragile' || platform.kind === 'boost') && platform.breakTimer <= 0) {
          platform.breakTimer = 0.22;
          AudioFx.play('crack');
          if (platform.kind !== 'boost') haptic([6, 12, 4]);
        } else if (platform.kind !== 'spring' && platform.kind !== 'boost') {
          haptic(6);
        }
        break;
      }
    }

    for (const pickup of this.pickups) {
      if (pickup.collected) continue;
      const dxPickup = Math.abs(this.wrappedDelta(ball.x, pickup.x));
      const dyPickup = Math.abs(ball.y - pickup.y);
      if (dxPickup > ball.radius + 13 || dyPickup > ball.radius + 13) continue;
      pickup.collected = true;
      if (pickup.kind === 'coin') {
        this.runCoins += 1;
        Store.data.coins += 3;
        AudioFx.play('pickup');
      } else if (pickup.kind === 'spring') {
        this.springJumps = Math.max(this.springJumps, 2);
        this.launch();
      } else {
        this.shieldCharges = 1;
        AudioFx.play('shield');
        this.burst(ball.x, ball.y, '#36b9c9');
      }
      Store.save();
      if (pickup.kind !== 'spring') haptic(8);
    }

    const desiredCamera = Math.max(this.cameraY, ball.y - this.height * 0.46);
    this.cameraY += (desiredCamera - this.cameraY) * Math.min(1, dt * (tempo.camera + (this.launchFx > 0 ? 8 : 0)));
    this.runHeight = Math.max(this.runHeight, Math.floor(Math.max(0, ball.y - 43) / 10));

    if (this.runHeight >= this.nextMilestone) {
      AudioFx.play('milestone');

      this.nextMilestone += 100;
    }

    this.generatePlatforms(this.cameraY + this.height + 600 * tempo.speed);
    this.platforms = this.platforms.filter((platform) => !platform.broken && platform.y > this.cameraY - 190);
    this.pickups = this.pickups.filter((pickup) => !pickup.collected && pickup.y > this.cameraY - 140);

    if (ball.y < this.cameraY - 115) {
      if (this.shieldCharges > 0) this.rescue();
      else {
        this.fail();
        return;
      }
    }
    this.updateHud();
  },

  rescue() {
    this.shieldCharges = 0;
    const platform = this.platforms.filter(p => p.anchor && !p.broken && p.y > this.cameraY + 30)
      .sort((a, b) => a.y - b.y)[0];
    if (!platform) { this.fail(); return; }
    this.safePoint = { x: platform.x + platform.width / 2, y: platform.y };
    this.cameraY = Math.max(0, platform.y - this.height * 0.25);
    this.ball.x = this.safePoint.x;
    this.targetX = this.ball.x;
    this.velocityX = 0;
    this.ball.y = platform.y + this.ball.radius;
    this.ball.prevY = this.ball.y;
    const tempo = tempoAt(Math.max(0, this.ball.y - 43) / 10);
    this.ball.vy = tempo.jump;
    this.jumpGravity = tempo.gravity;
    AudioFx.play('shield');
    haptic([20, 25, 20]);
    toast('Kalkan seni kurtardı');
  },

  updateHud() {
    const heightEl = document.getElementById('climbHeight');
    const bestEl = document.getElementById('climbBest');
    const stepEl = document.getElementById('climbSteps');
    const springEl = document.getElementById('springHud');
    const shieldEl = document.getElementById('shieldHud');
    const coinEl = document.getElementById('runCoinHud');
    if (heightEl) heightEl.textContent = `${this.runHeight} m`;
    if (bestEl) bestEl.textContent = `${Math.max(Store.data.climb.bestHeight, this.runHeight)} m`;
    if (stepEl) stepEl.textContent = String(this.landings);
    if (springEl) {
      springEl.textContent = this.springJumps > 0 ? `Yay ×${this.springJumps}` : '';
      springEl.hidden = this.springJumps === 0;
      springEl.classList.toggle('active', this.springJumps > 0);
    }
    if (shieldEl) {
      shieldEl.textContent = 'Kalkan';
      shieldEl.hidden = this.shieldCharges === 0;
      shieldEl.classList.toggle('active', this.shieldCharges > 0);
    }
    const tempoEl = document.getElementById('tempoHud');
    if (tempoEl) tempoEl.textContent = tempoAt(this.runHeight).label;
    if (coinEl) coinEl.textContent = `Altın ${this.runCoins}`;
  },

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);

    const sky = ctx.createLinearGradient(0, 0, 0, this.height);
    const altitude = Math.min(1, this.cameraY / 4800);
    sky.addColorStop(0, altitude > 0.55 ? '#cfdcff' : '#dde6ff');
    sky.addColorStop(0.58, '#edf3ff');
    sky.addColorStop(1, '#f9faff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.globalAlpha = 0.15 + altitude * 0.06;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 7; i += 1) {
      const x = (i * 91 + this.cameraY * 0.06) % (this.width + 120) - 60;
      const y = 70 + ((i * 137) % Math.max(180, this.height - 150));
      ctx.beginPath();
      ctx.ellipse(x, y, 46, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const platform of this.platforms) {
      if (platform.broken) continue;
      const sy = this.height - (platform.y - this.cameraY);
      if (sy < -30 || sy > this.height + 30) continue;
      const breaking = platform.breakTimer > 0;
      const shake = breaking ? Math.sin(this.elapsed * 95) * 2 : 0;
      const x = platform.x + shake;
      const colors = { solid: '#526781', moving: '#21a99f', fragile: '#d7974c', spring: '#8060db', boost: '#e56578' };
      ctx.save();
      ctx.shadowColor = colors[platform.kind] + '44'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4;
      ctx.fillStyle = colors[platform.kind];
      roundRect(ctx, x, sy, platform.width, platform.height, 5); ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.fillStyle = 'rgba(255,255,255,.65)';
      roundRect(ctx, x + 4, sy + 1, platform.width - 8, 3, 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      if (platform.kind === 'moving') {
        for (let i = 0; i < 3; i++) {
          const mx = x + platform.width / 2 + (i - 1) * 14;
          const d = Math.sign(platform.vx);
          ctx.beginPath(); ctx.moveTo(mx - d * 3, sy + 5); ctx.lineTo(mx + d * 2, sy + 8); ctx.lineTo(mx - d * 3, sy + 11); ctx.stroke();
        }
      } else if (platform.kind === 'fragile') {
        ctx.strokeStyle = '#794621';
        for (const offset of [0.3, 0.67]) {
          const mx = x + platform.width * offset;
          ctx.beginPath(); ctx.moveTo(mx - 4, sy); ctx.lineTo(mx + 2, sy + 5); ctx.lineTo(mx - 2, sy + 8); ctx.lineTo(mx + 4, sy + 12); ctx.stroke();
        }
      } else if (platform.kind === 'spring' || platform.kind === 'boost') {
        const mx = x + platform.width / 2;
        this.drawIcon(platform.kind === 'boost' ? 'boost' : 'spring', mx, sy - 7, 0.7);
        ctx.fillStyle = '#fff';
        roundRect(ctx, mx - 18, sy - 2, 36, 4, 2); ctx.fill();
      } else {
        ctx.fillStyle = '#b6cadb';
        for (const mx of [x + 9, x + platform.width - 9]) { ctx.beginPath(); ctx.arc(mx, sy + 8, 1.5, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.restore();
    }

    for (const pickup of this.pickups) {
      if (pickup.collected) continue;
      const sy = this.height - (pickup.y - this.cameraY);
      if (sy < -30 || sy > this.height + 30) continue;
      const color = pickup.kind === 'coin' ? '#f1ba40' : pickup.kind === 'spring' ? '#8966ed' : '#29adc3';
      ctx.save();
      ctx.globalAlpha = 0.12 + 0.06 * Math.sin(this.elapsed * 4 + pickup.y);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(pickup.x, sy, 21 + Math.sin(this.elapsed * 4) * 2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.shadowColor = color; ctx.shadowBlur = 9;
      this.drawIcon(pickup.kind, pickup.x, sy, 1);
      ctx.restore();
    }
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / 0.45); ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, this.height - (p.y - this.cameraY), 4, 4);
    }
    ctx.globalAlpha = 1;

    const ballY = this.height - (this.ball.y - this.cameraY);
    if (this.launchFx > 0) {
      ctx.strokeStyle = '#9578f5'; ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = this.launchFx * (0.7 - i * 0.15);
        ctx.beginPath(); ctx.moveTo(this.ball.x + (i - 1) * 8, ballY + 18);
        ctx.lineTo(this.ball.x + (i - 1) * 11, ballY + 40 + i * 12); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (this.shieldCharges) {
      ctx.strokeStyle = '#29adc3'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.ball.x, ballY, 20, 0, Math.PI * 2); ctx.stroke();
    }
    const drawBall = (x: number) => {
      const glow = ctx.createRadialGradient(x - 5, ballY - 6, 2, x, ballY, this.ball.radius * 1.5);
      glow.addColorStop(0, '#ffffff');
      glow.addColorStop(0.22, '#ffd166');
      glow.addColorStop(1, '#f4a62a');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, ballY, this.ball.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(105,76,12,.25)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };
    drawBall(this.ball.x);
    if (this.ball.x < this.ball.radius) drawBall(this.ball.x + this.width);
    if (this.ball.x > this.width - this.ball.radius) drawBall(this.ball.x - this.width);
  },

  drawIcon(kind: PickupKind | 'boost', x: number, y: number, scale: number) {
    const ctx = this.ctx!;
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.lineWidth = 2.4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (kind === 'coin') {
      ctx.fillStyle = '#f9c550'; ctx.strokeStyle = '#c88b24';
      ctx.beginPath(); ctx.ellipse(0, 0, 9, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#fff1ab'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(0, 0, 5.5, 7.5, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, 4); ctx.stroke();
    } else if (kind === 'shield') {
      ctx.fillStyle = '#32b3c6'; ctx.strokeStyle = '#e3ffff';
      ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(10, -8); ctx.lineTo(8, 4);
      ctx.quadraticCurveTo(6, 10, 0, 13); ctx.quadraticCurveTo(-6, 10, -8, 4); ctx.lineTo(-10, -8); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, 6); ctx.stroke();
    } else {
      ctx.strokeStyle = kind === 'boost' ? '#ffcad4' : '#7550d7';
      ctx.beginPath(); ctx.moveTo(-9, 10); ctx.lineTo(9, 10); ctx.moveTo(-7, 6);
      ctx.lineTo(7, 2); ctx.lineTo(-7, -2); ctx.lineTo(7, -6); ctx.stroke();
      ctx.fillStyle = kind === 'boost' ? '#e56578' : '#8763e5';
      ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(9, -8); ctx.lineTo(-9, -8); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  },

  fail() {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.rafId);
    Store.data.climb.bestHeight = Math.max(Store.data.climb.bestHeight, this.runHeight);
    Store.save();
    AudioFx.play('fail');
    haptic([18, 28, 18]);
    showResult('↗', 'Tırmanış bitti', `${this.runHeight} m · ${this.landings} basamak · ${this.runCoins} bonus coin`, false);
  },

  quit() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.dragging = false;
    closeResult();
    this.keys.clear();
    Store.data.climb.bestHeight = Math.max(Store.data.climb.bestHeight, this.runHeight);
    Store.save();
    navigate('home');
  },
};

// Development-only hook for deterministic browser regression checks; removed by Vite in production.
if (import.meta.env.DEV) Object.assign(window, { __zipzip: Climb });

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

let activeMode: 'climb' | 'memory' = 'climb';

const Game = {
  level: 1,
  cards: [] as CardState[],
  flipped: [] as CardState[],
  matches: 0,
  moves: 0,
  timerId: 0,
  timeLeft: 0,
  locked: false,
  frozen: false,
  config: levelConfig(1),

  start(level = Store.data.currentLevel) {
    this.level = Math.max(1, level);
    Store.data.stats.totalGames += 1;
    Store.save();
    navigate('game');
    this.setup();
  },

  setup() {
    window.clearInterval(this.timerId);
    this.config = levelConfig(this.level);
    this.flipped = [];
    this.matches = 0;
    this.moves = 0;
    this.locked = true;
    this.frozen = false;
    this.timeLeft = this.config.time;
    updateGameHud();

    const selected = shuffle(EMOJIS).slice(0, this.config.pairs);
    const deck = shuffle([...selected, ...selected]);
    const board = byId('gameBoard');
    board.innerHTML = '';
    board.style.gridTemplateColumns = `repeat(${this.config.cols}, var(--card-size))`;
    board.style.gridTemplateRows = `repeat(${this.config.rows}, var(--card-size))`;
    this.cards = deck.map((value, id) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'memory-card';
      card.setAttribute('aria-label', 'Kapalı kart');
      card.innerHTML = `<span class="card-inner"><span class="card-face card-front"></span><span class="card-face card-back">${value}</span></span>`;
      card.addEventListener('click', () => this.flip(id));
      board.appendChild(card);
      return { id, value, element: card };
    });

    requestAnimationFrame(() => this.fitBoard());
    this.preview();
    if (this.config.time > 0) this.startTimer();
  },

  fitBoard() {
    const board = byId('gameBoard');
    const stage = byId('gameStage');
    const gap = window.innerWidth < 420 ? 6 : 9;
    const maxWidth = Math.max(220, stage.clientWidth - 4);
    const maxHeight = Math.max(250, stage.clientHeight - 8);
    const byWidth = (maxWidth - gap * (this.config.cols - 1)) / this.config.cols;
    const byHeight = (maxHeight - gap * (this.config.rows - 1)) / this.config.rows;
    const size = Math.max(42, Math.min(92, byWidth, byHeight));
    board.style.setProperty('--card-size', `${Math.floor(size)}px`);
  },

  preview() {
    this.cards.forEach(({ element }) => element.classList.add('flipped'));
    window.setTimeout(() => {
      this.cards.forEach(({ element }) => element.classList.remove('flipped'));
      this.locked = false;
    }, 1100);
  },

  flip(id: number) {
    const card = this.cards[id];
    if (!card || this.locked || card.element.classList.contains('flipped') || card.element.classList.contains('matched')) return;
    AudioFx.play('flip');
    haptic(8);
    card.element.classList.add('flipped');
    card.element.setAttribute('aria-label', `Kart: ${card.value}`);
    this.flipped.push(card);
    if (this.flipped.length === 2) {
      this.moves += 1;
      updateGameHud();
      this.checkPair();
    }
  },

  checkPair() {
    this.locked = true;
    const [first, second] = this.flipped;
    if (!first || !second) { this.locked = false; return; }
    if (first.value === second.value) {
      window.setTimeout(() => {
        first.element.classList.add('matched');
        second.element.classList.add('matched');
        this.matches += 1;
        Store.data.coins += 2;
        Store.data.stats.totalMatches += 1;
        Store.save();
        this.flipped = [];
        this.locked = false;
        AudioFx.play('match');
        haptic([15, 25, 15]);
        if (this.matches === this.config.pairs) this.win();
      }, 300);
    } else {
      window.setTimeout(() => {
        first.element.classList.remove('flipped');
        second.element.classList.remove('flipped');
        first.element.setAttribute('aria-label', 'Kapalı kart');
        second.element.setAttribute('aria-label', 'Kapalı kart');
        this.flipped = [];
        this.locked = false;
      }, 680);
    }
  },

  startTimer() {
    updateGameHud();
    this.timerId = window.setInterval(() => {
      if (this.frozen) return;
      this.timeLeft -= 1;
      updateGameHud();
      if (this.timeLeft <= 0) this.lose();
    }, 1000);
  },

  win() {
    window.clearInterval(this.timerId);
    const bonus = 20 + this.level * 5;
    Store.data.coins += bonus;
    Store.data.stats.wins += 1;
    Store.data.stats.bestMoves = Store.data.stats.bestMoves === null ? this.moves : Math.min(Store.data.stats.bestMoves, this.moves);
    Store.data.maxLevelReached = Math.max(Store.data.maxLevelReached, this.level + 1);
    Store.data.currentLevel = Math.max(Store.data.currentLevel, this.level + 1);
    unlockAchievements();
    Store.save();
    AudioFx.play('win');
    showResult('🎉', 'Seviye tamamlandı', `${this.moves} hamle · +${bonus} bonus altın`, true);
  },

  lose() {
    window.clearInterval(this.timerId);
    showResult('⏱️', 'Süre doldu', 'Tahtayı tekrar dene; ilerlemen korunuyor.', false);
  },

  quit() {
    window.clearInterval(this.timerId);
    closeResult();
    navigate('home');
  },

  usePower(type: PowerUp) {
    if (Store.data.inventory[type] <= 0 || this.locked) return;
    Store.data.inventory[type] -= 1;
    Store.save();
    updatePowerButtons();

    const remaining = this.cards.filter((card) => !card.element.classList.contains('matched'));
    if (type === 'joker') {
      this.locked = true;
      remaining.forEach(({ element }) => element.classList.add('flipped'));
      window.setTimeout(() => {
        remaining.forEach(({ element }) => {
          if (!this.flipped.some((card) => card.element === element)) element.classList.remove('flipped');
        });
        this.locked = false;
      }, 900);
    }
    if (type === 'freeze') {
      this.frozen = true;
      toast('Zaman 10 saniye durdu.');
      window.setTimeout(() => { this.frozen = false; }, 10000);
    }
    if (type === 'hint') {
      const first = remaining[0];
      const match = first ? remaining.find((card) => card.id !== first.id && card.value === first.value) : undefined;
      if (first && match) {
        first.element.classList.add('flipped');
        match.element.classList.add('flipped');
        window.setTimeout(() => {
          if (!this.flipped.includes(first)) first.element.classList.remove('flipped');
          if (!this.flipped.includes(match)) match.element.classList.remove('flipped');
        }, 850);
      }
    }
  },
};

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root bulunamadı.');

app.innerHTML = `
  <main class="app-shell">
    <header class="topbar" id="mainTopbar">
      <div class="brand"><span class="brand-mark">Z</span> Zipzip</div>
      <div class="top-actions">
        <span class="pill">🪙 <b id="coinValue">0</b></span>
        <span class="pill level-pill">Seviye <b id="levelValue">1</b></span>
        <button class="icon-btn" type="button" data-nav="settings" aria-label="Ayarlar">⚙</button>
      </div>
    </header>

    <section class="screen active" data-screen="home">
      <div class="hero">
        <p class="eyebrow">Zipzip</p>
        <h1>Zıpla.<br>Yukarı çık.</h1>
        <p>Top kendi kendine zıplar. Oyun alanında parmağını sağa sola sürükleyerek topu basamaklara indir ve olabildiğince yüksel.</p>
        <div class="resume-card">
          <div>
            <div class="resume-kicker">Ana oyun</div>
            <div class="resume-title">Tırmanış</div>
            <div class="resume-meta">En iyi: <span id="climbHomeBest">0 m</span> · Tuş yok, sürükle ve yönlendir</div>
          </div>
          <button class="primary-btn" id="resumeButton" type="button">Tırman</button>
        </div>
      </div>

      <div class="dashboard-grid">
        <article class="dashboard-card"><div class="dashboard-label">Zafer</div><div class="dashboard-value" id="homeWins">0</div><div class="dashboard-note">tamamlanan oyun</div></article>
        <article class="dashboard-card"><div class="dashboard-label">Eşleşme</div><div class="dashboard-value" id="homeMatches">0</div><div class="dashboard-note">toplam çift</div></article>
        <article class="dashboard-card"><div class="dashboard-label">En iyi</div><div class="dashboard-value" id="homeBest">—</div><div class="dashboard-note">en az hamle</div></article>
      </div>

      <div class="section-head"><h2>Oyunlar</h2><span>Tırmanış ana mod</span></div>
      <div class="mode-grid">
        <button class="mode-card featured-mode" id="climbMode" type="button"><div class="mode-icon">●</div><div class="mode-title">Tırmanış</div><div class="mode-desc">Sürükleyerek yönlendir. Ulaşılabilir rotada kırılgan basamakları aş, Yay ve Kalkan bonuslarını topla.</div></button>
        <button class="mode-card" id="memoryMode" type="button"><div class="mode-icon">🧠</div><div class="mode-title">Hafıza</div><div class="mode-desc">Mevcut eşleştirme oyunu artık Zipzip içindeki yan oyun olarak devam ediyor.</div></button>
      </div>
      <div class="quick-links">
        <button class="quick-link" data-nav="stats" type="button"><span>📊</span><b>İstatistikler</b><small>Performansını gör</small></button>
        <button class="quick-link" data-nav="achievements" type="button"><span>🏆</span><b>Başarımlar</b><small>Açtığın rozetler</small></button>
      </div>
    </section>

    <section class="screen climb-screen" data-screen="climb">
      <div class="climb-top">
        <button class="icon-btn" id="quitClimb" type="button" aria-label="Tırmanıştan çık">←</button>
        <div class="climb-stats">
          <div class="game-stat"><span>Yükseklik</span><strong id="climbHeight">0 m</strong></div>
          <div class="game-stat"><span>Rekor</span><strong id="climbBest">0 m</strong></div>
          <div class="game-stat"><span>Basamak</span><strong id="climbSteps">0</strong></div>
        </div>
      </div>
      <div class="climb-stage" id="climbStage">
        <canvas id="climbCanvas" aria-label="Zipzip tırmanış oyun alanı"></canvas>
        <div class="climb-bonus-hud" aria-label="Koşu bonusları">
          <span id="springHud">↑ —</span>
          <span id="shieldHud">◆ —</span>
          <span id="runCoinHud">● 0</span>
        </div>
        <div class="tempo-hud" id="tempoHud">Isınma</div><div class="drag-hint" id="dragHint">Sürükle ve yönlendir</div>
      </div>
    </section>

    <section class="screen game-screen" data-screen="game">
      <div class="game-top">
        <button class="icon-btn" id="quitGame" type="button" aria-label="Oyundan çık">←</button>
        <div class="game-stats">
          <div class="game-stat"><span>Seviye</span><strong id="gameLevel">1</strong></div>
          <div class="game-stat"><span>Hamle</span><strong id="gameMoves">0</strong></div>
          <div class="game-stat"><span>Süre</span><strong id="gameTime">∞</strong></div>
          <div class="game-stat"><span>Altın</span><strong id="gameCoins">0</strong></div>
        </div>
      </div>
      <div class="game-stage" id="gameStage"><div class="game-board" id="gameBoard"></div></div>
      <div class="powerbar">
        <button class="power-btn" type="button" data-power="joker">👁️ Gözcü <span class="power-count" id="power-joker">0</span></button>
        <button class="power-btn" type="button" data-power="freeze">❄️ Dondur <span class="power-count" id="power-freeze">0</span></button>
        <button class="power-btn" type="button" data-power="hint">💡 İpucu <span class="power-count" id="power-hint">0</span></button>
      </div>
    </section>

    <section class="screen" data-screen="shop"><div class="panel-head"><button class="icon-btn" data-nav="home" type="button">←</button><h1>Güçlendirmeler</h1></div><div class="card-list" id="shopList"></div></section>
    <section class="screen" data-screen="stats"><div class="panel-head"><button class="icon-btn" data-nav="home" type="button">←</button><h1>İstatistikler</h1></div><div class="card-list" id="statsList"></div></section>
    <section class="screen" data-screen="achievements"><div class="panel-head"><button class="icon-btn" data-nav="home" type="button">←</button><h1>Başarımlar</h1></div><div class="card-list" id="achievementList"></div></section>
    <section class="screen" data-screen="settings"><div class="panel-head"><button class="icon-btn" data-nav="home" type="button">←</button><h1>Ayarlar</h1></div><div id="settingsList"></div></section>
  </main>

  <div class="overlay" id="resultOverlay" role="dialog" aria-modal="true" aria-labelledby="resultTitle">
    <div class="result-sheet"><div class="result-icon" id="resultIcon">🎉</div><h2 id="resultTitle"></h2><p id="resultMessage"></p><div class="result-actions"><button class="secondary-btn" id="resultHome" type="button">Menü</button><button class="secondary-btn" id="resultRetry" type="button">Tekrar</button><button class="primary-btn" id="resultNext" type="button">Sonraki seviye</button></div></div>
  </div>
  <div class="toast" id="toast"></div>
`;

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`#${id} bulunamadı.`);
  return element as T;
}

function navigate(screen: Screen) {
  document.querySelectorAll<HTMLElement>('[data-screen]').forEach((element) => element.classList.toggle('active', element.dataset.screen === screen));
  byId('mainTopbar').style.display = screen === 'game' || screen === 'climb' ? 'none' : '';
  closeResult();
  if (screen === 'home') renderHome();
  if (screen === 'shop') renderShop();
  if (screen === 'stats') renderStats();
  if (screen === 'achievements') renderAchievements();
  if (screen === 'settings') renderSettings();
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function renderGlobalStats() {
  const data = Store.data;
  byId('coinValue').textContent = String(data.coins);
  byId('levelValue').textContent = String(data.currentLevel);
  byId('gameCoins').textContent = String(data.coins);
  updatePowerButtons();
}

function renderHome() {
  const data = Store.data;
  byId('climbHomeBest').textContent = `${data.climb.bestHeight} m`;
  byId('homeWins').textContent = String(data.stats.wins);
  byId('homeMatches').textContent = String(data.stats.totalMatches);
  byId('homeBest').textContent = data.stats.bestMoves === null ? '—' : String(data.stats.bestMoves);
}

function updateGameHud() {
  byId('gameLevel').textContent = String(Game.level);
  byId('gameMoves').textContent = String(Game.moves);
  byId('gameCoins').textContent = String(Store.data.coins);
  byId('gameTime').textContent = Game.config.time === 0 ? '∞' : `${Math.floor(Game.timeLeft / 60)}:${String(Game.timeLeft % 60).padStart(2, '0')}`;
}

function updatePowerButtons() {
  (['joker','freeze','hint'] as PowerUp[]).forEach((type) => {
    const count = Store.data.inventory[type];
    const counter = document.getElementById(`power-${type}`);
    if (counter) counter.textContent = String(count);
    const button = document.querySelector<HTMLButtonElement>(`[data-power="${type}"]`);
    if (button) button.disabled = count <= 0;
  });
}

function renderShop() {
  byId('shopList').innerHTML = SHOP.map((item) => `
    <article class="list-card"><div class="list-icon">${item.icon}</div><div><div class="list-title">${item.name}</div><div class="list-desc">${item.desc}</div></div><button class="secondary-btn" type="button" data-buy="${item.id}"><span class="list-price">${item.price} 🪙</span></button></article>
  `).join('');
}

function renderStats() {
  const stats = Store.data.stats;
  const entries = [
    ['↗','Tırmanış rekoru', `${Store.data.climb.bestHeight} m`],
    ['●','Tırmanış koşusu', Store.data.climb.runs],
    ['▰','Toplam basamak', Store.data.climb.totalLandings],
    ['🎮','Başlatılan hafıza oyunu', stats.totalGames],
    ['🏁','Tamamlanan oyun', stats.wins],
    ['🧩','Toplam eşleşme', stats.totalMatches],
    ['📈','Ulaşılan seviye', Store.data.maxLevelReached],
    ['🎯','En iyi hamle', stats.bestMoves ?? '—'],
  ];
  byId('statsList').innerHTML = entries.map(([icon, title, value]) => `<article class="list-card"><div class="list-icon">${icon}</div><div class="list-title">${title}</div><div class="list-price">${value}</div></article>`).join('');
}

function renderAchievements() {
  unlockAchievements(false);
  byId('achievementList').innerHTML = ACHIEVEMENTS.map((achievement) => {
    const unlocked = Store.data.achievements.includes(achievement.id);
    return `<article class="list-card ${unlocked ? '' : 'locked'}"><div class="list-icon">${achievement.icon}</div><div><div class="list-title">${achievement.title}</div><div class="list-desc">${achievement.desc}</div></div><div>${unlocked ? 'Açıldı' : 'Kilitli'}</div></article>`;
  }).join('');
}

function renderSettings() {
  byId('settingsList').innerHTML = `
    <div class="settings-row"><div><strong>Ses efektleri</strong><small>Daha kısa ve parlak zıplama, bonus, çatlama ve sonuç sesleri</small></div><button class="switch ${Store.data.settings.sfx ? 'on' : ''}" data-setting="sfx" type="button" aria-label="Ses efektleri"></button></div>
    <div class="settings-row"><div><strong>Dokunsal geri bildirim</strong><small>Desteklenen telefonlarda hafif titreşim</small></div><button class="switch ${Store.data.settings.haptics ? 'on' : ''}" data-setting="haptics" type="button" aria-label="Dokunsal geri bildirim"></button></div>
    <div class="settings-row"><div><strong>Yerel ilerleme</strong><small>Bu sürüm eski Zipzip kaydını aynı anahtardan kullanır.</small></div><button class="danger-btn" id="resetProgress" type="button">Sıfırla</button></div>
  `;
}

function unlockAchievements(showToast = true) {
  let changed = false;
  ACHIEVEMENTS.forEach((achievement) => {
    if (!Store.data.achievements.includes(achievement.id) && achievement.unlocked(Store.data)) {
      Store.data.achievements.push(achievement.id);
      changed = true;
      if (showToast) toast(`${achievement.icon} Başarım: ${achievement.title}`);
    }
  });
  if (changed) Store.save();
}

function buyPower(type: PowerUp) {
  const item = SHOP.find((entry) => entry.id === type);
  if (!item) return;
  if (Store.data.coins < item.price) { toast('Bu güçlendirme için yeterli altının yok.'); return; }
  Store.data.coins -= item.price;
  Store.data.inventory[type] += 1;
  Store.save();
  renderShop();
  toast(`${item.name} envantere eklendi.`);
}

let toastTimer = 0;
function toast(message: string) {
  const element = byId('toast');
  element.textContent = message;
  element.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => element.classList.remove('show'), 2200);
}

function showResult(icon: string, title: string, message: string, canContinue: boolean) {
  byId('resultIcon').textContent = icon;
  byId('resultTitle').textContent = title;
  byId('resultMessage').textContent = message;
  byId<HTMLButtonElement>('resultNext').style.display = canContinue ? '' : 'none';
  byId('resultOverlay').classList.add('show');
}

function closeResult() { document.getElementById('resultOverlay')?.classList.remove('show'); }

app.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const nav = target.closest<HTMLElement>('[data-nav]')?.dataset.nav as Screen | undefined;
  if (nav) navigate(nav);

  const power = target.closest<HTMLElement>('[data-power]')?.dataset.power as PowerUp | undefined;
  if (power) Game.usePower(power);

  const buy = target.closest<HTMLElement>('[data-buy]')?.dataset.buy as PowerUp | undefined;
  if (buy) buyPower(buy);

  const settingButton = target.closest<HTMLElement>('[data-setting]');
  const setting = settingButton?.dataset.setting as 'sfx' | 'haptics' | undefined;
  if (setting) {
    Store.data.settings[setting] = !Store.data.settings[setting];
    Store.save();
    renderSettings();
  }

  if (target.closest('#resetProgress')) {
    if (window.confirm('Tüm Zipzip ilerlemesi bu cihazdan silinsin mi?')) Store.reset();
  }
});

byId('resumeButton').addEventListener('click', () => Climb.start());
byId('climbMode').addEventListener('click', () => Climb.start());
byId('memoryMode').addEventListener('click', () => { activeMode = 'memory'; Game.start(); });
byId('quitClimb').addEventListener('click', () => Climb.quit());
byId('quitGame').addEventListener('click', () => Game.quit());
byId('resultHome').addEventListener('click', () => activeMode === 'climb' ? Climb.quit() : Game.quit());
byId('resultRetry').addEventListener('click', () => { closeResult(); if (activeMode === 'climb') Climb.start(); else Game.setup(); });
byId('resultNext').addEventListener('click', () => { closeResult(); if (activeMode === 'memory') { Game.level += 1; Game.setup(); } });
window.addEventListener('resize', () => { if (document.querySelector('[data-screen="game"]')?.classList.contains('active')) Game.fitBoard(); if (document.querySelector('[data-screen="climb"]')?.classList.contains('active')) Climb.resize(); });

Store.load();
unlockAchievements(false);
renderHome();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined));
}
