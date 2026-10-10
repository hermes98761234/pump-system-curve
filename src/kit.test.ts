import { describe, expect, it } from 'vitest'
import { COMMON_UK, decodeState, encodeState, fmt, makeTr, toCsv } from './kitlib'

describe('kit helpers', () => {
  it('round-trips state through the share link encoding, including unicode', () => {
    const v = { a: 1, b: [1, 2, 3], s: 'Привіт ✓' }
    expect(decodeState(encodeState(v))).toEqual(v)
  })
  it('quotes CSV cells', () => {
    expect(toCsv([['a', 'b,c'], [1, 'x"y']])).toBe('a,"b,c"\n1,"x""y"\n')
  })
  it('formats significant digits', () => {
    expect(fmt(1234.5678, 4)).toBe('1235')
    expect(fmt(0.012345, 3)).toBe('0.0123')
    expect(fmt(2, 4)).toBe('2')
    expect(fmt(NaN)).toBe('—')
  })
  it('translates with placeholders', () => {
    const tr = makeTr({ ...COMMON_UK, 'Hi {0}': 'Привіт {0}' })
    expect(tr('uk', 'Hi {0}', 'x')).toBe('Привіт x')
    expect(tr('en', 'Hi {0}', 'x')).toBe('Hi x')
  })
})
