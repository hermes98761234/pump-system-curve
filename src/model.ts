import { ATM, G, MATERIALS, fluidProps } from './lib/pipe'
import {
  FT, combineEff, combineHead, evalPoly, flowFromM3h, flowToM3h, lineLoss, motorSize, npshAvailable, operatingPoint, polyfit2, scaleEff, scaleHead, speedForFlow,
  type Arrangement, type Fn,
} from './lib/pump'

export interface Pt {
  id: number
  q: number
  h: number
  /** Efficiency in %, 0 when unknown. */
  eta: number
  /** NPSH required in head units, 0 when unknown. */
  npshr: number
}

export interface Inputs {
  pts: Pt[]
  speed: number
  arrangement: Arrangement
  count: number
  flowUnit: string
  headUnit: string
  staticHead: number
  delivPressure: number
  dLength: number
  dDiameter: number
  dMaterial: string
  dK: number
  sLength: number
  sDiameter: number
  sK: number
  suctionHead: number
  temp: number
  altitude: number
  target: number
  nextId: number
}

/** Presets are stored in m³/h and metres. */
export const PRESETS: Record<string, { q: number; h: number; eta: number; npshr: number }[]> = {
  booster: [
    { q: 0, h: 28, eta: 0, npshr: 0.8 }, { q: 2, h: 27, eta: 32, npshr: 0.9 }, { q: 4, h: 25, eta: 48, npshr: 1.1 },
    { q: 6, h: 22, eta: 55, npshr: 1.5 }, { q: 8, h: 17.5, eta: 50, npshr: 2.1 }, { q: 10, h: 11, eta: 38, npshr: 3 },
  ],
  medium: [
    { q: 0, h: 42, eta: 0, npshr: 1 }, { q: 10, h: 41, eta: 38, npshr: 1.2 }, { q: 20, h: 39, eta: 55, npshr: 1.6 },
    { q: 30, h: 36, eta: 63, npshr: 2.2 }, { q: 40, h: 31, eta: 66, npshr: 3 }, { q: 50, h: 25, eta: 60, npshr: 4.2 }, { q: 60, h: 17, eta: 48, npshr: 6 },
  ],
  large: [
    { q: 0, h: 60, eta: 0, npshr: 2 }, { q: 50, h: 59, eta: 45, npshr: 2.4 }, { q: 100, h: 56, eta: 66, npshr: 3 },
    { q: 150, h: 50, eta: 76, npshr: 4 }, { q: 200, h: 42, eta: 79, npshr: 5.5 }, { q: 250, h: 32, eta: 72, npshr: 8 }, { q: 300, h: 20, eta: 58, npshr: 11 },
  ],
}

export function presetPoints(name: string, flowUnit: string, headUnit: string, id0: number): Pt[] {
  const hf = headUnit === 'ft' ? 1 / FT : 1
  return (PRESETS[name] ?? []).map((p, i) => ({ id: id0 + i, q: Number(flowFromM3h(flowUnit, p.q).toPrecision(4)), h: Number((p.h * hf).toPrecision(4)), eta: p.eta, npshr: Number((p.npshr * hf).toPrecision(3)) }))
}

export const DEFAULTS: Inputs = {
  pts: presetPoints('medium', 'm³/h', 'm', 1),
  speed: 100,
  arrangement: 'single',
  count: 2,
  flowUnit: 'm³/h',
  headUnit: 'm',
  staticHead: 15,
  delivPressure: 0,
  dLength: 150,
  dDiameter: 80,
  dMaterial: 'steel',
  dK: 6,
  sLength: 5,
  sDiameter: 100,
  sK: 3,
  suctionHead: -2,
  temp: 20,
  altitude: 0,
  target: 35,
  nextId: 100,
}

export function convertUnits(i: Inputs, flowUnit: string, headUnit: string): Inputs {
  const qf = (x: number) => Number(flowFromM3h(flowUnit, flowToM3h(i.flowUnit, x)).toPrecision(4))
  const hf = (x: number) => Number(((x * (i.headUnit === 'ft' ? FT : 1)) / (headUnit === 'ft' ? FT : 1)).toPrecision(4))
  return {
    ...i, flowUnit, headUnit,
    pts: i.pts.map((p) => ({ ...p, q: qf(p.q), h: hf(p.h), npshr: hf(p.npshr) })),
    staticHead: hf(i.staticHead), suctionHead: hf(i.suctionHead), target: qf(i.target),
  }
}

export interface Analysis {
  ok: boolean
  reason?: 'points' | 'noflow'
  /** Everything below is in display units (flow unit, head unit). */
  curve: { q: number; hp: number | null; hs: number; eta: number | null; npshr: number | null; npsha: number }[]
  op: { q: number; h: number } | null
  etaOp: number | null
  hydKw: number | null
  shaftKw: number | null
  perPumpKw: number | null
  motorKw: number | null
  bepRatio: number | null
  npshaOp: number | null
  npshrOp: number | null
  npshMargin: number | null
  speedNeeded: number | null
  qMax: number
  beyondData: boolean
}

export function analyse(inp: Inputs): Analysis {
  const empty: Analysis = { ok: false, curve: [], op: null, etaOp: null, hydKw: null, shaftKw: null, perPumpKw: null, motorKw: null, bepRatio: null, npshaOp: null, npshrOp: null, npshMargin: null, speedNeeded: null, qMax: 0, beyondData: false }
  const hu = inp.headUnit === 'ft' ? FT : 1
  const pts = inp.pts.map((p) => ({ q: flowToM3h(inp.flowUnit, p.q), h: p.h * hu, eta: p.eta, n: p.npshr * hu })).filter((p) => p.q >= 0).sort((a, b) => a.q - b.q)
  if (pts.length < 2) return { ...empty, reason: 'points' }
  const Hfit = polyfit2(pts.map((p) => p.q), pts.map((p) => p.h))
  const ePts = pts.filter((p) => p.eta > 0)
  const nPts = pts.filter((p) => p.n > 0)
  const H0: Fn = evalPoly(Hfit)
  const E0: Fn | null = ePts.length ? (() => { const f = evalPoly(polyfit2(ePts.map((p) => p.q), ePts.map((p) => p.eta))); return (q: number) => Math.max(0, Math.min(95, f(q))) })() : null
  const N0: Fn | null = nPts.length ? (() => { const f = evalPoly(polyfit2(nPts.map((p) => p.q), nPts.map((p) => p.n))); return (q: number) => Math.max(0, f(q)) })() : null
  const r = Math.max(0.1, inp.speed / 100)
  const arr = inp.arrangement
  const n = arr === 'single' ? 1 : Math.max(1, Math.round(inp.count))
  const H1 = scaleHead(H0, r)
  const Hp = combineHead(H1, arr, n)
  const E1 = E0 ? scaleEff(E0, r) : null
  const Ec = E1 ? combineEff(E1, arr, n) : null
  const qData = pts[pts.length - 1].q
  const qMax = qData * r * (arr === 'parallel' ? n : 1) * 1.15
  const rho = fluidProps('water', inp.temp).rho
  const disch = { length: inp.dLength, diameterMm: inp.dDiameter, roughnessMm: MATERIALS[inp.dMaterial] ?? 0.045, kSum: inp.dK }
  const suct = { length: inp.sLength, diameterMm: inp.sDiameter, roughnessMm: MATERIALS[inp.dMaterial] ?? 0.045, kSum: inp.sK }
  const stat = inp.staticHead * hu + (inp.delivPressure * 1000) / (rho * G)
  const Hs: Fn = (q) => stat + lineLoss(disch, q / 3600, inp.temp) + lineLoss(suct, q / 3600, inp.temp)
  const perPump = (q: number) => (arr === 'parallel' ? q / n : q)
  const npshaAt = (q: number) => npshAvailable({ tempC: inp.temp, altitude: inp.altitude, suctionHead: inp.suctionHead * hu, suctionLoss: lineLoss(suct, q / 3600, inp.temp) })
  const N1 = N0 ? scaleHead(N0, r) : null
  const op = operatingPoint(Hp, Hs, qMax)
  const qd = (q: number) => flowFromM3h(inp.flowUnit, q)
  const hd = (h: number) => h / hu
  const curve: Analysis['curve'] = []
  const steps = 80
  for (let i = 0; i <= steps; i++) {
    const q = (qMax * i) / steps
    const hp = Hp(q)
    curve.push({ q: qd(q), hp: hp >= 0 ? hd(hp) : null, hs: hd(Hs(q)), eta: Ec && hp >= 0 ? Ec(q) : null, npshr: N1 ? hd(N1(perPump(q))) : null, npsha: hd(npshaAt(q)) })
  }
  let target: number | null = null
  if (inp.target > 0) {
    const rn = speedForFlow(combineHead(H0, arr, n), Hs, flowToM3h(inp.flowUnit, inp.target))
    target = rn === null ? null : rn * 100
  }
  const res: Analysis = { ...empty, ok: true, curve, op: null, speedNeeded: target, qMax: qd(qMax) }
  if (!op) return { ...res, reason: 'noflow' }
  const eta = Ec ? Ec(op.q) / 100 : null
  const hyd = (rho * G * (op.q / 3600) * op.h) / 1000
  const shaft = eta && eta > 0.02 ? hyd / eta : null
  let bep: number | null = null
  if (E1) {
    let best = 0
    let qb = 0
    for (let i = 0; i <= 200; i++) {
      const q = (qData * r * i) / 200
      const e = E1(q)
      if (e > best) { best = e; qb = q }
    }
    bep = qb > 0 ? perPump(op.q) / qb : null
  }
  const npsha = npshaAt(op.q)
  const npshr = N1 ? N1(perPump(op.q)) : null
  return {
    ...res,
    op: { q: qd(op.q), h: hd(op.h) },
    etaOp: eta === null ? null : eta * 100,
    hydKw: hyd,
    shaftKw: shaft,
    perPumpKw: shaft === null ? null : shaft / (arr === 'parallel' ? n : arr === 'series' ? n : 1),
    motorKw: shaft === null ? null : motorSize(shaft / (arr === 'single' ? 1 : n)),
    bepRatio: bep,
    npshaOp: hd(npsha),
    npshrOp: npshr === null ? null : hd(npshr),
    npshMargin: npshr === null ? null : hd(npsha - npshr),
    beyondData: perPump(op.q) > qData * r * 1.0001,
  }
}

export const ATM_PA = ATM
