import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { ApiError, type Booking, type Master, type Service } from '../api/types';
import { Avatar, ErrorBox, Icon, Spinner } from '../components/ui';
import { useAsync } from '../hooks';
import {
  addDays, duration, fmtDay, fmtRelativeDay, fmtWeekdayShort, isoDate, parseDate, parseDateTime, plural, rub, timeOf,
} from '../lib/format';
import { downloadIcs } from '../lib/ics';
import { isCompletePhone, maskPhone } from '../lib/phone';

type Step = 'service' | 'master' | 'time' | 'contacts' | 'done';
const STEPS: { id: Step; label: string }[] = [
  { id: 'service', label: 'Услуга' },
  { id: 'master', label: 'Мастер' },
  { id: 'time', label: 'Время' },
  { id: 'contacts', label: 'Контакты' },
];
const DAYS_AHEAD = 14;

export default function BookingPage() {
  const business = useAsync(() => api.business(), []);
  const services = useAsync(() => api.services(), []);
  const [step, setStep] = useState<Step>('service');
  const [service, setService] = useState<Service | null>(null);
  const [master, setMaster] = useState<Master | 'any' | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const masterId = master && master !== 'any' ? master.id : null;
  const stepIndex = STEPS.findIndex((s) => s.id === step);

  useEffect(() => window.scrollTo({ top: 0, behavior: 'smooth' }), [step]);

  const reset = () => {
    setStep('service');
    setService(null);
    setMaster(null);
    setDate(null);
    setTime(null);
    setBooking(null);
    setNotice(null);
  };

  const goTo = (target: Step) => {
    if (STEPS.findIndex((s) => s.id === target) < stepIndex) setStep(target);
  };

  return (
    <div className="booking-page">
      <div className="demo-ribbon">
        <span><b>Демо Slotly.</b> Это страница записи салона. Записи попадают в CRM.</span>
        <Link to="/admin" className="ribbon-link">Открыть админку <Icon name="external" size={14} /></Link>
      </div>

      <header className="salon-hero">
        <div className="salon-hero-inner">
          <div className="salon-logo" aria-hidden="true">N</div>
          <div>
            <h1>{business.data?.name ?? ' '}</h1>
            <p>{business.data?.tagline}</p>
          </div>
          {business.data && (
            <div className="salon-contacts">
              <span><Icon name="pin" size={15} />{business.data.address}</span>
              <a href={`tel:${business.data.phone.replace(/[^\d+]/g, '')}`}><Icon name="phone" size={15} />{business.data.phone}</a>
            </div>
          )}
        </div>
      </header>

      <main className="booking-main">
        <section className="booking-panel" aria-live="polite">
          {step !== 'done' && (
            <ol className="stepper">
              {STEPS.map((s, i) => (
                <li key={s.id} className={i < stepIndex ? 'done' : i === stepIndex ? 'current' : ''}>
                  <button type="button" onClick={() => goTo(s.id)} disabled={i >= stepIndex}>
                    <span className="step-dot">{i < stepIndex ? <Icon name="check" size={13} /> : i + 1}</span>
                    <span className="step-label">{s.label}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}

          {step === 'service' && (
            <ServiceStep
              state={services}
              selected={service}
              onSelect={(s) => {
                setService(s);
                setMaster(null);
                setDate(null);
                setTime(null);
                setStep('master');
              }}
            />
          )}

          {step === 'master' && service && (
            <MasterStep
              service={service}
              selected={master}
              onSelect={(m) => {
                setMaster(m);
                setDate(null);
                setTime(null);
                setStep('time');
              }}
            />
          )}

          {step === 'time' && service && master && (
            <TimeStep
              service={service}
              masterId={masterId}
              date={date}
              time={time}
              notice={notice}
              onDate={(d) => {
                setDate(d);
                setTime(null);
              }}
              onTime={(t) => {
                setTime(t);
                setNotice(null);
                setStep('contacts');
              }}
            />
          )}

          {step === 'contacts' && service && master && date && time && (
            <ContactsStep
              service={service}
              masterId={masterId}
              date={date}
              time={time}
              onBooked={(b) => {
                setBooking(b);
                setStep('done');
              }}
              onConflict={(msg) => {
                setNotice(msg);
                setTime(null);
                setStep('time');
              }}
            />
          )}

          {step === 'done' && booking && business.data && (
            <div className="done">
              <div className="done-icon"><Icon name="check" size={34} /></div>
              <h2>Вы записаны!</h2>
              <p className="muted">Мы отправили детали администратору салона. Ждём вас.</p>
              <dl className="done-card">
                <div><dt>Услуга</dt><dd>{booking.service_name}</dd></div>
                <div><dt>Когда</dt><dd>{fmtRelativeDay(parseDateTime(booking.start))}, {timeOf(booking.start)}–{timeOf(booking.end)}</dd></div>
                <div><dt>Мастер</dt><dd>{booking.master_name}</dd></div>
                <div><dt>Стоимость</dt><dd>{rub(booking.price)}</dd></div>
                <div><dt>Адрес</dt><dd>{business.data.address}</dd></div>
              </dl>
              <div className="done-actions">
                <button className="btn btn-primary" onClick={() => downloadIcs(booking, business.data!)}>
                  <Icon name="download" size={16} /> Добавить в календарь
                </button>
                <button className="btn btn-secondary" onClick={reset}>Записаться ещё</button>
              </div>
              <p className="hint">Загляните в <Link to="/admin">админку</Link>: эта запись уже там.</p>
            </div>
          )}
        </section>

        {step !== 'done' && (
          <Summary service={service} master={master} date={date} time={time} onEdit={goTo} />
        )}
      </main>
    </div>
  );
}

/* ---------- Steps ---------- */

function ServiceStep({ state, selected, onSelect }: {
  state: ReturnType<typeof useAsync<Service[]>>;
  selected: Service | null;
  onSelect: (s: Service) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, Service[]>();
    for (const s of state.data ?? []) map.set(s.category, [...(map.get(s.category) ?? []), s]);
    return [...map.entries()];
  }, [state.data]);

  if (state.loading) return <Spinner />;
  if (state.error) return <ErrorBox error={state.error} onRetry={state.reload} />;
  return (
    <div className="step">
      <h2>Выберите услугу</h2>
      {groups.map(([category, list]) => (
        <section key={category} className="service-group">
          <h3>{category}</h3>
          <div className="service-list">
            {list.map((s) => (
              <button key={s.id} className={`service-card ${selected?.id === s.id ? 'selected' : ''}`} onClick={() => onSelect(s)}>
                <span className="service-name">{s.name}</span>
                <span className="service-meta"><Icon name="clock" size={14} />{duration(s.duration)}</span>
                <span className="service-price">{rub(s.price)}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function MasterStep({ service, selected, onSelect }: {
  service: Service;
  selected: Master | 'any' | null;
  onSelect: (m: Master | 'any') => void;
}) {
  const masters = useAsync(() => api.masters(service.id), [service.id]);
  if (masters.loading) return <Spinner />;
  if (masters.error) return <ErrorBox error={masters.error} onRetry={masters.reload} />;
  return (
    <div className="step">
      <h2>Выберите мастера</h2>
      <div className="master-list">
        <button className={`master-card any ${selected === 'any' ? 'selected' : ''}`} onClick={() => onSelect('any')}>
          <span className="avatar avatar-any" aria-hidden="true"><Icon name="sparkle" size={18} /></span>
          <span>
            <strong>Любой мастер</strong>
            <small>Покажем всё свободное время</small>
          </span>
        </button>
        {masters.data!.map((m) => (
          <button key={m.id} className={`master-card ${selected !== 'any' && selected?.id === m.id ? 'selected' : ''}`} onClick={() => onSelect(m)}>
            <Avatar name={m.name} color={m.color} size={44} />
            <span>
              <strong>{m.name}</strong>
              <small>{m.role}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TimeStep({ service, masterId, date, time, notice, onDate, onTime }: {
  service: Service;
  masterId: number | null;
  date: string | null;
  time: string | null;
  notice: string | null;
  onDate: (d: string) => void;
  onTime: (t: string) => void;
}) {
  const today = isoDate(new Date());
  const days = useAsync(() => api.availabilityDays(service.id, today, DAYS_AHEAD, masterId), [service.id, masterId, today]);

  // Pre-select the first day with free time.
  useEffect(() => {
    if (!date && days.data) {
      const first = days.data.find((d) => d.free > 0);
      if (first) onDate(first.date);
    }
  }, [days.data, date, onDate]);

  const slots = useAsync(
    () => (date ? api.availability(service.id, date, masterId) : Promise.resolve(null)),
    [service.id, masterId, date, notice],
  );

  const groups = useMemo(() => {
    const list = slots.data?.slots ?? [];
    return [
      { label: 'Утро', items: list.filter((s) => s.time < '12:00') },
      { label: 'День', items: list.filter((s) => s.time >= '12:00' && s.time < '17:00') },
      { label: 'Вечер', items: list.filter((s) => s.time >= '17:00') },
    ].filter((g) => g.items.length);
  }, [slots.data]);

  if (days.loading) return <Spinner />;
  if (days.error) return <ErrorBox error={days.error} onRetry={days.reload} />;

  const nextFree = days.data!.find((d) => d.free > 0 && d.date > (date ?? ''));

  return (
    <div className="step">
      <h2>Когда вам удобно?</h2>
      {notice && <div className="notice" role="alert"><Icon name="clock" size={16} />{notice}</div>}

      <div className="day-strip" role="listbox" aria-label="Дата">
        {days.data!.map((d) => {
          const dt = parseDate(d.date);
          const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
          return (
            <button
              key={d.date}
              role="option"
              aria-selected={d.date === date}
              className={`day ${d.date === date ? 'selected' : ''} ${d.free ? '' : 'full'} ${isWeekend ? 'weekend' : ''}`}
              disabled={!d.free}
              onClick={() => onDate(d.date)}
              title={d.free ? `${d.free} ${plural(d.free, 'свободное окно', 'свободных окна', 'свободных окон')}` : 'Нет свободного времени'}
            >
              <span className="day-wd">{d.date === today ? 'сег' : fmtWeekdayShort(dt)}</span>
              <span className="day-num">{dt.getDate()}</span>
              <span className="day-free">{d.free ? d.free : '—'}</span>
            </button>
          );
        })}
      </div>

      {date && (
        <div className="slots">
          <p className="slots-title">{fmtRelativeDay(parseDate(date))}{date !== today && date !== isoDate(addDays(new Date(), 1)) ? '' : `, ${fmtDay(parseDate(date))}`}</p>
          {slots.loading ? (
            <Spinner />
          ) : slots.error ? (
            <ErrorBox error={slots.error} onRetry={slots.reload} />
          ) : groups.length ? (
            groups.map((g) => (
              <div key={g.label} className="slot-group">
                <span className="slot-group-label">{g.label}</span>
                <div className="slot-grid">
                  {g.items.map((s) => (
                    <button key={s.time} className={`slot ${s.time === time ? 'selected' : ''}`} onClick={() => onTime(s.time)}>
                      {s.time}
                    </button>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="empty-day">
              <p>На этот день всё занято.</p>
              {nextFree && <button className="btn btn-secondary btn-sm" onClick={() => onDate(nextFree.date)}>Ближайшее: {fmtRelativeDay(parseDate(nextFree.date))}</button>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ContactsStep({ service, masterId, date, time, onBooked, onConflict }: {
  service: Service;
  masterId: number | null;
  date: string;
  time: string;
  onBooked: (b: Booking) => void;
  onConflict: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [comment, setComment] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameError = name.trim().length < 2 ? 'Как к вам обращаться?' : null;
  const phoneError = !isCompletePhone(phone) ? 'Введите номер полностью' : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (nameError || phoneError) return;
    setBusy(true);
    setError(null);
    try {
      const b = await api.book({ service_id: service.id, master_id: masterId, date, time, client_name: name, client_phone: phone, comment });
      onBooked(b);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) onConflict(err.message);
      else setError(err instanceof Error ? err.message : 'Что-то пошло не так');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="step contact-form" onSubmit={submit} noValidate>
      <h2>Ваши контакты</h2>
      <label className={`field ${touched && nameError ? 'invalid' : ''}`}>
        <span>Имя</span>
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Например, Анна" autoFocus />
        {touched && nameError && <em>{nameError}</em>}
      </label>
      <label className={`field ${touched && phoneError ? 'invalid' : ''}`}>
        <span>Телефон</span>
        <input value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} inputMode="tel" autoComplete="tel" placeholder="+7 (___) ___-__-__" />
        {touched && phoneError && <em>{phoneError}</em>}
      </label>
      <label className="field">
        <span>Комментарий <small>(необязательно)</small></span>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={500} placeholder="Пожелания мастеру" />
      </label>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      <button className="btn btn-primary btn-lg" disabled={busy}>
        {busy ? 'Записываем…' : `Записаться на ${time}`}
      </button>
      <p className="hint">Нажимая кнопку, вы соглашаетесь на обработку контактных данных для записи.</p>
    </form>
  );
}

function Summary({ service, master, date, time, onEdit }: {
  service: Service | null;
  master: Master | 'any' | null;
  date: string | null;
  time: string | null;
  onEdit: (s: Step) => void;
}) {
  const end = service && time ? (() => {
    const d = parseDateTime(`${date}T${time}`);
    d.setMinutes(d.getMinutes() + service.duration);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  })() : null;

  return (
    <aside className="summary" aria-label="Ваша запись">
      <h3>Ваша запись</h3>
      <ul>
        <li className={service ? '' : 'unset'} onClick={() => service && onEdit('service')}>
          <span>Услуга</span>
          <strong>{service ? service.name : 'Не выбрана'}</strong>
        </li>
        <li className={master ? '' : 'unset'} onClick={() => master && onEdit('master')}>
          <span>Мастер</span>
          <strong>{master === 'any' ? 'Любой свободный' : master ? master.name : 'Не выбран'}</strong>
        </li>
        <li className={time ? '' : 'unset'} onClick={() => time && onEdit('time')}>
          <span>Дата и время</span>
          <strong>{date && time ? `${fmtRelativeDay(parseDate(date))}, ${time}–${end}` : 'Не выбрано'}</strong>
        </li>
      </ul>
      <div className="summary-total">
        <span>{service ? duration(service.duration) : ' '}</span>
        <strong>{service ? rub(service.price) : '—'}</strong>
      </div>
    </aside>
  );
}
