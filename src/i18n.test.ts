import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tr, UK } from './i18n'

/** Literal strings passed to t('…') or N('…') anywhere in src/, excluding tests. */
function usedKeys(dir = 'src'): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...usedKeys(p))
    else if (/\.tsx?$/.test(name) && !name.includes('.test.')) {
      for (const m of readFileSync(p, 'utf8').matchAll(/\b[tN]\(\s*(['"`])((?:(?!\1).)*)\1/g)) out.push(m[2])
    }
  }
  return out
}

describe('i18n', () => {
  it('keeps the same placeholders as the English source', () => {
    const ph = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join()
    for (const [en, uk] of Object.entries(UK)) expect(ph(uk), en).toBe(ph(en))
  })
  it('translates every string the UI uses', () => {
    const keys = usedKeys()
    expect(keys.length).toBeGreaterThan(10)
    expect(keys.filter((k) => !(k in UK))).toEqual([])
  })
  it('substitutes placeholders and falls back to English', () => {
    expect(tr('en', 'Unknown {0}', 5)).toBe('Unknown 5')
    expect(tr('uk', 'Unknown {0}', 5)).toBe('Unknown 5')
  })
})
