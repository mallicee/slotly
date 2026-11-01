import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Stats } from '../api/types';
import { Avatar, ErrorBox, Icon, Spinner, StatusBadge } from '../components/ui';
import { useAsync } from '../hooks';
import { fmtDayShort, isoDate, num, parseDate, rub, timeOf } from '../lib/format';

const PERIODS = [7, 30, 90] as const;

export default function Dashboard() {
  const [days, setDays] = useState<number>(30);
  const stats = useAsync(() => api.admin.stats(days), [days]);
  const today = isoDate(new Date());
  const todays = useAsync(() => api.admin.bookings(today, today), [today]);

  return (
    <div className="dashboard">
      <div className="toolbar">
        <div className="segmented" role="radiogroup" aria-label="Период">
          {PERIODS.map((p) => (
            <button key={p} role="radio" aria-checked={days === p} className={days === p ? 'active' : ''} onClick={() => setDays(p)}>
              {p} дней
            </button>
          ))}
        </div>
      </div>

      {stats.error ? (
        <ErrorBox error={stats.error} onRetry={stats.reload} />
      ) : !stats.data ? (
        <Spinner />
      ) : (
        <>
          <div className={`kpis ${stats.loading ? 'refreshing' : ''}`}>
            <Kpi label="Выручка" value={rub(stats.data.revenue)} delta={delta(stats.data.revenue, stats.data.revenue_prev)} />
            <Kpi label="Визиты" value={num(stats.data.bookings)} delta={delta(stats.data.bookings, stats.data.bookings_prev)} />
            <Kpi label="Средний чек" value={rub(stats.data.avg_check)} />
            <Kpi label="Новые клиенты" value={num(stats.data.new_clients)} />
            <Kpi label="Отмены и неявки" value={`${Math.round(stats.data.cancel_rate * 100)}%`} hint="от всех записей" />
          </div>

          <div className="grid-2">
            <section className="card chart-card">
              <div className="card-head">
                <h2>Выручка по дням</h2>
                <span className="muted">за {days} дней</span>
              </div>
              <RevenueChart data={stats.data.by_day} />
            </section>

            <section className="card">
              <div className="card-head">
                <h2>Сегодня</h2>
                <Link to="/admin/calendar" className="link">Календарь →</Link>
              </div>
              {todays.loading ? <Spinner /> : todays.data && todays.data.length ? (
                <ul className="today-list">
                  {todays.data.map((b) => (
                    <li key={b.id}>
                      <span className="today-time">{timeOf(b.start)}</span>
                      <span className="today-main">
                        <strong>{b.client_name}</strong>
                        <small>{b.service_name} · {b.master_name}</small>
                      </span>
                      <StatusBadge status={b.status} />
                    </li>
                  ))}
                </ul>
              ) : <p className="muted pad">Сегодня записей нет.</p>}
            </section>
          </div>

          <div className="grid-2">
            <section className="card">
              <div className="card-head"><h2>Загрузка мастеров</h2></div>
              <ul className="load-list">
                {stats.data.masters.map((m) => (
                  <li key={m.id}>
                    <Avatar name={m.name} color={m.color} size={34} />
                    <div className="load-main">
                      <div className="load-row"><strong>{m.name}</strong><span>{Math.round(m.utilization * 100)}%</span></div>
                      <div className="bar"><span style={{ width: `${Math.min(100, m.utilization * 100)}%`, background: m.color }} /></div>
                    </div>
                    <span className="load-rev">{rub(m.revenue)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="card">
              <div className="card-head"><h2>Топ услуг</h2></div>
              <TopServices data={stats.data.top_services} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function delta(cur: number, prev: number): number | null {
  if (!prev) return null;
  const d = (cur - prev) / prev;
  return Math.abs(d) < 0.005 ? null : d;
}

function Kpi({ label, value, delta: d, hint }: { label: string; value: string; delta?: number | null; hint?: string }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value">{value}</strong>
      {d !== undefined && d !== null ? (
        <span className={`kpi-delta ${d >= 0 ? 'up' : 'down'}`}>
          <Icon name={d >= 0 ? 'arrowUp' : 'arrowDown'} size={13} />
          {Math.abs(Math.round(d * 100))}% к прошлому периоду
        </span>
      ) : (
        <span className="kpi-delta muted">{hint ?? ' '}</span>
      )}
    </div>
  );
}

function TopServices({ data }: { data: Stats['top_services'] }) {
  const max = Math.max(1, ...data.map((s) => s.revenue));
  return (
    <ul className="top-list">
      {data.map((s, i) => (
        <li key={s.name}>
          <span className="top-rank">{i + 1}</span>
          <div className="load-main">
            <div className="load-row"><strong>{s.name}</strong><span>{rub(s.revenue)}</span></div>
            <div className="bar"><span style={{ width: `${(s.revenue / max) * 100}%` }} /></div>
          </div>
          <span className="load-rev muted">{s.bookings} виз.</span>
        </li>
      ))}
    </ul>
  );
}

/** Dependency-free SVG bar chart with hover tooltip. */
function RevenueChart({ data }: { data: Stats['by_day'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 220;
  const pad = { top: 12, right: 8, bottom: 26, left: 48 };
  const max = useMemo(() => niceMax(Math.max(1, ...data.map((d) => d.revenue))), [data]);
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const bw = innerW / data.length;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const labelEvery = Math.ceil(data.length / 8);
  const h = hover !== null ? data[hover] : null;

  return (
    <div className="chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Выручка по дням">
        {ticks.map((t) => {
          const y = pad.top + innerH - (t / max) * innerH;
          return (
            <g key={t}>
              <line x1={pad.left} x2={W - pad.right} y1={y} y2={y} className="grid-line" />
              <text x={pad.left - 8} y={y + 4} className="axis" textAnchor="end">{t >= 1000 ? `${Math.round(t / 1000)}к` : t}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const bh = (d.revenue / max) * innerH;
          const x = pad.left + i * bw;
          const dt = parseDate(d.date);
          const weekend = dt.getDay() === 0 || dt.getDay() === 6;
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)}>
              <rect x={x} y={pad.top} width={bw} height={innerH} fill="transparent" />
              <rect
                x={x + bw * 0.18}
                y={pad.top + innerH - bh}
                width={Math.max(1, bw * 0.64)}
                height={bh}
                rx={Math.min(4, bw * 0.2)}
                className={`bar-rect ${weekend ? 'weekend' : ''} ${hover === i ? 'hover' : ''}`}
              />
              {i % labelEvery === 0 && (
                <text x={x + bw / 2} y={H - 8} className="axis" textAnchor="middle">{fmtDayShort(dt)}</text>
              )}
            </g>
          );
        })}
      </svg>
      {h && hover !== null && (
        <div className="tooltip" style={{ left: `${((pad.left + (hover + 0.5) * bw) / W) * 100}%` }}>
          <strong>{rub(h.revenue)}</strong>
          <span>{fmtDayShort(parseDate(h.date))} · {h.bookings} виз.</span>
        </div>
      )}
    </div>
  );
}

function niceMax(v: number): number {
  const exp = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * exp >= v) return m * exp;
  return 10 * exp;
}
