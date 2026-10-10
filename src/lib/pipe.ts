/** Pipe flow maths in SI units: Pa, m, m/s, kg/m3, Pa·s. */

export const G = 9.80665
export const ATM = 101325

export type FluidKind = 'water' | 'air' | 'oil' | 'custom'
export type Method = 'colebrook' | 'swamee' | 'haaland'
export type Regime = 'laminar' | 'transitional' | 'turbulent'

export interface Fluid {
  rho: number
  mu: number
}

/** Flow-rate units → m³/s. */
export const FLOW_UNITS: Record<string, number> = {
  'L/s': 1e-3,
  'm³/h': 1 / 3600,
  'm³/s': 1,
  'L/min': 1e-3 / 60,
  gpm: 3.785411784e-3 / 60,
  cfm: 0.028316846592 / 60,
}
/** Pressure units → Pa. */
export const PRESSURE_UNITS: Record<string, number> = {
  kPa: 1e3,
  bar: 1e5,
  psi: 6894.757293168,
  Pa: 1,
}
export const LENGTH_UNITS: Record<string, number> = { m: 1, ft: 0.3048 }
export const DIAMETER_UNITS: Record<string, number> = { mm: 1e-3, in: 0.0254 }

/** Absolute roughness in mm for common pipe materials. */
export const MATERIALS: Record<string, number> = {
  smooth: 0.0015,
  pvc: 0.0015,
  copper: 0.0015,
  steel: 0.045,
  galvanized: 0.15,
  'cast-iron': 0.26,
  concrete: 0.5,
  riveted: 2,
}

/** Minor-loss coefficients K (typical textbook values for fully turbulent flow). */
export const FITTINGS: Record<string, number> = {
  elbow90: 0.9,
  elbow90long: 0.6,
  elbow45: 0.4,
  teeRun: 0.4,
  teeBranch: 1.0,
  gate: 0.2,
  ball: 0.05,
  butterfly: 0.8,
  globe: 10,
  check: 2,
  entranceSharp: 0.5,
  entranceRounded: 0.1,
  exit: 1,
}

/** Water viscosity (Vogel-type fit) and density (Kell) between 0 and 100 °C; air by ideal gas and Sutherland. */
export function fluidProps(kind: FluidKind, tC: number, custom: Fluid = { rho: 1000, mu: 1e-3 }): Fluid {
  const T = tC + 273.15
  switch (kind) {
    case 'water': {
      const rho = 1000 * (1 - ((tC + 288.9414) / (508929.2 * (tC + 68.12963))) * (tC - 3.9863) ** 2)
      const mu = 2.414e-5 * 10 ** (247.8 / (T - 140))
      return { rho, mu }
    }
    case 'air':
      return { rho: ATM / (287.05 * T), mu: 1.716e-5 * (T / 273.15) ** 1.5 * (273.15 + 110.4) / (T + 110.4) }
    case 'oil':
      // Generic ISO VG 32 hydraulic/lube oil: 0.0275 Pa·s at 40 °C, falling about 3 % per kelvin.
      return { rho: 870 - 0.65 * (tC - 15), mu: 0.0275 * Math.exp(-0.035 * (tC - 40)) }
    default:
      return custom
  }
}

export const reynolds = (rho: number, v: number, D: number, mu: number) => (rho * v * D) / mu

/** Colebrook-White by Newton iteration on x = 1/sqrt(f). */
export function colebrook(Re: number, rel: number): number {
  let x = -2 * Math.log10(rel / 3.7 + 5.74 / Re ** 0.9) // Swamee-Jain start
  for (let i = 0; i < 50; i++) {
    const a = rel / 3.7 + (2.51 * x) / Re
    const F = x + 2 * Math.log10(a)
    const dF = 1 + (2 / Math.LN10) * ((2.51 / Re) / a)
    const nx = x - F / dF
    if (Math.abs(nx - x) < 1e-12) {
      x = nx
      break
    }
    x = nx
  }
  return 1 / (x * x)
}

