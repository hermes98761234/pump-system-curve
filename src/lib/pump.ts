import { ATM, colebrook, fluidProps, G, solveSegment, totalK, FLOW_UNITS, type SegmentSI } from './pipe'

export type Fn = (q: number) => number

/** Least-squares polynomial of degree ≤ 2 through (x, y); degrades gracefully for fewer points. */
export function polyfit2(xs: number[], ys: number[]): [number, number, number] {
  const n = xs.length
  if (n === 0) return [0, 0, 0]
  if (n === 1) return [ys[0], 0, 0]
  const deg = Math.min(2, n - 1)
  const m = deg + 1
  const A: number[][] = Array.from({ length: m }, () => new Array(m + 1).fill(0))
  for (let i = 0; i < n; i++) {
    for (let r = 0; r < m; r++) {
      for (let c = 0; c < m; c++) A[r][c] += xs[i] ** (r + c)
      A[r][m] += ys[i] * xs[i] ** r
    }
  }
  for (let c = 0; c < m; c++) {
    let p = c
    for (let r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r
    ;[A[c], A[p]] = [A[p], A[c]]
    if (Math.abs(A[c][c]) < 1e-14) return [ys[0], 0, 0]
    for (let r = 0; r < m; r++) {
      if (r === c) continue
      const k = A[r][c] / A[c][c]
      for (let j = c; j <= m; j++) A[r][j] -= k * A[c][j]
    }
  }
  const out = [0, 0, 0]
  for (let r = 0; r < m; r++) out[r] = A[r][m] / A[r][r]
  return [out[0], out[1], out[2]]
}

export const evalPoly = (c: [number, number, number]): Fn => (q) => c[0] + c[1] * q + c[2] * q * q

/** Saturation vapour pressure of water in Pa (Antoine, 1–100 °C). */
export function vaporPressure(tC: number): number {
  const t = Math.min(100, Math.max(1, tC))
  return 10 ** (8.07131 - 1730.63 / (233.426 + t)) * 133.322
}

/** Barometric pressure in Pa at an altitude in metres (ISA). */
export const atmosphericPressure = (alt: number) => ATM * (1 - 2.25577e-5 * alt) ** 5.25588

export interface NpshInput {
  tempC: number
  altitude: number
  /** Liquid level above the pump centre line in m (negative for a suction lift). */
  suctionHead: number
  /** Friction loss in the suction line, m. */
  suctionLoss: number
}

export function npshAvailable(i: NpshInput): number {
  const rho = fluidProps('water', i.tempC).rho
  return (atmosphericPressure(i.altitude) - vaporPressure(i.tempC)) / (rho * G) + i.suctionHead - i.suctionLoss
}

/** Affinity laws: the curve of the same pump at speed ratio r (also used for impeller trim, approximately). */
export const affinity = {
  flow: (q: number, r: number) => q * r,
  head: (h: number, r: number) => h * r * r,
  power: (p: number, r: number) => p * r ** 3,
}
export const scaleHead = (H0: Fn, r: number): Fn => (q) => r * r * H0(q / r)
export const scaleEff = (E0: Fn, r: number): Fn => (q) => E0(q / r)

export type Arrangement = 'single' | 'series' | 'parallel'

export function combineHead(H1: Fn, arr: Arrangement, n: number): Fn {
  if (arr === 'series') return (q) => n * H1(q)
  if (arr === 'parallel') return (q) => H1(q / n)
  return H1
}
/** Efficiency of the combination at total flow q (identical pumps share the load equally). */
export function combineEff(E1: Fn, arr: Arrangement, n: number): Fn {
  return arr === 'parallel' ? (q) => E1(q / n) : E1
}

/** Intersection of pump head curve and system curve on [0, qMax]; null when there is none. */
export function operatingPoint(Hp: Fn, Hs: Fn, qMax: number): { q: number; h: number } | null {
  const d = (q: number) => Hp(q) - Hs(q)
  if (d(0) <= 0) return null
  let lo = 0
  let hi = qMax
  if (d(hi) > 0) return null
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    if (d(mid) > 0) lo = mid
    else hi = mid
  }
  const q = (lo + hi) / 2
  return { q, h: Hs(q) }
}

/** Speed ratio at which the pump delivers `qTarget` against the system head there. */
export function speedForFlow(H0: Fn, Hs: Fn, qTarget: number, rLo = 0.2, rHi = 1.6): number | null {
  const g = (r: number) => r * r * H0(qTarget / r) - Hs(qTarget)
  if (g(rLo) > 0 || g(rHi) < 0) return null
  let lo = rLo
  let hi = rHi
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    if (g(mid) < 0) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

const MOTORS = [0.18, 0.25, 0.37, 0.55, 0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110, 132, 160, 200, 250, 315]
/** Next standard IEC motor size (kW) for a shaft power with a service margin (default 15 %). */
export function motorSize(shaftKw: number, margin = 1.15): number | null {
  const need = shaftKw * margin
  return MOTORS.find((m) => m >= need - 1e-9) ?? null
}

export interface PipeLine {
  length: number
  diameterMm: number
  roughnessMm: number
  kSum: number
}

/** Friction head in metres for a line carrying `qM3s` of water. */
export function lineLoss(l: PipeLine, qM3s: number, tempC: number): number {
  if (qM3s <= 0 || l.length < 0 || l.diameterMm <= 0) return 0
  const fl = fluidProps('water', tempC)
  const seg: SegmentSI = { name: '', L: l.length, D: l.diameterMm / 1000, eps: l.roughnessMm / 1000, dz: 0, K: l.kSum }
  const r = solveSegment(seg, qM3s, fl, 'colebrook')
  return (r.dpFriction + r.dpMinor) / (fl.rho * G)
}

export const flowToM3h = (unit: string, x: number) => x * (FLOW_UNITS[unit] ?? 1) * 3600
export const flowFromM3h = (unit: string, x: number) => x / ((FLOW_UNITS[unit] ?? 1) * 3600)
export const FT = 0.3048

export { colebrook, totalK }
