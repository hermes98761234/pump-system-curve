import { useId, useState, type ReactNode } from 'react'
import { shareUrl, type Lang, type Prefs, type T, type Theme } from './kitlib'

export function NumField(p: {
  label: string
  value: number
  onChange: (v: number) => void
  unit?: string
  min?: number
  max?: number
  step?: number | 'any'
  hint?: string
  t?: T
}) {
  const id = useId()
  const [text, setText] = useState(String(p.value))
  const [seen, setSeen] = useState(p.value)
  if (seen !== p.value) {
    // The value changed from outside (reset, unit change, share link): show it unless the text already means it.
    setSeen(p.value)
    if (Number(text) !== p.value || text.trim() === '') setText(String(p.value))
  }
  const n = Number(text)
  const bad = text.trim() === '' || !Number.isFinite(n) || (p.min !== undefined && n < p.min) || (p.max !== undefined && n > p.max)
  return (
    <div className="field">
      <label htmlFor={id}>
        {p.label}
        {p.unit ? <span className="unit"> ({p.unit})</span> : null}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        className={bad ? 'bad' : ''}
        value={text}
        min={p.min}
        max={p.max}
        step={p.step ?? 'any'}
        title={bad ? (p.t ? p.t('Check this value') : 'Check this value') : p.hint}
        aria-invalid={bad}
        onChange={(e) => {
          setText(e.target.value)
          const x = Number(e.target.value)
          const ok = e.target.value.trim() !== '' && Number.isFinite(x) && (p.min === undefined || x >= p.min) && (p.max === undefined || x <= p.max)
          if (ok) p.onChange(x)
        }}
      />
    </div>
  )
}

export function SelectField<V extends string>(p: { label: string; value: V; options: [V, string][]; onChange: (v: V) => void }) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{p.label}</label>
      <select id={id} value={p.value} onChange={(e) => p.onChange(e.target.value as V)}>
        {p.options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  )
}

export function CheckField(p: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const id = useId()
  return (
    <div className="field check">
      <input id={id} type="checkbox" checked={p.value} onChange={(e) => p.onChange(e.target.checked)} />
      <label htmlFor={id}>{p.label}</label>
    </div>
  )
}

export function Section(p: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="section">
      <div className="row">
        <h3>{p.title}</h3>
        <span className="spacer" />
        {p.actions}
      </div>
      {p.children}
    </section>
  )
}

export type Tone = 'ok' | 'warn' | 'err' | undefined

export function Stats(p: { items: { label: string; value: string; unit?: string; tone?: Tone }[] }) {
  return (
    <div className="stats">
      {p.items.map((s) => (
        <div key={s.label} className={`stat ${s.tone ?? ''}`}>
          <div className="stat-label">{s.label}</div>
          <div className="stat-value">
            {s.value}
            {s.unit ? <span className="stat-unit"> {s.unit}</span> : null}
          </div>
        </div>
      ))}
    </div>
  )
}

export function Verdict(p: { tone: Tone; children: ReactNode }) {
  return <p className={`verdict ${p.tone ?? ''}`}>{p.children}</p>
}

export function Shell(p: {
  title: string
  tagline: string
  repo: string
  prefs: Prefs
  setPrefs: (p: Prefs) => void
  t: T
  state: unknown
  onReset: () => void
  side: ReactNode
  children: ReactNode
  footer?: string
}) {
  const { t, prefs } = p
  const [copied, setCopied] = useState(false)
  return (
    <div className="app">
      <header className="toolbar">
        <span className="brand">{p.title}</span>
        <span className="hint tagline">{p.tagline}</span>
        <span className="spacer" />
        <label className="inline">
          {t('Language')}
          <select value={prefs.lang} onChange={(e) => p.setPrefs({ ...prefs, lang: e.target.value as Lang })}>
            <option value="en">English</option>
            <option value="uk">Українська</option>
          </select>
        </label>
        <label className="inline">
          {t('Theme')}
          <select value={prefs.theme} onChange={(e) => p.setPrefs({ ...prefs, theme: e.target.value as Theme })}>
            <option value="auto">{t('System')}</option>
            <option value="light">{t('Light')}</option>
            <option value="dark">{t('Dark')}</option>
          </select>
        </label>
        <button
          className="small"
          onClick={() => {
            const url = shareUrl(p.state)
            history.replaceState(null, '', url)
            void navigator.clipboard?.writeText(url).catch(() => {})
            setCopied(true)
            setTimeout(() => setCopied(false), 1800)
          }}
        >
          {copied ? t('Link copied') : t('Copy link')}
        </button>
        <button className="small" onClick={p.onReset}>
          {t('Reset')}
        </button>
      </header>
      <div className="body">
        <aside className="side">
          <div className="panel">{p.side}</div>
        </aside>
        <main className="main">{p.children}</main>
      </div>
      <p className="hint foot">
        {p.footer ? p.footer + ' ' : ''}
        {t('Runs entirely in your browser. Nothing is uploaded.')}{' '}
        <a href={`https://github.com/hermes98761234/${p.repo}`}>{t('Source on GitHub')}</a>
      </p>
    </div>
  )
}
