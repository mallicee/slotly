import { describe, expect, it } from 'vitest';
import shared from '../../../shared/availability-cases.json';
import { fits, freeSlots, toHHMM, toMinutes, type Interval } from './availability';

const iv = (p: string[]): Interval => [toMinutes(p[0]), toMinutes(p[1])];

describe('freeSlots matches the shared contract with the backend', () => {
  for (const c of shared.cases) {
    it(c.name, () => {
      const slots = freeSlots({
        work: iv(c.work),
        duration: c.duration,
        busy: c.busy.map(iv),
        breaks: c.breaks.map(iv),
        step: c.step,
        buffer: c.buffer,
        notBefore: c.notBefore ? toMinutes(c.notBefore) : null,
      });
      expect(slots.map(toHHMM)).toEqual(c.expected);
    });
  }
});

describe('fits agrees with freeSlots', () => {
  for (const c of shared.cases) {
    it(c.name, () => {
      const work = iv(c.work);
      const busy = c.busy.map(iv);
      const breaks = c.breaks.map(iv);
      for (const t of freeSlots({ work, duration: c.duration, busy, breaks, step: c.step, buffer: c.buffer })) {
        expect(fits([t, t + c.duration], work, busy, breaks, c.buffer)).toBe(true);
      }
    });
  }
});

it('rejects a non-positive duration', () => {
  expect(() => freeSlots({ work: [600, 700], duration: 0 })).toThrow();
});