export function swameeJain(Re: number, rel: number): number {
  const l = Math.log10(rel / 3.7 + 5.74 / Re ** 0.9)
  return 0.25 / (l * l)
}

export function haaland(Re: number, rel: number): number {
  const l = -1.8 * Math.log10((rel / 3.7) ** 1.11 + 6.9 / Re)
  return 1 / (l * l)
}

const turbulent = (Re: number, rel: number, m: Method) => (m === 'swamee' ? swameeJain(Re, rel) : m === 'haaland' ? haaland(Re, rel) : colebrook(Re, rel))

/** Darcy friction factor. Laminar 64/Re; 2300..4000 is blended linearly; turbulent per `method`. */
export function frictionFactor(Re: number, rel: number, method: Method): { f: number; regime: Regime } {
  if (!(Re > 0)) return { f: 0, regime: 'laminar' }
  if (Re <= 2300) return { f: 64 / Re, regime: 'laminar' }
  if (Re >= 4000) return { f: turbulent(Re, rel, method), regime: 'turbulent' }
  const f1 = 64 / 2300
  const f2 = turbulent(4000, rel, method)
  return { f: f1 + ((f2 - f1) * (Re - 2300)) / 1700, regime: 'transitional' }
}

export interface SegmentSI {
  name: string
  L: number
  D: number
  eps: number
  dz: number
  K: number
}

export interface SegmentResult {
  name: string
  v: number
  Re: number
  f: number
  regime: Regime
  K: number
  dpFriction: number
  dpMinor: number
  dpElevation: number
  dpTotal: number
  headLoss: number
}

export function solveSegment(s: SegmentSI, Q: number, fl: Fluid, method: Method): SegmentResult {
  const A = (Math.PI * s.D * s.D) / 4
  const v = Q / A
  const Re = reynolds(fl.rho, v, s.D, fl.mu)
  const { f, regime } = frictionFactor(Re, s.eps / s.D, method)
  const q = 0.5 * fl.rho * v * v
  const dpFriction = f * (s.L / s.D) * q
  const dpMinor = s.K * q
  const dpElevation = fl.rho * G * s.dz
  return { name: s.name, v, Re, f, regime, K: s.K, dpFriction, dpMinor, dpElevation, dpTotal: dpFriction + dpMinor + dpElevation, headLoss: (dpFriction + dpMinor) / (fl.rho * G) }
}

export interface PipelineResult {
  segments: SegmentResult[]
  dpFriction: number
  dpMinor: number
  dpElevation: number
  dpTotal: number
  headLoss: number
  length: number
  /** Gauge pressure at each node (inlet, after segment 1, …) when the inlet pressure is known. */
  profile: { x: number; p: number }[]
}

export function solvePipeline(segs: SegmentSI[], Q: number, fl: Fluid, method: Method, inletGauge: number): PipelineResult {
  const segments = segs.map((s) => solveSegment(s, Q, fl, method))
  let x = 0
  let p = inletGauge
  const profile = [{ x, p }]
  segs.forEach((s, i) => {
    x += s.L
    p -= segments[i].dpTotal
    profile.push({ x, p })
  })
  const sum = (k: 'dpFriction' | 'dpMinor' | 'dpElevation' | 'dpTotal' | 'headLoss') => segments.reduce((a, r) => a + r[k], 0)
  return { segments, dpFriction: sum('dpFriction'), dpMinor: sum('dpMinor'), dpElevation: sum('dpElevation'), dpTotal: sum('dpTotal'), headLoss: sum('headLoss'), length: x, profile }
}

export const totalK = (list: { kind: string; count: number; k?: number }[]) =>
  list.reduce((a, f) => a + Math.max(0, f.count) * (f.kind === 'custom' ? (f.k ?? 0) : (FITTINGS[f.kind] ?? 0)), 0)
