import { beforeEach, describe, expect, it } from 'vitest';
import { maskPhone } from '../lib/phone';
import { createDemoApi } from './demo';
import { ApiError, type Api } from './types';

// Monday 2 November 2026, 09:00 — same fixed "now" as the backend tests.
const NOW = new Date(2026, 10, 2, 9, 0);
const MONDAY = '2026-11-02';
const WEDNESDAY = '2026-11-04';

let api: Api;
beforeEach(() => {
  api = createDemoApi({ now: () => NOW, storage: null, latency: 0 });
});

const baseInput = {
  service_id: 4, // "Стрижка + борода", 90 min
  master_id: 1 as number | null,
  date: WEDNESDAY,
  time: '12:00',
  client_name: 'Тест Тестов',
  client_phone: '+7 (999) 000-00-01',
  comment: '',
};

describe('demo API mirrors the backend rules', () => {
  it('seeds a realistic history', async () => {
    await api.login('admin@slotly.demo', 'demo1234');
    const stats = await api.admin.stats(30);
    expect(stats.bookings).toBeGreaterThan(100);
    expect(stats.revenue).toBeGreaterThan(0);
    expect(stats.by_day).toHaveLength(30);
  });

  it('booking removes the slot and blocks double booking', async () => {
    const before = await api.availability(4, WEDNESDAY, 1);
    const free = before.slots[0].time;
    const booking = await api.book({ ...baseInput, time: free });
    expect(booking.client_phone).toBe('+79990000001');
    expect(booking.master_name).toBe('Артём');

    const after = await api.availability(4, WEDNESDAY, 1);
    expect(after.slots.map((s) => s.time)).not.toContain(free);
    await expect(api.book({ ...baseInput, time: free, client_phone: '+79990000002' })).rejects.toMatchObject({ status: 409 });
  });

  it('respects the lead time on the current day', async () => {
    const today = await api.availability(1, MONDAY, 1);
    expect(today.slots.every((s) => s.time >= '09:30')).toBe(true);
    await expect(api.book({ ...baseInput, date: '2026-11-01' })).rejects.toBeInstanceOf(ApiError);
  });

  it('"any master" lists the union and assigns a free specialist', async () => {
    const any = await api.availability(1, WEDNESDAY, null);
    const artyom = await api.availability(1, WEDNESDAY, 1);
    expect(any.slots.length).toBeGreaterThanOrEqual(artyom.slots.length);
    const slot = any.slots.find((s) => s.master_ids.length === 1)!;
    const booked = await api.book({ ...baseInput, service_id: 1, master_id: null, time: slot.time });
    expect(booked.master_id).toBe(slot.master_ids[0]);
  });

  it('cancelling frees the time again', async () => {
    const { slots } = await api.availability(4, WEDNESDAY, 1);
    const b = await api.book({ ...baseInput, time: slots[0].time });
    await api.login('admin@slotly.demo', 'demo1234');
    await api.admin.setStatus(b.id, 'cancelled');
    const again = await api.availability(4, WEDNESDAY, 1);
    expect(again.slots.map((s) => s.time)).toContain(slots[0].time);
  });

  it('admin endpoints require login', async () => {
    await expect(api.admin.clients()).rejects.toMatchObject({ status: 401 });
    await expect(api.login('admin@slotly.demo', 'nope')).rejects.toMatchObject({ status: 401 });
  });

  it('validates input', async () => {
    await expect(api.book({ ...baseInput, client_phone: '123' })).rejects.toMatchObject({ status: 422 });
    await expect(api.book({ ...baseInput, master_id: 3 })).rejects.toMatchObject({ status: 422 });
  });
});

describe('phone mask', () => {
  it.each([
    ['8921', '+7 (921)'],
    ['89211234567', '+7 (921) 123-45-67'],
    ['+7 921 123 45 67 99', '+7 (921) 123-45-67'],
    ['921', '+7 (921)'],
    ['', ''],
  ])('%s -> %s', (input, expected) => {
    expect(maskPhone(input)).toBe(expected);
  });
});
