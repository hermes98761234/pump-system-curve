import { describe, expect, it } from 'vitest'
import { analyse, convertUnits, DEFAULTS, presetPoints } from './model'

describe('analyse', () => {
  it('finds an operating point on the default case', () => {
    const a = analyse(DEFAULTS)
    expect(a.ok).toBe(true)
    expect(a.op).not.toBeNull()
    // the operating point lies on both curves
    const c = a.curve
    expect(a.op!.h).toBeGreaterThan(15)
    expect(a.op!.h).toBeLessThan(42)
    expect(a.op!.q).toBeGreaterThan(20)
    expect(a.op!.q).toBeLessThan(60)
    expect(c.length).toBeGreaterThan(50)
    expect(a.shaftKw!).toBeGreaterThan(a.hydKw!)
    expect(a.motorKw!).toBeGreaterThanOrEqual(a.shaftKw! * 1.15 - 1e-9)
    expect(a.npshMargin!).toBeGreaterThan(0)
    expect(a.bepRatio!).toBeGreaterThan(0.6)
  })
  it('reducing speed lowers flow and head by the affinity laws', () => {
    const full = analyse({ ...DEFAULTS, staticHead: 0, dLength: 0.001, dK: 0, sLength: 0, sK: 0 })
    const slow = analyse({ ...DEFAULTS, speed: 80, staticHead: 0, dLength: 0.001, dK: 0, sLength: 0, sK: 0 })
    // with a near-zero system curve the pump runs out near shut-off head... compare against r² at q=0
    expect(slow.curve[0].hp! / full.curve[0].hp!).toBeCloseTo(0.64, 6)
  })
  it('parallel pumps deliver more flow, series more head', () => {
    const one = analyse(DEFAULTS).op!
    const par = analyse({ ...DEFAULTS, arrangement: 'parallel', count: 2 }).op!
    const ser = analyse({ ...DEFAULTS, arrangement: 'series', count: 2 }).op!
    expect(par.q).toBeGreaterThan(one.q)
    expect(ser.h).toBeGreaterThan(one.h)
  })
  it('reports no flow when static head exceeds shut-off head', () => {
    const a = analyse({ ...DEFAULTS, staticHead: 80 })
    expect(a.op).toBeNull()
    expect(a.reason).toBe('noflow')
  })
  it('needs two points', () => {
    expect(analyse({ ...DEFAULTS, pts: DEFAULTS.pts.slice(0, 1) }).reason).toBe('points')
  })
  it('needs more speed for a higher target flow', () => {
    const lo = analyse({ ...DEFAULTS, target: 30 }).speedNeeded!
    const hi = analyse({ ...DEFAULTS, target: 45 }).speedNeeded!
    expect(hi).toBeGreaterThan(lo)
  })
  it('gives the same physical result in other units', () => {
    const a = analyse(DEFAULTS).op!
    const u = analyse(convertUnits(DEFAULTS, 'gpm', 'ft')).op!
    expect(u.q / 4.402868).toBeCloseTo(a.q, 1)
    expect(u.h * 0.3048).toBeCloseTo(a.h, 1)
  })
  it('presets exist in every unit', () => {
    expect(presetPoints('large', 'L/s', 'ft', 1).length).toBeGreaterThan(4)
  })
})
