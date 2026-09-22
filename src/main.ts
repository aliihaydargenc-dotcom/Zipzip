import './styles.css';

type Screen = 'home' | 'game' | 'shop' | 'stats' | 'achievements' | 'settings';
type PowerUp = 'joker' | 'freeze' | 'hint';

type PlayerData = {
  coins: number;
  currentLevel: number;
  maxLevelReached: number;
  inventory: Record<PowerUp, number>;
  stats: { totalGames: number; wins: number; totalMatches: number; bestMoves: number | null };
  achievements: string[];
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
  play(type: 'flip' | 'match' | 'win') {
    if (!Store.data.settings.sfx) return;
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    this.ctx ??= new AudioContextClass();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    const now = this.ctx.currentTime;
    const tones = type === 'win' ? [523, 659, 784] : [type === 'match' ? 740 : 410];
    tones.forEach((frequency, index) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = type === 'flip' ? 'sine' : 'triangle';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(type === 'flip' ? 0.035 : 0.06, now + index * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.11 + 0.16);
      osc.connect(gain).connect(this.ctx!.destination);
      osc.start(now + index * 0.11);
      osc.stop(now + index * 0.11 + 0.18);
    });
  },
};

function haptic(pattern: number | number[]) {
  if (Store.data.settings.haptics && navigator.vibrate) navigator.vibrate(pattern);
}

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
        <p class="eyebrow">Zipzip 2.0</p>
        <h1>Kısa oyna.<br>Hafızanı zorla.</h1>
        <p>Telefon için yeniden düzenlenmiş hızlı eşleştirme oyunu. İlerlemen bu cihazda otomatik saklanır ve eski Zipzip kaydın varsa aynen devam eder.</p>
        <div class="resume-card">
          <div>
            <div class="resume-kicker">Kaldığın yer</div>
            <div class="resume-title">Seviye <span id="resumeLevel">1</span></div>
            <div class="resume-meta" id="resumeMeta">4×4 tahta · serbest süre</div>
          </div>
          <button class="primary-btn" id="resumeButton" type="button">Devam et</button>
        </div>
      </div>

      <div class="dashboard-grid">
        <article class="dashboard-card"><div class="dashboard-label">Zafer</div><div class="dashboard-value" id="homeWins">0</div><div class="dashboard-note">tamamlanan oyun</div></article>
        <article class="dashboard-card"><div class="dashboard-label">Eşleşme</div><div class="dashboard-value" id="homeMatches">0</div><div class="dashboard-note">toplam çift</div></article>
        <article class="dashboard-card"><div class="dashboard-label">En iyi</div><div class="dashboard-value" id="homeBest">—</div><div class="dashboard-note">en az hamle</div></article>
      </div>

      <div class="section-head"><h2>Oyun</h2><span>Yeni modlar için temel hazır</span></div>
      <div class="mode-grid">
        <button class="mode-card" id="classicMode" type="button"><div class="mode-icon">🧠</div><div class="mode-title">Klasik</div><div class="mode-desc">Seviyeleri sırayla ilerlet. İlerledikçe tahta büyür ve süre devreye girer.</div></button>
        <button class="mode-card" data-nav="shop" type="button"><div class="mode-icon">✨</div><div class="mode-title">Güçlendirmeler</div><div class="mode-desc">Kazandığın altınlarla joker, ipucu ve zaman dondurma biriktir.</div></button>
      </div>
      <div class="quick-links">
        <button class="quick-link" data-nav="stats" type="button"><span>📊</span><b>İstatistikler</b><small>Performansını gör</small></button>
        <button class="quick-link" data-nav="achievements" type="button"><span>🏆</span><b>Başarımlar</b><small>Açtığın rozetler</small></button>
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
  byId('mainTopbar').style.display = screen === 'game' ? 'none' : '';
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
  const config = levelConfig(data.currentLevel);
  byId('resumeLevel').textContent = String(data.currentLevel);
  byId('resumeMeta').textContent = `${config.cols}×${config.rows} tahta · ${config.time ? `${Math.floor(config.time / 60)} dk` : 'serbest süre'}`;
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
    ['🎮','Başlatılan oyun', stats.totalGames],
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
    <div class="settings-row"><div><strong>Ses efektleri</strong><small>Kart, eşleşme ve seviye sesleri</small></div><button class="switch ${Store.data.settings.sfx ? 'on' : ''}" data-setting="sfx" type="button" aria-label="Ses efektleri"></button></div>
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

byId('resumeButton').addEventListener('click', () => Game.start());
byId('classicMode').addEventListener('click', () => Game.start());
byId('quitGame').addEventListener('click', () => Game.quit());
byId('resultHome').addEventListener('click', () => Game.quit());
byId('resultRetry').addEventListener('click', () => { closeResult(); Game.setup(); });
byId('resultNext').addEventListener('click', () => { closeResult(); Game.level += 1; Game.setup(); });
window.addEventListener('resize', () => { if (document.querySelector('[data-screen="game"]')?.classList.contains('active')) Game.fitBoard(); });

Store.load();
unlockAchievements(false);
renderHome();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined));
}
