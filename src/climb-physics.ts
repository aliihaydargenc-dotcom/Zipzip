// World units are CSS pixels; displayed altitude is 10 world units per metre.
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export function tempoAt(meters: number) {
  const stops = [0, 150, 350, 650, 1000, 1800];
  const speeds = [1, 1.08, 1.22, 1.42, 1.65, 1.85];
  const m = Math.max(0, meters);
  let i = 0;
  while (i < stops.length - 2 && m > stops[i + 1]!) i++;
  const t = clamp((m - stops[i]!) / (stops[i + 1]! - stops[i]!), 0, 1);
  const speed = speeds[i]! + (speeds[i + 1]! - speeds[i]!) * t;
  // Scaling v by s and g by s² preserves jump reach while reducing flight time.
  return { speed, jump: 660 * speed, gravity: 1500 * speed * speed,
    horizontal: 270 * speed, response: 9 + 3 * (speed - 1),
    moving: 30 * speed, camera: 7 + 5 * (speed - 1),
    difficulty: clamp(m / 1100, 0, 1),
    label: m < 150 ? 'Isınma' : m < 350 ? 'Akış' : m < 650 ? 'Hareket' : m < 1000 ? 'Hızlı' : 'Zirve' };
}
export function launchVelocity(meters: number, multiplier = 1) { return tempoAt(meters).jump * multiplier; }
export function flightTime(gap: number, meters: number) {
  const p = tempoAt(meters);
  return (p.jump + Math.sqrt(Math.max(0, p.jump * p.jump - 2 * p.gravity * gap))) / p.gravity;
}
export function routeStep(y: number, lastCenter: number, worldWidth: number, random = Math.random) {
  const m = Math.max(0, y - 30) / 10;
  const p = tempoAt(m);
  const gap = 72 + p.difficulty * 17 + random() * 9;
  const width = Math.min(worldWidth * 0.42, 128 - p.difficulty * 34 + random() * 8);
  // Reserve >50% of travel time for reaction / acceleration; no wrap needed.
  const reach = p.horizontal * flightTime(gap, m) * 0.40;
  const shift = Math.min(reach, 56 + p.difficulty * 43);
  const center = clamp(lastCenter + (random() * 2 - 1) * shift, width / 2 + 12, worldWidth - width / 2 - 12);
  return { y: y + gap, width, center, difficulty: p.difficulty };
}
export function steer(vx: number, delta: number, dt: number, meters: number) {
  const p = tempoAt(meters);
  const desired = clamp(delta * p.response, -p.horizontal, p.horizontal);
  const next = vx + (desired - vx) * (1 - Math.exp(-14 * p.speed * dt));
  const step = next * dt;
  return Math.sign(step) === Math.sign(delta) && Math.abs(step) > Math.abs(delta)
    ? { vx: 0, step: delta } : { vx: next, step };
}
