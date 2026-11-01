import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { STATUS_LABEL, type Booking, type Status } from '../api/types';
import { Empty, ErrorBox, Icon, Spinner, StatusBadge } from '../components/ui';
import { useAsync, useDebounced } from '../hooks';
import { addDays, fmtDayShort, fmtWeekdayShort, isoDate, parseDateTime, rub, timeOf } from '../lib/format';
import { prettyPhone } from '../lib/phone';
import { BookingDetails } from './BookingDetails';

const RANGES = {
  upcoming: { label: 'Предстоящие', from: 0, to: 14 },
  today: { label: 'Сегодня', from: 0, to: 0 },
  past: { label: 'Прошедшие 30 дней', from: -30, to: -1 },
} as const;
type RangeKey = keyof typeof RANGES;

export default function BookingsPage() {
  const [range, setRange] = useState<RangeKey>('upcoming');
  const [status, setStatus] = useState<Status | 'all'>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Booking | null>(null);
  const q = useDebounced(query.trim().toLowerCase());

  const { from, to } = RANGES[range];
  const today = new Date();
  const list = useAsync(() => api.admin.bookings(isoDate(addDays(today, from)), isoDate(addDays(today, to))), [range]);

  const rows = useMemo(() => {
    let r = list.data ?? [];
    if (status !== 'all') r = r.filter((b) => b.status === status);
    if (q) r = r.filter((b) => `${b.client_name} ${b.client_phone} ${b.service_name} ${b.master_name}`.toLowerCase().includes(q));
    return range === 'past' ? [...r].reverse() : r;
  }, [list.data, status, q, range]);

  const total = rows.filter((b) => b.status !== 'cancelled' && b.status !== 'no_show').reduce((s, b) => s + b.price, 0);

  return (
    <div>
      <div className="toolbar wrap">
        <div className="segmented">
          {(Object.keys(RANGES) as RangeKey[]).map((k) => (
            <button key={k} className={range === k ? 'active' : ''} onClick={() => setRange(k)}>{RANGES[k].label}</button>
          ))}
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as Status | 'all')} aria-label="Статус">
          <option value="all">Все статусы</option>
          {(Object.keys(STATUS_LABEL) as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <label className="search">
          <Icon name="search" size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Клиент, телефон, услуга…" aria-label="Поиск" />
        </label>
      </div>

      {list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : !list.data ? <Spinner /> : (
        <section className={`card ${list.loading ? 'refreshing' : ''}`}>
          <div className="card-head">
            <h2>{rows.length} {rows.length === 1 ? 'запись' : 'записей'}</h2>
            <span className="muted">на {rub(total)}</span>
          </div>
          {rows.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Когда</th><th>Клиент</th><th>Услуга</th><th>Мастер</th><th className="num">Сумма</th><th>Статус</th></tr>
                </thead>
                <tbody>
                  {rows.map((b) => {
                    const d = parseDateTime(b.start);
                    return (
                      <tr key={b.id} onClick={() => setOpen(b)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(b)}>
                        <td className="nowrap"><strong>{fmtDayShort(d)}</strong> <span className="muted">{fmtWeekdayShort(d)}, {timeOf(b.start)}</span></td>
                        <td><strong>{b.client_name}</strong><small className="muted block">{prettyPhone(b.client_phone)}</small></td>
                        <td>{b.service_name}</td>
                        <td>{b.master_name}</td>
                        <td className="num">{rub(b.price)}</td>
                        <td><StatusBadge status={b.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <Empty title="Ничего не найдено" text="Попробуйте изменить фильтры." />}
        </section>
      )}

      {open && (
        <BookingDetails
          booking={open}
          onClose={() => setOpen(null)}
          onChange={(u) => list.setData((l) => l?.map((b) => (b.id === u.id ? u : b)))}
        />
      )}
    </div>
  );
}
