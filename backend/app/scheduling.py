"""Booking rules on top of the database: working hours, free slots, creation."""

from __future__ import annotations

import os
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from .availability import Interval, fits, free_slots, to_hhmm, to_minutes
from .models import ACTIVE_STATUSES, Booking, Client, Master, Service
from .schemas import BookingIn, Slot

STEP = 15  # minutes between possible start times
BUFFER = 0  # cleanup time between visits
LEAD = 30  # earliest booking: now + LEAD minutes
HORIZON_DAYS = 30  # how far ahead clients can book
TZ = ZoneInfo(os.getenv("BUSINESS_TZ", "Europe/Moscow"))


class BookingError(Exception):
    def __init__(self, message: str, status_code: int = 409):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def business_now() -> datetime:
    return datetime.now(TZ).replace(tzinfo=None, second=0, microsecond=0)


def working_hours(master: Master, day: date) -> tuple[Interval, list[Interval]] | None:
    for s in master.schedules:
        if s.weekday == day.weekday():
            breaks = []
            if s.break_start and s.break_end:
                breaks.append((to_minutes(s.break_start), to_minutes(s.break_end)))
            return (to_minutes(s.start), to_minutes(s.end)), breaks
    return None


def _minutes(dt: datetime) -> int:
    return dt.hour * 60 + dt.minute


def busy_intervals(db: Session, master_id: int, day: date, exclude_id: int | None = None) -> list[Interval]:
    start = datetime.combine(day, time.min)
    rows = db.scalars(
        select(Booking).where(
            Booking.master_id == master_id,
            Booking.start >= start,
            Booking.start < start + timedelta(days=1),
            Booking.status.in_(ACTIVE_STATUSES),
        )
    )
    return [(_minutes(b.start), _minutes(b.end)) for b in rows if b.id != exclude_id]


def _not_before(day: date, now: datetime) -> int | None:
    if day < now.date():
        return 24 * 60  # nothing is bookable in the past
    if day == now.date():
        return _minutes(now) + LEAD
    return None


def masters_for(db: Session, service: Service, master_id: int | None) -> list[Master]:
    masters = [m for m in service.masters]
    if master_id is not None:
        masters = [m for m in masters if m.id == master_id]
    return sorted(masters, key=lambda m: m.id)


def day_slots(db: Session, service: Service, masters: list[Master], day: date, now: datetime) -> list[Slot]:
    if day > now.date() + timedelta(days=HORIZON_DAYS):
        return []
    by_time: dict[int, list[int]] = {}
    for m in masters:
        hours = working_hours(m, day)
        if hours is None:
            continue
        work, breaks = hours
        for t in free_slots(
            work=work,
            duration=service.duration,
            busy=busy_intervals(db, m.id, day),
            breaks=breaks,
            step=STEP,
            buffer=BUFFER,
            not_before=_not_before(day, now),
        ):
            by_time.setdefault(t, []).append(m.id)
    return [Slot(time=to_hhmm(t), master_ids=ids) for t, ids in sorted(by_time.items())]


def _get_or_create_client(db: Session, name: str, phone: str) -> Client:
    client = db.scalar(select(Client).where(Client.phone == phone))
    if client is None:
        client = Client(name=name, phone=phone)
        db.add(client)
        db.flush()
    elif client.name != name:
        client.name = name  # keep the latest spelling
    return client


def create_booking(db: Session, data: BookingIn, now: datetime) -> Booking:
    service = db.get(Service, data.service_id)
    if service is None or not service.active:
        raise BookingError("Услуга не найдена", 404)

    candidates = masters_for(db, service, data.master_id)
    if not candidates:
        raise BookingError("Мастер не выполняет эту услугу", 422)

    start_min = to_minutes(data.time)
    slot = (start_min, start_min + service.duration)
    nb = _not_before(data.date, now)
    if (nb is not None and start_min < nb) or data.date > now.date() + timedelta(days=HORIZON_DAYS):
        raise BookingError("Это время уже недоступно", 422)

    # Re-check on the server: the slot may have been taken since the page loaded.
    free = []
    for m in candidates:
        hours = working_hours(m, data.date)
        if hours is None:
            continue
        busy = busy_intervals(db, m.id, data.date)
        if fits(slot, hours[0], busy, hours[1], BUFFER):
            free.append((len(busy), m))  # prefer the least loaded specialist
    if not free:
        raise BookingError("Это время только что заняли. Выберите другое, пожалуйста.")
    master = min(free, key=lambda x: (x[0], x[1].id))[1]

    client = _get_or_create_client(db, data.client_name, data.client_phone)
    start = datetime.combine(data.date, time(start_min // 60, start_min % 60))
    booking = Booking(
        master=master,
        service=service,
        client=client,
        start=start,
        end=start + timedelta(minutes=service.duration),
        price=service.price,
        status="new",
        comment=data.comment.strip(),
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking
