/**
 * Free-slot calculation. A line-for-line port of backend/app/availability.py;
 * both are verified against shared/availability-cases.json.
 */

export type Interval = readonly [number, number];

export const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const toHHMM = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export interface SlotOptions {
  work: Interval;
  duration: number;
  busy?: readonly Interval[];
  breaks?: readonly Interval[];
  step?: number;
  buffer?: number;
  notBefore?: number | null;
}

export function freeSlots({
  work,
  duration,
  busy = [],
  breaks = [],
  step = 15,
  buffer = 0,
  notBefore = null,
}: SlotOptions): number[] {
  if (duration <= 0 || step <= 0) throw new Error('duration and step must be positive');

  const blocked: Interval[] = [...busy.map(([s, e]) => [s - buffer, e + buffer] as const), ...breaks];
  const slots: number[] = [];
  for (let t = work[0]; t + duration <= work[1]; t += step) {
    if (notBefore !== null && t < notBefore) continue;
    if (blocked.every(([bs, be]) => t + duration <= bs || t >= be)) slots.push(t);
  }
  return slots;
}

export const overlaps = (a: Interval, b: Interval): boolean => a[0] < b[1] && b[0] < a[1];

export function fits(slot: Interval, work: Interval, busy: readonly Interval[], breaks: readonly Interval[], buffer = 0): boolean {
  if (slot[0] < work[0] || slot[1] > work[1]) return false;
  if (busy.some(([s, e]) => overlaps(slot, [s - buffer, e + buffer]))) return false;
  return !breaks.some((b) => overlaps(slot, b));
}
