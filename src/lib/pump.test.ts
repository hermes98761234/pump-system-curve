import { describe, expect, it } from 'vitest'
import { affinity, atmosphericPressure, combineEff, combineHead, evalPoly, flowFromM3h, flowToM3h, lineLoss, motorSize, npshAvailable, operatingPoint, polyfit2, scaleHead, speedForFlow, vaporPressure } from './pump'

describe('polyfit2', () => {
  it('recovers an exact quadratic', () => {
    const q = [0, 10, 20, 30, 40]
    const c = polyfit2(q, q.map((x) => 40 - 0.01 * x * x + 0.02 * x))
    expect(c[0]).toBeCloseTo(40, 8)
    expect(c[1]).toBeCloseTo(0.02, 8)
    expect(c[2]).toBeCloseTo(-0.01, 8)
  })
  it('degrades for two points and one point', () => {
    const c = polyfit2([0, 10], [30, 20])
    expect(c[1]).toBeCloseTo(-1, 9)
    expect(c[2]).toBe(0)
    expect(polyfit2([5], [7])).toEqual([7, 0, 0])
  })
})

describe('NPSH inputs', () => {
  it('vapour pressure of water', () => {
    expect(vaporPressure(20)).toBeCloseTo(2339, -2)
    expect(vaporPressure(100)).toBeCloseTo(101325, -3)
  })
  it('barometric pressure', () => {
    expect(atmosphericPressure(0)).toBeCloseTo(101325, 6)
    expect(atmosphericPressure(1000)).toBeCloseTo(89875, -1)
  })
  it('NPSHa at sea level from a flooded suction', () => {
    expect(npshAvailable({ tempC: 20, altitude: 0, suctionHead: 0, suctionLoss: 0 })).toBeCloseTo(10.11, 1)
    expect(npshAvailable({ tempC: 20, altitude: 0, suctionHead: 2, suctionLoss: 0.5 })).toBeCloseTo(11.61, 1)
  })
})

describe('operating point', () => {
  const Hp = (q: number) => 40 - 0.01 * q * q
  const Hs = (q: number) => 10 + 0.005 * q * q
  it('finds the intersection analytically', () => {
    const op = operatingPoint(Hp, Hs, 100)!
    expect(op.q).toBeCloseTo(Math.sqrt(2000), 6)
    expect(op.h).toBeCloseTo(10 + 0.005 * 2000, 6)
  })
  it('returns null when the pump cannot overcome the static head', () => {
    expect(operatingPoint(Hp, () => 50, 100)).toBeNull()
  })
  it('series doubles the head, parallel doubles the flow at equal head', () => {
    expect(combineHead(Hp, 'series', 2)(20)).toBeCloseTo(2 * Hp(20), 9)
    expect(combineHead(Hp, 'parallel', 2)(40)).toBeCloseTo(Hp(20), 9)
    expect(combineEff(() => 0.6, 'parallel', 2)(1)).toBe(0.6)
    const single = operatingPoint(Hp, Hs, 100)!
    const par = operatingPoint(combineHead(Hp, 'parallel', 2), Hs, 200)!
    expect(par.q).toBeGreaterThan(single.q)
    expect(par.q).toBeLessThan(2 * single.q)
  })
})

describe('affinity laws', () => {
  it('scale flow, head and power', () => {
    expect(affinity.flow(100, 0.8)).toBeCloseTo(80, 9)
    expect(affinity.head(50, 0.8)).toBeCloseTo(32, 9)
    expect(affinity.power(10, 0.8)).toBeCloseTo(5.12, 9)
    const H = scaleHead(evalPoly([40, 0, -0.01]), 0.8)
    expect(H(0)).toBeCloseTo(25.6, 9)
    expect(H(0.8 * 20)).toBeCloseTo(0.64 * (40 - 0.01 * 400), 9)
  })
  it('finds the speed that delivers a target flow', () => {
    const H0 = evalPoly([40, 0, -0.01])
    const Hs = (q: number) => 10 + 0.005 * q * q
    const r = speedForFlow(H0, Hs, 30)!
    expect(r * r * H0(30 / r)).toBeCloseTo(Hs(30), 6)
    expect(r).toBeLessThan(1)
    expect(speedForFlow(H0, Hs, 200)).toBeNull()
  })
})

describe('misc', () => {
  it('picks the next IEC motor size with a 15 % margin', () => {
    expect(motorSize(4)).toBe(5.5)
    expect(motorSize(1.0)).toBe(1.5)
    expect(motorSize(10000)).toBeNull()
  })
  it('line loss follows Darcy-Weisbach', () => {
    // 100 m of 100 mm steel at 36 m3/h (v = 1.273 m/s): about 1.5 to 1.8 m of head
    const h = lineLoss({ length: 100, diameterMm: 100, roughnessMm: 0.045, kSum: 0 }, 0.01, 20)
    expect(h).toBeGreaterThan(1.4)
    expect(h).toBeLessThan(2.0)
    expect(lineLoss({ length: 100, diameterMm: 100, roughnessMm: 0.045, kSum: 0 }, 0, 20)).toBe(0)
  })
  it('converts flow units', () => {
    expect(flowToM3h('L/s', 1)).toBeCloseTo(3.6, 9)
    expect(flowFromM3h('gpm', 1)).toBeCloseTo(4.4029, 3)
  })
})
