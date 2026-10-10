import { useMemo } from 'react'
import { NumField, Section, SelectField, Shell, Stats, Verdict, type Tone } from './kit'
import LineChart from './LineChart'
import { download, fmt, toCsv, usePersisted, usePrefs } from './kitlib'

import { FLOW_UNITS } from './lib/pipe'
import { MATERIAL_LABEL, PRESET_LABEL, tr } from './i18n'
import { analyse, convertUnits, DEFAULTS, presetPoints, PRESETS, type Inputs, type Pt } from './model'
import type { Arrangement } from './lib/pump'

const KEY = 'pump-system-curve:v1'
const MATS = ['steel', 'galvanized', 'cast-iron', 'pvc', 'concrete']

function Cell(p: { value: number; label: string; onChange: (v: number) => void }) {
  return <input type="number" step="any" min={0} aria-label={p.label} value={p.value} onChange={(e) => p.onChange(Math.max(0, Number(e.target.value) || 0))} style={{ width: '100%' }} />
}

export default function App() {
  const { prefs, setPrefs, t } = usePrefs(KEY, tr)
  const [inp, update, reset] = usePersisted<Inputs>(KEY, DEFAULTS)
  const a = useMemo(() => analyse(inp), [inp])
  const setPt = (id: number, patch: Partial<Pt>) => update((s) => ({ ...s, pts: s.pts.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
  const fu = inp.flowUnit
  const hu = inp.headUnit

  const warns: { tone: Tone; text: string }[] = []
  if (a.ok && a.op) {
    if (a.beyondData) warns.push({ tone: 'warn', text: t('The operating point is beyond the entered curve data (extrapolated).') })
    if (a.bepRatio !== null) {
      const pct = Math.round(a.bepRatio * 100)
      const good = a.bepRatio >= 0.7 && a.bepRatio <= 1.2
      warns.push({ tone: good ? 'ok' : 'warn', text: t('Running at {0} % of the best-efficiency flow.', pct) + ' ' + t(good ? 'Efficient operating range (70 to 120 % of BEP).' : 'Outside the preferred range (70 to 120 % of BEP): expect wear and recirculation.') })
    }
    if (a.npshMargin !== null && a.npshrOp !== null) {
      const bad = a.npshMargin < 0.5 || a.npshaOp! < 1.3 * a.npshrOp
      warns.push({ tone: bad ? 'err' : 'ok', text: bad ? t('NPSH margin is only {0}: cavitation risk. Aim for at least 0.5 m or 1.3 times NPSHr.', `${fmt(a.npshMargin, 3)} ${hu}`) : t('NPSH margin is {0}: sufficient.', `${fmt(a.npshMargin, 3)} ${hu}`) })
    }
  }

  const exportCsv = () =>
    download('pump-curves.csv', toCsv([[`Q (${fu})`, `${t('Pump curve')} (${hu})`, `${t('System curve')} (${hu})`, t('Efficiency (%)'), `NPSHr (${hu})`, `NPSHa (${hu})`], ...a.curve.map((c) => [c.q, c.hp ?? '', c.hs, c.eta ?? '', c.npshr ?? '', c.npsha])]), 'text/csv')

  const side = (
    <>
      <Section title={t('Pump')}>
        <div className="field">
          <label>{t('Load preset')}</label>
          <select value="" onChange={(e) => e.target.value && update((s) => ({ ...s, pts: presetPoints(e.target.value, s.flowUnit, s.headUnit, s.nextId), nextId: s.nextId + 20 }))}>
            <option value="">{t('Choose a preset…')}</option>
            {Object.keys(PRESETS).map((k) => (
              <option key={k} value={k}>{t(PRESET_LABEL[k])}</option>
            ))}
          </select>
        </div>
        <div className="grid2">
          <SelectField label={t('Flow unit')} value={fu} onChange={(v) => update((s) => convertUnits(s, v, s.headUnit))} options={Object.keys(FLOW_UNITS).filter((u) => ['m³/h', 'L/s', 'gpm'].includes(u)).map((u) => [u, u])} />
          <SelectField label={t('Head unit')} value={hu} onChange={(v) => update((s) => convertUnits(s, s.flowUnit, v))} options={[['m', 'm'], ['ft', 'ft']]} />
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>{t('Flow')} ({fu})</th>
              <th>{t('Head')} ({hu})</th>
              <th>{t('Efficiency %')}</th>
              <th>NPSHr</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {inp.pts.map((p) => (
              <tr key={p.id}>
                <td><Cell label={t('Flow')} value={p.q} onChange={(v) => setPt(p.id, { q: v })} /></td>
                <td><Cell label={t('Head')} value={p.h} onChange={(v) => setPt(p.id, { h: v })} /></td>
                <td><Cell label={t('Efficiency %')} value={p.eta} onChange={(v) => setPt(p.id, { eta: Math.min(100, v) })} /></td>
                <td><Cell label={t('NPSH required')} value={p.npshr} onChange={(v) => setPt(p.id, { npshr: v })} /></td>
                <td><button className="small danger" aria-label={t('Remove')} onClick={() => update((s) => ({ ...s, pts: s.pts.filter((x) => x.id !== p.id) }))}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">{t('Leave efficiency or NPSHr at 0 if unknown. At least two points are needed.')}</p>
        <button className="small" onClick={() => update((s) => { const l = s.pts[s.pts.length - 1]; return { ...s, nextId: s.nextId + 1, pts: [...s.pts, { id: s.nextId, q: l ? Number((l.q * 1.2 + 1).toPrecision(3)) : 0, h: l ? Number((l.h * 0.7).toPrecision(3)) : 0, eta: 0, npshr: 0 }] } })}>{t('Add point')}</button>
        <div style={{ height: 8 }} />
        <NumField t={t} label={t('Speed (% of rated)')} value={inp.speed} min={10} max={150} onChange={(v) => update({ speed: v })} />
        <div className="grid2">
          <SelectField<Arrangement> label={t('Arrangement')} value={inp.arrangement} onChange={(v) => update({ arrangement: v })} options={[['single', t('Single pump')], ['series', t('Pumps in series')], ['parallel', t('Pumps in parallel')]]} />
          {inp.arrangement !== 'single' ? <NumField t={t} label={t('Number of pumps')} value={inp.count} min={2} max={8} step={1} onChange={(v) => update({ count: Math.round(v) })} /> : null}
        </div>
      </Section>
      <Section title={t('System')}>
        <NumField t={t} label={t('Static head (discharge level minus suction level)')} unit={hu} value={inp.staticHead} onChange={(v) => update({ staticHead: v })} />
        <NumField t={t} label={t('Delivery pressure (gauge)')} unit="kPa" value={inp.delivPressure} min={0} onChange={(v) => update({ delivPressure: v })} />
        <h3>{t('Discharge pipe')}</h3>
        <div className="grid2">
          <NumField t={t} label={t('Length (m)')} value={inp.dLength} min={0} onChange={(v) => update({ dLength: v })} />
          <NumField t={t} label={t('Diameter (mm)')} value={inp.dDiameter} min={1} onChange={(v) => update({ dDiameter: v })} />
          <NumField t={t} label={t('Fittings total K')} value={inp.dK} min={0} onChange={(v) => update({ dK: v })} />
          <SelectField label={t('Material')} value={inp.dMaterial} onChange={(v) => update({ dMaterial: v })} options={MATS.map((m): [string, string] => [m, t(MATERIAL_LABEL[m])])} />
        </div>
        <h3>{t('Suction pipe')}</h3>
        <div className="grid2">
          <NumField t={t} label={t('Length (m)')} value={inp.sLength} min={0} onChange={(v) => update({ sLength: v })} />
          <NumField t={t} label={t('Diameter (mm)')} value={inp.sDiameter} min={1} onChange={(v) => update({ sDiameter: v })} />
          <NumField t={t} label={t('Fittings total K')} value={inp.sK} min={0} onChange={(v) => update({ sK: v })} />
        </div>
        <NumField t={t} label={t('Liquid level above pump (negative = lift)')} unit={hu} value={inp.suctionHead} onChange={(v) => update({ suctionHead: v })} />
        <div className="grid2">
          <NumField t={t} label={t('Water temperature')} unit="°C" value={inp.temp} min={1} max={100} onChange={(v) => update({ temp: v })} />
          <NumField t={t} label={t('Altitude')} unit="m" value={inp.altitude} min={-400} max={5000} onChange={(v) => update({ altitude: v })} />
        </div>
        <NumField t={t} label={t('Target flow')} unit={fu} value={inp.target} min={0} onChange={(v) => update({ target: v })} />
      </Section>
    </>
  )

  const op = a.op
  return (
    <Shell title={t('Pump System Curve')} tagline={t('Find where a pump meets your piping: operating point, NPSH, power.')} repo="pump-system-curve" prefs={prefs} setPrefs={setPrefs} t={t} state={inp} onReset={reset} side={side}
      footer={t('Affinity laws: Q ∝ N, H ∝ N², P ∝ N³. Curves between the entered points are quadratic fits.')}>
      {!a.ok ? (
        <Verdict tone="err">{t('Enter at least two curve points.')}</Verdict>
      ) : !op ? (
        <>
          <div className="stats" />
          <Verdict tone="err">{t('The pump cannot overcome the static head: no flow.')}</Verdict>
        </>
      ) : (
        <>
          <Stats
            items={[
              { label: t('Operating point'), value: fmt(op.q, 4), unit: fu },
              { label: t('Head'), value: fmt(op.h, 4), unit: hu },
              { label: t('Efficiency'), value: a.etaOp === null ? '—' : fmt(a.etaOp, 3), unit: '%' },
              { label: t('Shaft power'), value: a.shaftKw === null ? '—' : fmt(a.shaftKw, 3), unit: 'kW' },
              { label: t('Motor size (IEC, +15 %)'), value: a.motorKw === null ? '—' : fmt(a.motorKw, 3), unit: 'kW' },
              { label: t('NPSH available'), value: fmt(a.npshaOp ?? 0, 3), unit: hu },
              { label: t('NPSH margin'), value: a.npshMargin === null ? '—' : fmt(a.npshMargin, 3), unit: hu, tone: a.npshMargin === null ? undefined : a.npshMargin < 0.5 ? 'err' : 'ok' },
            ]}
          />
          <div className="box">
            <Verdict tone="ok">{t('Operating point: {0} {1} at {2} {3}.', fmt(op.q, 4), fu, fmt(op.h, 4), hu)}</Verdict>
            {warns.map((w, i) => <Verdict key={i} tone={w.tone}>{w.text}</Verdict>)}
            {inp.target > 0 ? (
              a.speedNeeded === null ? <Verdict tone="warn">{t('The target flow cannot be reached by changing speed alone.')}</Verdict> : <p className="hint">{t('Run at {0} % speed for {1} {2}.', fmt(a.speedNeeded, 3), fmt(inp.target, 4), fu)}</p>
            ) : null}
            <p className="hint">{t('Hydraulic power')}: {fmt(a.hydKw ?? 0, 3)} kW{a.perPumpKw !== null && inp.arrangement !== 'single' ? ` · ${t('Per pump')}: ${fmt(a.perPumpKw, 3)} kW` : ''}</p>
          </div>
        </>
      )}
      {a.ok ? (
        <>
          <div className="box">
            <h3>{t('Head vs flow')}</h3>
            <LineChart
              title={t('Head vs flow')} t={t} exportName="pump-system-curve.svg" xLabel={t('Flow ({0})', fu)} yLabel={t('Head ({0})', hu)} y2Label={t('Efficiency (%)')} y2Max={100}
              series={[
                { label: t('Pump curve'), color: 'var(--accent)', pts: a.curve.filter((c) => c.hp !== null).map((c) => [c.q, c.hp as number]) },
                { label: t('System curve'), color: 'var(--warn)', pts: a.curve.map((c) => [c.q, c.hs]) },
                ...(a.curve.some((c) => c.eta !== null) ? [{ label: t('Efficiency (%)'), color: 'var(--ok)', axis: 'y2' as const, dash: '6 4', width: 2, pts: a.curve.filter((c) => c.eta !== null).map((c): [number, number] => [c.q, c.eta as number]) }] : []),
              ]}
              markers={op ? [{ x: op.q, y: op.h, label: `${fmt(op.q, 3)} ${fu} / ${fmt(op.h, 3)} ${hu}` }] : []}
              xMax={a.qMax}
            />
          </div>
          {a.curve.some((c) => c.npshr !== null) ? (
            <div className="box">
              <h3>{t('NPSH vs flow')}</h3>
              <LineChart
                title={t('NPSH vs flow')} t={t} xLabel={t('Flow ({0})', fu)} yLabel={t('NPSH ({0})', hu)} xMax={a.qMax}
                series={[
                  { label: t('NPSH available'), color: 'var(--ok)', pts: a.curve.map((c) => [c.q, c.npsha]) },
                  { label: t('NPSH required'), color: 'var(--err)', pts: a.curve.map((c) => [c.q, c.npshr ?? 0]) },
                ]}
                markers={op && a.npshaOp !== null ? [{ x: op.q, y: a.npshaOp, color: 'var(--ok)' }] : []}
              />
            </div>
          ) : null}
          <div className="row">
            <button className="small" onClick={exportCsv}>{t('Export CSV')}</button>
            <button className="small" onClick={() => download('pump-system.json', JSON.stringify({ inputs: inp, result: { ...a, curve: undefined } }, null, 2), 'application/json')}>{t('Export JSON')}</button>
            <button className="small" onClick={() => window.print()}>{t('Print')}</button>
          </div>
        </>
      ) : null}
    </Shell>
  )
}
