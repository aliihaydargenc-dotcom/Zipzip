import './styles.css';
import { TowerWorld, MAX_SPEED } from './tower-engine';
import { drawTower } from './tower-render';

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
  tower: { bestFloor: number; bestScore: number; bestCombo: number; runs: number };
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
  tower: { bestFloor: 0, bestScore: 0, bestCombo: 0, runs: 0 },
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
    tower: { ...DEFAULT_DATA.tower, ...(source.tower ?? {}) },
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


const Climb = {
  canvas: null as HTMLCanvasElement | null,
  ctx: null as CanvasRenderingContext2D | null,
  world: new TowerWorld(),
  running: false,
  paused: false,
  settled: false,
  rafId: 0,
  lastTime: 0,
  accumulator: 0,
  keys: new Set<string>(),
  touches: new Map<number, string>(),
  bound: false,
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,

  start() {
    cancelAnimationFrame(this.rafId);
    activeMode = 'climb';
    AudioFx.unlock(); closeResult(); navigate('climb');
    this.canvas = byId<HTMLCanvasElement>('climbCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.world = new TowerWorld();
    this.running = true; this.paused = false; this.settled = false;
    this.accumulator = 0; this.clearInput(); this.resize(); this.bindPointer();
    Store.data.tower.runs++; Store.save();
    byId('dragHint').classList.remove('hidden');
    byId('towerPause').hidden = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(t => this.loop(t));
  },
  resize() {
    if (!this.canvas || !this.ctx) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    // Physics uses the same 360-unit tower on every phone and desktop.
    this.world.viewHeight = Math.max(150, rect.height / Math.max(1, rect.width) * 360);
    const scale = this.canvas.width / 360;
    this.ctx.setTransform(scale, 0, 0, scale, 0, 0);
    this.world.generate(this.world.camera + this.world.viewHeight + 420);
    this.draw();
  },
  clearInput() {
    this.keys.clear(); this.touches.clear();
    document.querySelectorAll('[data-tower-control]').forEach(el => el.classList.remove('pressed'));
  },
  interact() {
    byId('dragHint').classList.add('hidden'); AudioFx.unlock();
  },
  bindPointer() {
    if (this.bound) return;
    this.bound = true;
    document.querySelectorAll<HTMLButtonElement>('[data-tower-control]').forEach(button => {
      button.addEventListener('pointerdown', event => {
        if (!this.running || this.paused) return;
        event.preventDefault(); this.interact();
        this.touches.set(event.pointerId, button.dataset.towerControl!);
        button.setPointerCapture(event.pointerId); button.classList.add('pressed');
      });
      const release = (event: PointerEvent) => {
        this.touches.delete(event.pointerId);
        if (![...this.touches.values()].includes(button.dataset.towerControl!)) button.classList.remove('pressed');
      };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
      button.addEventListener('contextmenu', event => event.preventDefault());
    });
    window.addEventListener('keydown', event => {
      if (!this.running) return;
      const key = event.key.toLowerCase();
      if (key === 'escape' || key === 'p') { event.preventDefault(); if (!event.repeat) this.pause(); return; }
      if (!['arrowleft','arrowright','a','d',' ','arrowup','w'].includes(key)) return;
      event.preventDefault();
      if (this.paused) return;
      this.interact(); this.keys.add(key);
    });
    window.addEventListener('keyup', event => this.keys.delete(event.key.toLowerCase()));
    window.addEventListener('blur', () => { if (this.running && !this.paused) this.pause(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.running && !this.paused) this.pause();
    });
    byId('pauseClimb').addEventListener('click', () => this.pause());
    byId('resumeTower').addEventListener('click', () => this.pause());
  },
  pause() {
    if (!this.running) return;
    this.paused = !this.paused; this.clearInput(); this.accumulator = 0;
    this.lastTime = performance.now();
    byId('towerPause').hidden = !this.paused;
    byId('pauseClimb').setAttribute('aria-label', this.paused ? 'Devam et' : 'Duraklat');
    if (!this.paused) AudioFx.unlock();
  },
  input() {
    const touch = [...this.touches.values()];
    const left = this.keys.has('arrowleft') || this.keys.has('a') || touch.includes('left');
    const right = this.keys.has('arrowright') || this.keys.has('d') || touch.includes('right');
    return { direction: Number(right) - Number(left), jump: touch.includes('jump') || [' ','arrowup','w'].some(k => this.keys.has(k)) };
  },
  loop(time: number) {
    if (!this.running) return;
    const dt = Math.min(.1, Math.max(0, (time - this.lastTime) / 1000));
    this.lastTime = time;
    if (!this.paused) {
      this.accumulator += dt;
      while (this.accumulator >= 1 / 120 && this.running) {
        this.world.update(1 / 120, this.input());
        this.feedback(); this.accumulator -= 1 / 120;
        if (!this.world.alive) this.fail();
      }
    }
    this.draw(); this.updateHud();
    if (this.running) this.rafId = requestAnimationFrame(t => this.loop(t));
  },
  feedback() {
    const events = this.world.events;
    if (events.includes('superjump')) { AudioFx.play('spring'); haptic(15); }
    else if (events.includes('jump')) AudioFx.play('bounce');
    if (events.includes('combo')) { AudioFx.play('match'); haptic([8, 15, 8]); }
    else if (events.includes('land')) haptic(4);
    if (events.includes('bank')) AudioFx.play('milestone');
    if (events.includes('wall')) AudioFx.play('flip');
  },
  updateHud() {
    const w = this.world;
    byId('climbHeight').textContent = String(w.highestFloor);
    byId('climbBest').textContent = String(w.score);
    byId('climbSteps').textContent = String(Math.max(w.highestFloor, Store.data.tower.bestFloor));
    byId('comboCount').textContent = w.combo ? `×${w.combo} KOMBO` : w.bankFlash > 0 ? `+${w.lastBank}` : 'KATLARI ATLA';
    byId('comboHud').classList.toggle('active', w.combo > 0 || w.bankFlash > 0);
    byId('comboFill').style.transform = `scaleX(${Math.max(0, w.comboTime / 3)})`;
    const speed = Math.abs(w.player.vx) / MAX_SPEED;
    byId('speedFill').style.transform = `scaleX(${speed})`;
    byId('speedLabel').textContent = speed > .7 ? 'SÜPER SIÇRAMA' : 'HIZ KAZAN';
    byId('tempoHud').textContent = !w.started ? 'HAZIR' : w.elapsed < 6 ? 'ISINMA' : `${Math.round(w.scrollSpeed)} · TEMPO`;
  },
  draw() { if (this.ctx) drawTower(this.ctx, this.world, this.reducedMotion); },
  settle() {
    if (this.settled) return;
    this.settled = true;
    const d = Store.data.tower, w = this.world;
    w.bankCombo();
    d.bestFloor = Math.max(d.bestFloor, w.highestFloor);
    d.bestScore = Math.max(d.bestScore, w.score);
    d.bestCombo = Math.max(d.bestCombo, w.bestCombo);
    Store.data.coins += Math.floor(w.highestFloor / 5);
    Store.save();
  },
  fail() {
    if (!this.running) return;
    this.running = false; cancelAnimationFrame(this.rafId); this.clearInput(); this.settle();
    AudioFx.play('fail'); haptic([15, 25, 20]);
    showResult('↗', `${this.world.highestFloor}. kata ulaştın`, `${this.world.score} puan · En iyi kombo ×${this.world.bestCombo}`, false);
  },
  quit() {
    this.running = false; cancelAnimationFrame(this.rafId); this.clearInput(); this.settle(); closeResult(); navigate('home');
  },
};

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
        <h1>Hızını al.<br>Kuleyi fethet.</h1>
        <p>Koş, hız kazan ve katları tek sıçramada aş. Kombonu sürdür; yükselen kameranın altında kalma.</p>
        <div class="resume-card">
          <div>
            <div class="resume-kicker">Ana oyun</div>
            <div class="resume-title">Buz Kulesi</div>
            <div class="resume-meta">En iyi: <span id="climbHomeBest">0. kat</span> · Hızını sıçramaya dönüştür</div>
          </div>
          <button class="primary-btn" id="resumeButton" type="button">Kuleye gir</button>
        </div>
      </div>

      <div class="dashboard-grid">
        <article class="dashboard-card"><div class="dashboard-label">Rekor puan</div><div class="dashboard-value" id="homeWins">0</div><div class="dashboard-note">kule rekorun</div></article>
        <article class="dashboard-card"><div class="dashboard-label">Kombo</div><div class="dashboard-value" id="homeMatches">0</div><div class="dashboard-note">en uzun seri</div></article>
        <article class="dashboard-card"><div class="dashboard-label">Koşu</div><div class="dashboard-value" id="homeBest">—</div><div class="dashboard-note">kule denemesi</div></article>
      </div>

      <div class="section-head"><h2>Oyunlar</h2><span>Buz Kulesi ana mod</span></div>
      <div class="mode-grid">
        <button class="mode-card featured-mode" id="climbMode" type="button"><div class="mode-icon">↟</div><div class="mode-title">Buz Kulesi</div><div class="mode-desc">Momentum, duvardan sekme ve kombo. Mobilde yön tuşları + zıpla; bilgisayarda oklar + boşluk.</div></button>
        <button class="mode-card" id="memoryMode" type="button"><div class="mode-icon">🧠</div><div class="mode-title">Hafıza</div><div class="mode-desc">Mevcut eşleştirme oyunu artık Zipzip içindeki yan oyun olarak devam ediyor.</div></button>
      </div>
      <div class="quick-links">
        <button class="quick-link" data-nav="stats" type="button"><span>📊</span><b>İstatistikler</b><small>Performansını gör</small></button>
        <button class="quick-link" data-nav="achievements" type="button"><span>🏆</span><b>Başarımlar</b><small>Açtığın rozetler</small></button>
      </div>
    </section>

    <section class="screen climb-screen" data-screen="climb">
      <div class="climb-top">
        <button class="icon-btn" id="quitClimb" type="button" aria-label="Kuleden çık">←</button>
        <div class="climb-stats">
          <div class="game-stat"><span>Kat</span><strong id="climbHeight">0</strong></div>
          <div class="game-stat"><span>Puan</span><strong id="climbBest">0</strong></div>
          <div class="game-stat"><span>Rekor kat</span><strong id="climbSteps">0</strong></div>
        </div>
      </div>
      <div class="climb-stage" id="climbStage">
        <canvas id="climbCanvas" aria-label="Zipzip tırmanış oyun alanı"></canvas>
        <div class="tower-combo" id="comboHud"><strong id="comboCount">KATLARI ATLA</strong><div class="combo-track"><i id="comboFill"></i></div></div>
        <div class="tempo-hud" id="tempoHud">HAZIR</div>
        <div class="drag-hint" id="dragHint">Koş → hız kazan → zıpla</div>
        <div class="tower-pause" id="towerPause" hidden><strong>Mola</strong><button class="primary-btn" id="resumeTower" type="button">Devam et</button></div>
      </div>
      <div class="tower-speed"><span id="speedLabel">HIZ KAZAN</span><div><i id="speedFill"></i></div><button id="pauseClimb" type="button" aria-label="Duraklat">Ⅱ</button></div>
      <div class="tower-controls" aria-label="Oyun kontrolleri">
        <div class="tower-directions"><button type="button" data-tower-control="left" aria-label="Sola koş">←</button><button type="button" data-tower-control="right" aria-label="Sağa koş">→</button></div>
        <button type="button" data-tower-control="jump" class="tower-jump" aria-label="Zıpla">ZIPLA <span>↟</span></button>
      </div>
      <div class="tower-keyboard">← → / A D · Boşluk: zıpla · P: mola</div>
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
  byId('climbHomeBest').textContent = `${data.tower.bestFloor}. kat`;
  byId('homeWins').textContent = String(data.tower.bestScore);
  byId('homeMatches').textContent = `×${data.tower.bestCombo}`;
  byId('homeBest').textContent = String(data.tower.runs);
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
    ['↟','Kule rekoru', `${Store.data.tower.bestFloor}. kat`],
    ['★','Kule puanı', Store.data.tower.bestScore],
    ['×','En iyi kombo', Store.data.tower.bestCombo],
    ['↗','Eski tırmanış rekoru', `${Store.data.climb.bestHeight} m`],
    ['●','Kule koşusu', Store.data.tower.runs],
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
