import { useRef } from 'react'
import { exportSvg, fmt, niceMax, niceTicks, type T } from './kitlib'

export interface Series {
  label: string
  color: string
  pts: [number, number][]
  axis?: 'y' | 'y2'
  dash?: string
  width?: number
  dots?: boolean
}
export interface Marker {
  x: number
  y: number
  label?: string
  color?: string
  axis?: 'y' | 'y2'
}

export default function LineChart(p: {
  series: Series[]
  markers?: Marker[]
  xLabel: string
  yLabel: string
  y2Label?: string
  xMax?: number
  yMax?: number
  y2Max?: number
  yMin?: number
  title: string
  t: T
  exportName?: string
}) {
  const ref = useRef<SVGSVGElement>(null)
  const W = 760
  const H = 320
  const hasY2 = p.series.some((s) => s.axis === 'y2')
  const m = { l: 58, r: hasY2 ? 52 : 18, t: 14, b: 40 }
  const all = (axis: 'y' | 'y2') => p.series.filter((s) => (s.axis ?? 'y') === axis).flatMap((s) => s.pts)
  const xMax = p.xMax ?? niceMax(Math.max(1e-9, ...p.series.flatMap((s) => s.pts.map((q) => q[0]))))
  const yMin = p.yMin ?? 0
  const yMax = p.yMax ?? niceMax(Math.max(1e-9, ...all('y').map((q) => q[1])))
  const y2Max = p.y2Max ?? niceMax(Math.max(1e-9, ...all('y2').map((q) => q[1])))
  const X = (x: number) => m.l + (x / xMax) * (W - m.l - m.r)
  const Y = (y: number, axis: 'y' | 'y2' = 'y') => {
    const [lo, hi] = axis === 'y' ? [yMin, yMax] : [0, y2Max]
    return H - m.b - ((y - lo) / (hi - lo)) * (H - m.t - m.b)
  }
  const clipId = 'clip' + p.title.replace(/\W/g, '').slice(0, 12)
  return (
    <div>
      <svg ref={ref} className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={p.title}>
        <defs>
          <clipPath id={clipId}>
            <rect x={m.l} y={m.t} width={W - m.l - m.r} height={H - m.t - m.b} />
          </clipPath>
        </defs>
        {niceTicks(yMin, yMax).map((v) => (
          <g key={'y' + v}>
            <line className="grid" x1={m.l} x2={W - m.r} y1={Y(v)} y2={Y(v)} />
            <text x={m.l - 6} y={Y(v) + 4} textAnchor="end">{fmt(v, 3)}</text>
          </g>
        ))}
        {hasY2 &&
          niceTicks(0, y2Max).map((v) => (
            <text key={'y2' + v} x={W - m.r + 6} y={Y(v, 'y2') + 4}>{fmt(v, 3)}</text>
          ))}
        {niceTicks(0, xMax).map((v) => (
          <g key={'x' + v}>
            <line className="grid" x1={X(v)} x2={X(v)} y1={m.t} y2={H - m.b} />
            <text x={X(v)} y={H - m.b + 14} textAnchor="middle">{fmt(v, 3)}</text>
          </g>
        ))}
        <line className="axis" x1={m.l} x2={W - m.r} y1={H - m.b} y2={H - m.b} />
        <line className="axis" x1={m.l} x2={m.l} y1={m.t} y2={H - m.b} />
        <g clipPath={`url(#${clipId})`}>
          {p.series.map((s) => (
            <g key={s.label}>
              <polyline
                points={s.pts.map((q) => `${X(q[0]).toFixed(1)},${Y(q[1], s.axis).toFixed(1)}`).join(' ')}
                fill="none"
                stroke={s.color}
                strokeWidth={s.width ?? 2.5}
                strokeDasharray={s.dash}
                strokeLinejoin="round"
              />
              {s.dots ? s.pts.map((q, i) => <circle key={i} cx={X(q[0])} cy={Y(q[1], s.axis)} r={3.2} fill={s.color} />) : null}
            </g>
          ))}
        </g>
        {(p.markers ?? []).map((k, i) => (
          <g key={i}>
            <circle cx={X(k.x)} cy={Y(k.y, k.axis)} r={6} fill="var(--panel)" stroke={k.color ?? 'var(--err)'} strokeWidth={3} />
            {k.label ? (
              <text x={Math.min(X(k.x) + 10, W - 110)} y={Y(k.y, k.axis) - 12} style={{ paintOrder: "stroke", stroke: "var(--chart-bg)", strokeWidth: 4, fontWeight: 600 }}>{k.label}</text>
            ) : null}
          </g>
        ))}
        <text x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle">{p.xLabel}</text>
        <text x={12} y={(m.t + H - m.b) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(m.t + H - m.b) / 2})`}>{p.yLabel}</text>
        {hasY2 ? <text x={W - 10} y={(m.t + H - m.b) / 2} textAnchor="middle" transform={`rotate(90 ${W - 10} ${(m.t + H - m.b) / 2})`}>{p.y2Label}</text> : null}
      </svg>
      <div className="legend">
        {p.series.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        {p.exportName ? (
          <button className="small" style={{ marginLeft: 'auto' }} onClick={() => ref.current && exportSvg(ref.current, p.exportName!)}>
            {p.t('Export SVG')}
          </button>
        ) : null}
      </div>
    </div>
  )
}
