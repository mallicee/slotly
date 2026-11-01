import { useState } from 'react';
import { api } from '../api/client';
import { STATUS_LABEL, type Booking, type Status } from '../api/types';
import { Icon, Modal, StatusBadge, useToast } from '../components/ui';
import { fmtRelativeDay, parseDateTime, rub, timeOf } from '../lib/format';
import { prettyPhone } from '../lib/phone';

const ACTIONS: Status[] = ['confirmed', 'completed', 'no_show', 'cancelled'];

/** Booking card with status actions; shared by the calendar and the bookings list. */
export function BookingDetails({ booking, onClose, onChange }: {
  booking: Booking;
  onClose: () => void;
  onChange: (b: Booking) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<Status | null>(null);

  async function setStatus(status: Status) {
    setBusy(status);
    try {
      const updated = await api.admin.setStatus(booking.id, status);
      onChange(updated);
      toast(`Статус: ${STATUS_LABEL[status].toLowerCase()}`);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ошибка', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal title={`Запись №${booking.id}`} onClose={onClose}>
      <div className="details">
        <div className="details-head">
          <div>
            <strong className="details-client">{booking.client_name}</strong>
            <a href={`tel:${booking.client_phone}`} className="details-phone"><Icon name="phone" size={14} />{prettyPhone(booking.client_phone)}</a>
          </div>
          <StatusBadge status={booking.status} />
        </div>
        <dl className="details-grid">
          <div><dt>Услуга</dt><dd>{booking.service_name}</dd></div>
          <div><dt>Мастер</dt><dd>{booking.master_name}</dd></div>
          <div><dt>Когда</dt><dd>{fmtRelativeDay(parseDateTime(booking.start))}, {timeOf(booking.start)}–{timeOf(booking.end)}</dd></div>
          <div><dt>Стоимость</dt><dd>{rub(booking.price)}</dd></div>
          {booking.comment && <div className="full"><dt>Комментарий</dt><dd>{booking.comment}</dd></div>}
        </dl>
        <div className="details-actions">
          {ACTIONS.filter((s) => s !== booking.status).map((s) => (
            <button key={s} className={`btn btn-sm ${s === 'cancelled' || s === 'no_show' ? 'btn-ghost-danger' : 'btn-secondary'}`}
              disabled={busy !== null} onClick={() => setStatus(s)}>
              {busy === s ? '…' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
