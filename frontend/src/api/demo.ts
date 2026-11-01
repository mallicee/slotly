/**
 * In-browser implementation of the API used by the public demo (GitHub Pages
 * has no server). It mirrors backend/app/api.py and scheduling.py rule for
 * rule, shares the catalog and the slot algorithm, and persists to localStorage.
 */
import catalog from '../../../shared/catalog.json';
import { fits, freeSlots, toHHMM, toMinutes, type Interval } from '../lib/availability';
import { addDays, isoDate, isoDateTime, parseDate, parseDateTime, weekday } from '../lib/format';
import {
  ApiError,
  type Api,
  type Booking,
  type BookingInput,
  type ClientRow,
  type Master,
  type Service,
  type ServiceInput,
  type Stats,
  type Status,
} from './types';

const STEP = 15;
const BUFFER = 0;
const LEAD = 30;
const HORIZON_DAYS = 30;
const ACTIVE: Status[] = ['new', 'confirmed', 'completed'];
const STORAGE_KEY = 'slotly-demo-v1';
const DEMO_TOKEN = 'demo-token';
export const SESSION_KEY = 'slotly-token';

interface CatalogMaster {
  id: number;
  name: string;
  role: string;
  color: string;
  services: number[];
  schedule: { days: number[]; start: string; end: string; break: string[] | null };
}

interface RawClient {
  id: number;
  name: string;
  phone: string;
  created_at: string;
}

interface RawBooking {
  id: number;
  master_id: number;
  service_id: number;
  client_id: number;
  start: string;
  end: string;
  price: number;
  status: Status;
  comment: string;
  created_at: string;
}

interface DemoDb {
  seededOn: string;
  services: Service[];
  clients: RawClient[];
  bookings: RawBooking[];
}

const MASTERS = catalog.masters as CatalogMaster[];

/* ---------- Deterministic random (mulberry32) ---------- */

function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo)),
    pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)],
    weighted: <T,>(xs: readonly T[], ws: readonly number[]): T => {
      let r = next() * ws.reduce((s, w) => s + w, 0);
      for (let i = 0; i < xs.length; i++) if ((r -= ws[i]) < 0) return xs[i];
      return xs[xs.length - 1];
    },
  };
}

/* ---------- Schedule helpers ---------- */

function workingHours(m: CatalogMaster, day: Date): { work: Interval; breaks: Interval[] } | null {
  if (!m.schedule.days.includes(weekday(day))) return null;
  const breaks: Interval[] = m.schedule.break ? [[toMinutes(m.schedule.break[0]), toMinutes(m.schedule.break[1])]] : [];
  return { work: [toMinutes(m.schedule.start), toMinutes(m.schedule.end)], breaks };
}

const minutesOf = (s: string) => toMinutes(s.slice(11, 16));

/* ---------- Seed ---------- */

const FIRST = ['Алексей', 'Мария', 'Иван', 'Анна', 'Дмитрий', 'Екатерина', 'Максим', 'Ольга', 'Сергей', 'Полина',
  'Никита', 'Алина', 'Егор', 'Дарья', 'Кирилл', 'Виктория', 'Роман', 'Софья', 'Павел', 'Ксения'];
const LAST = ['И.', 'С.', 'К.', 'М.', 'П.', 'Л.', 'В.', 'Н.', 'Р.', 'Т.'];

export function seedDb(today: Date, seed = 42, pastDays = 62, futureDays = 14): DemoDb {
  const r = rng(seed);
  const services: Service[] = catalog.services.map((s) => ({ ...s, active: true }));
  const clients: RawClient[] = [];
  const phones = new Set<string>();
  for (let i = 0; clients.length < 140 && i < 1000; i++) {
    const phone = `+79${String(r.int(1e8, 1e9)).padStart(9, '0')}`;
    if (phones.has(phone)) continue;
    phones.add(phone);
    clients.push({
      id: clients.length + 1,
      name: `${r.pick(FIRST)} ${r.pick(LAST)}`,
      phone,
      created_at: isoDateTime(addDays(today, -r.int(0, 120))),
    });
  }
  const regulars = clients.slice(0, 35);

  const bookings: RawBooking[] = [];
  for (let offset = -pastDays; offset <= futureDays; offset++) {
    const day = addDays(today, offset);
    const load = 0.55 + (weekday(day) >= 4 ? 0.2 : 0) - 0.03 * Math.max(offset, 0);
    for (const m of MASTERS) {
      const hours = workingHours(m, day);
      if (!hours) continue;
      const busy: Interval[] = [];
      let cursor = hours.work[0];
      while (cursor < hours.work[1]) {
        const serviceId = r.pick(m.services);
        const service = services.find((s) => s.id === serviceId)!;
        const t = freeSlots({ ...hours, duration: service.duration, busy, step: STEP }).find((x) => x >= cursor);
        if (t === undefined) break;
        cursor = t + service.duration;
        if (r.next() > load) {
          cursor += 30;
          continue;
        }
        busy.push([t, t + service.duration]);
        const start = new Date(day);
        start.setHours(0, t, 0, 0);
        const status: Status = offset < 0
          ? r.weighted<Status>(['completed', 'cancelled', 'no_show'], [88, 8, 4])
          : r.weighted<Status>(['confirmed', 'new'], [70, 30]);
        const client = r.next() < 0.45 ? r.pick(regulars) : r.pick(clients);
        bookings.push({
          id: bookings.length + 1,
          master_id: m.id,
          service_id: service.id,
          client_id: client.id,
          start: isoDateTime(start),
          end: isoDateTime(new Date(start.getTime() + service.duration * 60_000)),
          price: service.price,
          status,
          comment: '',
          created_at: isoDateTime(addDays(start, -r.int(1, 10))),
        });
      }
    }
  }
  return { seededOn: isoDate(today), services, clients, bookings };
}

