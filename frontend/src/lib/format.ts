/** Dates are local "naive" strings shared with the API: YYYY-MM-DD and YYYY-MM-DDTHH:MM:SS. */

const pad = (n: number) => String(n).padStart(2, '0');

export const isoDate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const isoDateTime = (d: Date): string => `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

export const parseDate = (s: string): Date => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const parseDateTime = (s: string): Date => {
  const d = parseDate(s);
  const [h, min] = s.slice(11, 16).split(':').map(Number);
  d.setHours(h || 0, min || 0, 0, 0);
  return d;
};

export const addDays = (d: Date, n: number): Date => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const timeOf = (s: string): string => s.slice(11, 16);

/** Monday = 0 ... Sunday = 6, matching Python's weekday(). */
export const weekday = (d: Date): number => (d.getDay() + 6) % 7;

const rubFmt = new Intl.NumberFormat('ru-RU');
export const rub = (n: number): string => `${rubFmt.format(n)} ₽`;
export const num = (n: number): string => rubFmt.format(n);

export const duration = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} мин`;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
};

const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const dayMonthShort = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const weekdayLong = new Intl.DateTimeFormat('ru-RU', { weekday: 'long' });
const weekdayShort = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });

export const fmtDay = (d: Date): string => dayMonth.format(d);
export const fmtDayShort = (d: Date): string => dayMonthShort.format(d).replace('.', '');
export const fmtWeekday = (d: Date): string => weekdayLong.format(d);
export const fmtWeekdayShort = (d: Date): string => weekdayShort.format(d);

/** "Сегодня", "Завтра" or "пятница, 6 ноября". */
export function fmtRelativeDay(d: Date, today = new Date()): string {
  const diff = Math.round((parseDate(isoDate(d)).getTime() - parseDate(isoDate(today)).getTime()) / 86_400_000);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Завтра';
  if (diff === -1) return 'Вчера';
  return `${fmtWeekday(d)}, ${fmtDay(d)}`;
}

export const plural = (n: number, one: string, few: string, many: string): string => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase();
