export const TOWER_WIDTH = 360;
export const FLOOR_GAP = 60;
export const GRAVITY = 1550;
export const MAX_SPEED = 340;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export type Floor = { index: number; x: number; y: number; width: number };
export type TowerEvent = 'jump' | 'superjump' | 'land' | 'wall' | 'combo' | 'bank' | 'fail';
export type Controls = { direction: number; jump: boolean };
export function jumpPower(vx: number) { return 470 + 410 * Math.pow(Math.min(1, Math.abs(vx) / MAX_SPEED), 1.25); }
export function nextFloor(previous: Floor, random = Math.random): Floor {
  const index = previous.index + 1;
  const width = index % 10 === 0 ? 256 : Math.max(104, 224 - index * 0.72) + random() * 16;
  // Preserve >=42px overlap with previous floor: even a standing jump has a route.
  const low = Math.max(20, previous.x + 42 - width);
  const high = Math.min(TOWER_WIDTH - 20 - width, previous.x + previous.width - 42);
  return { index, x: low + random() * Math.max(0, high - low), y: previous.y + FLOOR_GAP, width };
}

export class TowerWorld {
  width = TOWER_WIDTH;
  viewHeight: number;
  player = { x: 180, y: 30, vx: 0, vy: 0, facing: 1 };
  floors: Floor[] = [{ index: 0, x: 16, y: 30, width: 328 }];
  grounded: Floor | null = this.floors[0]!;
  camera = 0;
  elapsed = 0;
  started = false;
  alive = true;
  highestFloor = 0;
  score = 0;
  combo = 0;
  comboFloors = 0;
  comboTime = 0;
  bestCombo = 0;
  lastBank = 0;
  bankFlash = 0;
  launchFlash = 0;
  landFlash = 0;
  wallLock = 0;
  coyote = 0;
  jumpBuffer = 0;
  previousJump = false;
  takeoffFloor = 0;
  landings = 0;
  events: TowerEvent[] = [];
  trail: { x: number; y: number; life: number }[] = [];
  random: () => number;
  constructor(viewHeight = 640, random = Math.random) {
    this.viewHeight = viewHeight; this.random = random;
    this.generate(viewHeight + 500);
  }
  generate(target: number) {
    while (this.floors.at(-1)!.y < target) this.floors.push(nextFloor(this.floors.at(-1)!, this.random));
  }
  get scrollSpeed() { return Math.min(100, 16 + this.elapsed * 0.3 + this.highestFloor * 0.22); }
  bankCombo() {
    if (this.combo > 0) {
      this.lastBank = this.comboFloors * this.combo * 25;
      this.score += this.lastBank; this.bankFlash = 1.3; this.events.push('bank');
    }
    this.combo = 0; this.comboFloors = 0; this.comboTime = 0;
  }
  jump() {
    if (!this.grounded && this.coyote <= 0) return;
    this.takeoffFloor = this.grounded?.index ?? this.takeoffFloor;
    this.player.vy = jumpPower(this.player.vx);
    this.grounded = null; this.coyote = 0; this.jumpBuffer = 0;
    this.started = true; this.launchFlash = .35;
    this.events.push(Math.abs(this.player.vx) > MAX_SPEED * .7 ? 'superjump' : 'jump');
  }
  land(floor: Floor) {
    this.player.y = floor.y; this.player.vy = 0; this.grounded = floor;
    this.coyote = .09; this.landings++; this.landFlash = .13;
    const gain = floor.index - this.takeoffFloor;
    const newRecord = floor.index > this.highestFloor;
    if (newRecord) {
      this.score += (floor.index - this.highestFloor) * 10;
      this.highestFloor = floor.index;
    }
    if (gain >= 2 && newRecord) {
      this.combo++; this.comboFloors += gain; this.comboTime = 3;
      this.bestCombo = Math.max(this.bestCombo, this.combo); this.events.push('combo');
    } else if (this.combo) this.bankCombo();
    this.events.push('land');
  }
  update(dt: number, input: Controls) {
    if (!this.alive) return;
    const p = this.player;
    this.events.length = 0;
    if (this.started) this.elapsed += dt;
    this.launchFlash = Math.max(0, this.launchFlash - dt);
    this.landFlash = Math.max(0, this.landFlash - dt);
    this.bankFlash = Math.max(0, this.bankFlash - dt);
    this.wallLock = Math.max(0, this.wallLock - dt);
    this.coyote = Math.max(0, this.coyote - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (input.jump && !this.previousJump) this.jumpBuffer = .15;
    this.previousJump = input.jump;
    if (this.comboTime > 0) {
      this.comboTime -= dt;
      if (this.comboTime <= 0) this.bankCombo();
    }
    const direction = clamp(input.direction, -1, 1);
    if (direction && this.wallLock === 0) {
      p.vx = clamp(p.vx + direction * (this.grounded ? 1100 : 650) * dt, -MAX_SPEED, MAX_SPEED);
      p.facing = direction;
    } else if (!direction) {
      const braking = (this.grounded ? 680 : 60) * dt;
      p.vx = Math.sign(p.vx) * Math.max(0, Math.abs(p.vx) - braking);
    }
    const oldX = p.x;
    p.x += p.vx * dt;
    if (p.x < 27 || p.x > this.width - 27) {
      p.x = clamp(p.x, 27, this.width - 27);
      if (Math.abs(p.vx) > 60) { this.events.push('wall'); this.wallLock = .15; }
      p.vx *= -.85; p.facing = Math.sign(p.vx) || p.facing;
    }
    if (this.grounded) {
      if (p.x + 8 < this.grounded.x || p.x - 8 > this.grounded.x + this.grounded.width) {
        this.takeoffFloor = this.grounded.index; this.grounded = null; this.coyote = .09;
      } else this.coyote = .09;
    }
    // Holding jump permits rhythm hopping; release is not required between landings.
    if ((this.jumpBuffer > 0 || (input.jump && this.grounded)) && (this.grounded || this.coyote > 0)) this.jump();
    const oldY = p.y;
    if (!this.grounded) {
      p.y += p.vy * dt - .5 * GRAVITY * dt * dt;
      p.vy -= GRAVITY * dt;
      if (p.vy < 0) {
        for (let i = this.floors.length - 1; i >= 0; i--) {
          const f = this.floors[i]!;
          if (oldY < f.y || p.y > f.y) continue;
          const fraction = (oldY - f.y) / Math.max(.0001, oldY - p.y);
          const hitX = oldX + (p.x - oldX) * fraction;
          if (hitX + 8 >= f.x && hitX - 8 <= f.x + f.width) { this.land(f); break; }
        }
      }
    }
    if (!this.grounded && Math.abs(p.vx) > 230) this.trail.push({x:p.x,y:p.y,life:.18});
    for (const t of this.trail) t.life -= dt;
    this.trail = this.trail.filter(t => t.life > 0);
    const follow = Math.max(this.camera, p.y - this.viewHeight * .48);
    this.camera += (follow - this.camera) * (1 - Math.exp(-10 * dt));
    this.camera = Math.max(this.camera, p.y - this.viewHeight + 50);
    if (this.started && this.elapsed > 6) this.camera += this.scrollSpeed * dt;
    this.generate(this.camera + this.viewHeight + 420);
    this.floors = this.floors.filter(f => f.y >= this.camera - 90);
    if (p.y < this.camera - 28) {
      this.bankCombo(); this.alive = false; this.events.push('fail');
    }
  }
}
