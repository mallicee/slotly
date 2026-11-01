import { useEffect, useState, type CSSProperties } from 'react';
import { api } from '../api/client';
import type { Booking } from '../api/types';
import { Avatar, ErrorBox, Icon, Spinner } from '../components/ui';
import { useAsync } from '../hooks';
import { toMinutes } from '../lib/availability';
import { addDays, fmtRelativeDay, isoDate, parseDate, rub, timeOf, weekday } from '../lib/format';
import { BookingDetails } from './BookingDetails';

const DAY_START = 9 * 60;
const DAY_END = 21 * 60;
const PX_PER_MIN = 1.3;

export default function CalendarPage() {
  const [date, setDate] = useState(() => isoDate(new Date()));
  const masters = useAsync(() => api.masters(), []);
  const bookings = useAsync(() => api.admin.bookings(date, date), [date]);
  const [open, setOpen] = useState<Booking | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const shift = (n: number) => setDate((d) => isoDate(addDays(parseDate(d), n)));
  const isToday = date === isoDate(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => DAY_START + i * 60);
  const visible = (bookings.data ?? []).filter((b) => b.status !== 'cancelled');
  const dayRevenue = visible.reduce((s, b) => s + b.price, 0);

  return (
    <div className="calendar-page">
      <div className="toolbar">
        <div className="date-nav">
          <button className="icon-btn" onClick={() => shift(-1)} aria-label="Предыдущий день"><Icon name="chevronLeft" /></button>
          <button className="btn btn-secondary btn-sm" onClick={() => setDate(isoDate(new Date()))} disabled={isToday}>Сегодня</button>
          <button className="icon-btn" onClick={() => shift(1)} aria-label="Следующий день"><Icon name="chevronRight" /></button>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Дата" />
          <strong className="date-title">{fmtRelativeDay(parseDate(date), now)}</strong>
        </div>
        {bookings.data && (
          <span className="muted">{visible.length} записей · {rub(dayRevenue)}</span>
        )}
      </div>

      {masters.error || bookings.error ? (
        <ErrorBox error={(masters.error ?? bookings.error)!} onRetry={() => { masters.reload(); bookings.reload(); }} />
      ) : !masters.data || !bookings.data ? (
        <Spinner />
      ) : (
        <div className={`calendar card ${bookings.loading ? 'refreshing' : ''}`}>
          <div className="cal-head" style={{ gridTemplateColumns: `56px repeat(${masters.data.length}, minmax(150px, 1fr))` }}>
            <span />
            {masters.data.map((m) => {
              const count = visible.filter((b) => b.master_id === m.id).length;
              const off = !m.work_days.includes(weekday(parseDate(date)));
              return (
                <div key={m.id} className="cal-master">
                  <Avatar name={m.name} color={m.color} size={30} />
                  <span><strong>{m.name}</strong><small>{off ? 'выходной' : count ? `${count} зап.` : 'нет записей'}</small></span>
                </div>
              );
            })}
          </div>
          <div className="cal-body" style={{ gridTemplateColumns: `56px repeat(${masters.data.length}, minmax(150px, 1fr))`, height: (DAY_END - DAY_START) * PX_PER_MIN }}>
            <div className="cal-hours">
              {hours.map((h) => (
                <span key={h} style={{ top: (h - DAY_START) * PX_PER_MIN }}>{String(h / 60).padStart(2, '0')}:00</span>
              ))}
            </div>
            {masters.data.map((m) => (
              <div key={m.id} className={`cal-col ${m.work_days.includes(weekday(parseDate(date))) ? '' : 'off'}`}>
                {hours.map((h) => <span key={h} className="cal-line" style={{ top: (h - DAY_START) * PX_PER_MIN }} />)}
                {(bookings.data ?? []).filter((b) => b.master_id === m.id).map((b) => {
                  const start = toMinutes(timeOf(b.start));
                  const end = toMinutes(timeOf(b.end));
                  const height = (end - start) * PX_PER_MIN;
                  return (
                    <button
                      key={b.id}
                      className={`cal-event status-${b.status} ${height < 50 ? 'compact' : ''}`}
                      style={{ top: (start - DAY_START) * PX_PER_MIN, height: height - 2, '--c': m.color } as CSSProperties}
                      onClick={() => setOpen(b)}
                    >
                      <span className="ev-time">{timeOf(b.start)}–{timeOf(b.end)}</span>
                      <strong>{b.client_name}</strong>
                      <span className="ev-service">{b.service_name}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            {isToday && nowMin >= DAY_START && nowMin <= DAY_END && (
              <div className="now-line" style={{ top: (nowMin - DAY_START) * PX_PER_MIN }}><span /></div>
            )}
          </div>
        </div>
      )}

      {open && (
        <BookingDetails
          booking={open}
          onClose={() => setOpen(null)}
          onChange={(u) => bookings.setData((list) => list?.map((b) => (b.id === u.id ? u : b)))}
        />
      )}
    </div>
  );
}