/* ---------- API ---------- */

export interface DemoOptions {
  now?: () => Date;
  storage?: Storage | null;
  latency?: number;
}

export function createDemoApi({ now = () => new Date(), storage = safeStorage(), latency = 250 }: DemoOptions = {}): Api {
  let db = load();

  function load(): DemoDb {
    const today = isoDate(now());
    try {
      const saved = storage?.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as DemoDb;
        if (parsed.seededOn === today) return parsed; // reseed daily so the demo stays "current"
      }
    } catch {
      /* corrupted or unavailable storage: start fresh */
    }
    return seedDb(parseDate(today));
  }

  function save() {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      /* private mode etc.: the demo still works in memory */
    }
  }

  const wait = <T,>(value: T): Promise<T> =>
    new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), latency ? latency * (0.5 + Math.random()) : 0));
  const fail = (status: number, message: string): Promise<never> =>
    new Promise((_, reject) => setTimeout(() => reject(new ApiError(status, message)), latency / 2));

  const nowMin = () => {
    const d = now();
    return { date: isoDate(d), minutes: d.getHours() * 60 + d.getMinutes() };
  };

  function notBefore(day: string): number | null {
    const n = nowMin();
    if (day < n.date) return 24 * 60;
    if (day === n.date) return n.minutes + LEAD;
    return null;
  }

  const beyondHorizon = (day: string) => day > isoDate(addDays(parseDate(nowMin().date), HORIZON_DAYS));

  function busy(masterId: number, day: string): Interval[] {
    return db.bookings
      .filter((b) => b.master_id === masterId && b.start.startsWith(day) && ACTIVE.includes(b.status))
      .map((b) => [minutesOf(b.start), minutesOf(b.end)] as const);
  }

  function mastersFor(serviceId: number, masterId: number | null): CatalogMaster[] {
    return MASTERS.filter((m) => m.services.includes(serviceId) && (masterId === null || m.id === masterId));
  }

  function activeService(id: number): Service | undefined {
    return db.services.find((s) => s.id === id && s.active);
  }

  function daySlots(service: Service, masters: CatalogMaster[], day: string) {
    if (beyondHorizon(day)) return [];
    const byTime = new Map<number, number[]>();
    for (const m of masters) {
      const hours = workingHours(m, parseDate(day));
      if (!hours) continue;
      const times = freeSlots({
        ...hours,
        duration: service.duration,
        busy: busy(m.id, day),
        step: STEP,
        buffer: BUFFER,
        notBefore: notBefore(day),
      });
      for (const t of times) byTime.set(t, [...(byTime.get(t) ?? []), m.id]);
    }
    return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([t, ids]) => ({ time: toHHMM(t), master_ids: ids }));
  }

  function toBooking(b: RawBooking): Booking {
    const service = db.services.find((s) => s.id === b.service_id)!;
    const master = MASTERS.find((m) => m.id === b.master_id)!;
    const client = db.clients.find((c) => c.id === b.client_id)!;
    return {
      ...b,
      service_name: service.name,
      master_name: master.name,
      client_name: client.name,
      client_phone: client.phone,
    };
  }

  function normalizePhone(value: string): string | null {
    let d = value.replace(/\D/g, '');
    if (d.length === 11 && (d[0] === '7' || d[0] === '8')) d = '7' + d.slice(1);
    else if (d.length === 10) d = '7' + d;
    return d.length >= 11 && d.length <= 15 ? `+${d}` : null;
  }

  function requireAuth(token: string | null) {
    if (token !== DEMO_TOKEN) throw new ApiError(401, 'Требуется вход');
  }

  // In the browser the session lives in localStorage (cleared on logout);
  // without storage (tests) the last successful login is remembered in memory.
  let token: string | null = null;
  const currentToken = () => (storage ? storage.getItem(SESSION_KEY) : token);
  const authed = <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
    (...args: A): Promise<R> => {
      try {
        requireAuth(currentToken());
      } catch (e) {
        return Promise.reject(e);
      }
      return fn(...args);
    };

  const api: Api = {
    mode: 'demo',

    business: () => wait(catalog.business),

    services: () => wait(db.services.filter((s) => s.active)),

    masters: (serviceId) =>
      wait<Master[]>(
        MASTERS.filter((m) => serviceId === undefined || m.services.includes(serviceId)).map((m) => ({
          id: m.id,
          name: m.name,
          role: m.role,
          color: m.color,
          service_ids: m.services,
          work_days: m.schedule.days,
        })),
      ),

    availability: (serviceId, date, masterId) => {
      const service = activeService(serviceId);
      if (!service) return fail(404, 'Услуга не найдена');
      return wait({ date, slots: daySlots(service, mastersFor(serviceId, masterId), date) });
    },

    availabilityDays: (serviceId, from, days, masterId) => {
      const service = activeService(serviceId);
      if (!service) return fail(404, 'Услуга не найдена');
      const masters = mastersFor(serviceId, masterId);
      return wait(
        Array.from({ length: days }, (_, i) => {
          const date = isoDate(addDays(parseDate(from), i));
          return { date, free: daySlots(service, masters, date).length };
        }),
      );
    },

    book: (input: BookingInput) => {
      const service = activeService(input.service_id);
      if (!service) return fail(404, 'Услуга не найдена');
      const candidates = mastersFor(service.id, input.master_id);
      if (!candidates.length) return fail(422, 'Мастер не выполняет эту услугу');
      const name = input.client_name.trim().replace(/\s+/g, ' ');
      if (name.length < 2) return fail(422, 'Слишком короткое имя');
      const phone = normalizePhone(input.client_phone);
      if (!phone) return fail(422, 'Некорректный номер телефона');

      const startMin = toMinutes(input.time);
      const slot: Interval = [startMin, startMin + service.duration];
      const nb = notBefore(input.date);
      if ((nb !== null && startMin < nb) || beyondHorizon(input.date)) return fail(422, 'Это время уже недоступно');

      const free = candidates
        .map((m) => ({ m, hours: workingHours(m, parseDate(input.date)), load: busy(m.id, input.date) }))
        .filter((x) => x.hours && fits(slot, x.hours.work, x.load, x.hours.breaks, BUFFER))
        .sort((a, b) => a.load.length - b.load.length || a.m.id - b.m.id);
      if (!free.length) return fail(409, 'Это время только что заняли. Выберите другое, пожалуйста.');

      let client = db.clients.find((c) => c.phone === phone);
      if (!client) {
        client = { id: Math.max(0, ...db.clients.map((c) => c.id)) + 1, name, phone, created_at: isoDateTime(now()) };
        db.clients.push(client);
      } else {
        client.name = name;
      }
      const start = parseDate(input.date);
      start.setHours(0, startMin, 0, 0);
      const raw: RawBooking = {
        id: Math.max(0, ...db.bookings.map((b) => b.id)) + 1,
        master_id: free[0].m.id,
        service_id: service.id,
        client_id: client.id,
        start: isoDateTime(start),
        end: isoDateTime(new Date(start.getTime() + service.duration * 60_000)),
        price: service.price,
        status: 'new',
        comment: input.comment.trim(),
        created_at: isoDateTime(now()),
      };
      db.bookings.push(raw);
      save();
      return wait(toBooking(raw));
    },

    login: (email, password) => {
      if (email.trim().toLowerCase() !== catalog.demoAdmin.email || password !== catalog.demoAdmin.password) {
        return fail(401, 'Неверный email или пароль');
      }
      token = DEMO_TOKEN;
      return wait({ token: DEMO_TOKEN, email: catalog.demoAdmin.email });
    },

    admin: {
      bookings: authed((from: string, to: string) =>
        wait(
          db.bookings
            .filter((b) => b.start.slice(0, 10) >= from && b.start.slice(0, 10) <= to)
            .sort((a, b) => a.start.localeCompare(b.start))
            .map(toBooking),
        ),
      ),

      setStatus: authed((id: number, status: Status) => {
        const b = db.bookings.find((x) => x.id === id);
        if (!b) return fail(404, 'Запись не найдена');
        b.status = status;
        save();
        return wait(toBooking(b));
      }),

      clients: authed(() => {
        const n = isoDateTime(now());
        const rows: ClientRow[] = db.clients.map((c) => {
          const mine = db.bookings.filter((b) => b.client_id === c.id);
          const done = mine.filter((b) => b.status === 'completed');
          const upcoming = mine.filter((b) => b.start >= n && (b.status === 'new' || b.status === 'confirmed')).map((b) => b.start).sort();
          return {
            id: c.id,
            name: c.name,
            phone: c.phone,
            visits: done.length,
            spent: done.reduce((s, b) => s + b.price, 0),
            last_visit: done.map((b) => b.start).sort().at(-1) ?? null,
            next_visit: upcoming[0] ?? null,
          };
        });
        return wait(rows.sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name)));
      }),

      services: authed(() => wait(db.services)),

      createService: authed((input: ServiceInput) => {
        const service = { ...input, id: Math.max(0, ...db.services.map((s) => s.id)) + 1 };
        db.services.push(service);
        save();
        return wait(service);
      }),

      updateService: authed((id: number, input: ServiceInput) => {
        const s = db.services.find((x) => x.id === id);
        if (!s) return fail(404, 'Услуга не найдена');
        Object.assign(s, input);
        save();
        return wait(s);
      }),

      deleteService: authed((id: number) => {
        const s = db.services.find((x) => x.id === id);
        if (!s) return fail(404, 'Услуга не найдена');
        if (db.bookings.some((b) => b.service_id === id)) s.active = false;
        else db.services = db.services.filter((x) => x.id !== id);
        save();
        return wait(undefined);
      }),

      stats: authed((days: number) => wait(computeStats(db, parseDate(nowMin().date), days))),
    },
  };
  return api;
}

export function computeStats(db: Pick<DemoDb, 'bookings' | 'services'>, today: Date, days: number): Stats {
  const start = isoDate(addDays(today, -(days - 1)));
  const prevStart = isoDate(addDays(today, -(2 * days - 1)));
  const end = isoDate(today);
  const inRange = (b: RawBooking, from: string, to: string) => b.start.slice(0, 10) >= from && b.start.slice(0, 10) <= to;

  const cur = db.bookings.filter((b) => inRange(b, start, end));
  const prev = db.bookings.filter((b) => inRange(b, prevStart, isoDate(addDays(today, -days))));
  const done = cur.filter((b) => b.status === 'completed');
  const prevDone = prev.filter((b) => b.status === 'completed');
  const revenue = done.reduce((s, b) => s + b.price, 0);

  const byDay = Array.from({ length: days }, (_, i) => {
    const date = isoDate(addDays(parseDate(start), i));
    const list = done.filter((b) => b.start.startsWith(date));
    return { date, revenue: list.reduce((s, b) => s + b.price, 0), bookings: list.length };
  });

  const top = new Map<number, { bookings: number; revenue: number }>();
  for (const b of done) {
    const t = top.get(b.service_id) ?? { bookings: 0, revenue: 0 };
    t.bookings++;
    t.revenue += b.price;
    top.set(b.service_id, t);
  }

  const masters = MASTERS.map((m) => {
    let available = 0;
    for (let i = 0; i < days; i++) {
      const h = workingHours(m, addDays(parseDate(start), i));
      if (h) available += h.work[1] - h.work[0] - h.breaks.reduce((s, [a, b]) => s + b - a, 0);
    }
    const mine = done.filter((b) => b.master_id === m.id);
    const booked = mine.reduce((s, b) => s + (parseDateTime(b.end).getTime() - parseDateTime(b.start).getTime()) / 60_000, 0);
    return {
      id: m.id,
      name: m.name,
      color: m.color,
      utilization: available ? Math.round((booked / available) * 1000) / 1000 : 0,
      revenue: mine.reduce((s, b) => s + b.price, 0),
    };
  });

  const firstVisit = new Map<number, string>();
  for (const b of db.bookings) {
    if (b.status !== 'completed') continue;
    const f = firstVisit.get(b.client_id);
    if (!f || b.start < f) firstVisit.set(b.client_id, b.start);
  }
  const newClients = [...firstVisit.values()].filter((d) => d.slice(0, 10) >= start && d.slice(0, 10) <= end).length;
  const cancelled = cur.filter((b) => b.status === 'cancelled' || b.status === 'no_show').length;

  return {
    days,
    revenue,
    revenue_prev: prevDone.reduce((s, b) => s + b.price, 0),
    bookings: done.length,
    bookings_prev: prevDone.length,
    avg_check: done.length ? Math.floor(revenue / done.length) : 0,
    new_clients: newClients,
    cancel_rate: cur.length ? Math.round((cancelled / cur.length) * 1000) / 1000 : 0,
    by_day: byDay,
    top_services: [...top.entries()]
      .map(([id, v]) => ({ name: db.services.find((s) => s.id === id)?.name ?? '—', ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5),
    masters,
  };
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
