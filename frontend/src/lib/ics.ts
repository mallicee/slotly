import type { Booking, Business } from '../api/types';

const stamp = (s: string) => s.replace(/[-:]/g, '').slice(0, 15); // 2026-11-02T11:00:00 -> 20261102T110000
const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

/** iCalendar file so the client can add the visit to any calendar app. */
export function bookingToIcs(b: Booking, business: Business): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Slotly//Booking//RU',
    'BEGIN:VEVENT',
    `UID:slotly-${b.id}@slotly`,
    `DTSTAMP:${stamp(new Date().toISOString())}Z`,
    `DTSTART:${stamp(b.start)}`,
    `DTEND:${stamp(b.end)}`,
    `SUMMARY:${esc(`${b.service_name} — ${business.name}`)}`,
    `DESCRIPTION:${esc(`Мастер: ${b.master_name}. Тел. салона: ${business.phone}`)}`,
    `LOCATION:${esc(business.address)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Напоминание о записи',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export function downloadIcs(b: Booking, business: Business): void {
  const blob = new Blob([bookingToIcs(b, business)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `zapis-${b.start.slice(0, 10)}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
