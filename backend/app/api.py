from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from .auth import create_token, current_user, verify_password
from .db import get_db
from .models import Booking, Client, Master, Service, User
from .notify import send_booking_notification
from .scheduling import BookingError, business_now, create_booking, day_slots, masters_for, working_hours
from .schemas import (
    BookingIn, BookingOut, BusinessOut, ClientOut, DayAvailability, DayStat, DaySummary, LoginIn, MasterLoad,
    MasterOut, ServiceIn, ServiceOut, StatsOut, StatusIn, TokenOut, TopService,
)
from .seed import business_info

public = APIRouter(prefix="/api", tags=["public"])
admin = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(current_user)])


def booking_out(b: Booking) -> BookingOut:
    return BookingOut(
        id=b.id, start=b.start, end=b.end, status=b.status, price=b.price, comment=b.comment,
        created_at=b.created_at, service_id=b.service_id, service_name=b.service.name,
        master_id=b.master_id, master_name=b.master.name, client_id=b.client_id,
        client_name=b.client.name, client_phone=b.client.phone,
    )


def _service_or_404(db: Session, service_id: int) -> Service:
    service = db.get(Service, service_id)
    if service is None or not service.active:
        raise HTTPException(404, "Услуга не найдена")
    return service


# ---------- Public ----------

@public.get("/business", response_model=BusinessOut)
def get_business():
    return business_info()


@public.get("/services", response_model=list[ServiceOut])
def list_services(db: Session = Depends(get_db)):
    return db.scalars(select(Service).where(Service.active).order_by(Service.id)).all()


@public.get("/masters", response_model=list[MasterOut])
def list_masters(service_id: int | None = None, db: Session = Depends(get_db)):
    masters = db.scalars(select(Master).options(joinedload(Master.services), joinedload(Master.schedules)).order_by(Master.id)).unique().all()
    out = [
        MasterOut(id=m.id, name=m.name, role=m.role, color=m.color, service_ids=[s.id for s in m.services],
                  work_days=sorted(s.weekday for s in m.schedules))
        for m in masters
    ]
    if service_id is not None:
        out = [m for m in out if service_id in m.service_ids]
    return out


@public.get("/availability", response_model=DayAvailability)
def availability(service_id: int, day: date = Query(alias="date"), master_id: int | None = None, db: Session = Depends(get_db)):
    service = _service_or_404(db, service_id)
    slots = day_slots(db, service, masters_for(db, service, master_id), day, business_now())
    return DayAvailability(date=day, slots=slots)


@public.get("/availability/days", response_model=list[DaySummary])
def availability_days(service_id: int, start: date = Query(alias="from"), days: int = Query(14, ge=1, le=31),
                      master_id: int | None = None, db: Session = Depends(get_db)):
    service = _service_or_404(db, service_id)
    masters = masters_for(db, service, master_id)
    now = business_now()
    return [
        DaySummary(date=d, free=len(day_slots(db, service, masters, d, now)))
        for d in (start + timedelta(days=i) for i in range(days))
    ]


@public.post("/bookings", response_model=BookingOut, status_code=status.HTTP_201_CREATED)
def book(data: BookingIn, background: BackgroundTasks, db: Session = Depends(get_db)):
    try:
        booking = create_booking(db, data, business_now())
    except BookingError as e:
        raise HTTPException(e.status_code, e.message) from None
    out = booking_out(booking)
    background.add_task(send_booking_notification, out)
    return out


@public.post("/auth/login", response_model=TokenOut)
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email.strip().lower()))
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Неверный email или пароль")
    return TokenOut(token=create_token(user), email=user.email)


# ---------- Admin ----------

@admin.get("/me")
def me(user: User = Depends(current_user)):
    return {"email": user.email}


@admin.get("/bookings", response_model=list[BookingOut])
def admin_bookings(start: date = Query(alias="from"), end: date = Query(alias="to"), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Booking)
        .options(joinedload(Booking.master), joinedload(Booking.service), joinedload(Booking.client))
        .where(Booking.start >= datetime.combine(start, time.min), Booking.start < datetime.combine(end + timedelta(days=1), time.min))
        .order_by(Booking.start)
    ).all()
    return [booking_out(b) for b in rows]


@admin.patch("/bookings/{booking_id}", response_model=BookingOut)
def set_status(booking_id: int, data: StatusIn, db: Session = Depends(get_db)):
    booking = db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(404, "Запись не найдена")
    booking.status = data.status
    db.commit()
    return booking_out(booking)


@admin.get("/clients", response_model=list[ClientOut])
def admin_clients(db: Session = Depends(get_db)):
    now = business_now()
    clients = db.scalars(select(Client).options(joinedload(Client.bookings))).unique().all()
    out = []
    for c in clients:
        done = [b for b in c.bookings if b.status == "completed"]
        upcoming = [b.start for b in c.bookings if b.start >= now and b.status in ("new", "confirmed")]
        out.append(ClientOut(
            id=c.id, name=c.name, phone=c.phone, visits=len(done), spent=sum(b.price for b in done),
            last_visit=max((b.start for b in done), default=None), next_visit=min(upcoming, default=None),
        ))
    return sorted(out, key=lambda c: (-c.spent, c.name))


@admin.get("/services", response_model=list[ServiceOut])
def admin_services(db: Session = Depends(get_db)):
    return db.scalars(select(Service).order_by(Service.id)).all()


@admin.post("/services", response_model=ServiceOut, status_code=201)
def create_service(data: ServiceIn, db: Session = Depends(get_db)):
    service = Service(**data.model_dump())
    db.add(service)
    db.commit()
    return service


@admin.put("/services/{service_id}", response_model=ServiceOut)
def update_service(service_id: int, data: ServiceIn, db: Session = Depends(get_db)):
    service = db.get(Service, service_id)
    if service is None:
        raise HTTPException(404, "Услуга не найдена")
    for k, v in data.model_dump().items():
        setattr(service, k, v)
    db.commit()
    return service


@admin.delete("/services/{service_id}", status_code=204)
def delete_service(service_id: int, db: Session = Depends(get_db)):
    service = db.get(Service, service_id)
    if service is None:
        raise HTTPException(404, "Услуга не найдена")
    has_bookings = db.scalar(select(func.count()).select_from(Booking).where(Booking.service_id == service_id))
    if has_bookings:
        service.active = False  # keep history intact, just hide it
    else:
        db.delete(service)
    db.commit()


@admin.get("/stats", response_model=StatsOut)
def stats(days: int = Query(30, ge=7, le=365), db: Session = Depends(get_db)):
    today = business_now().date()
    start = today - timedelta(days=days - 1)
    prev_start = start - timedelta(days=days)

    rows = db.scalars(
        select(Booking).options(joinedload(Booking.service), joinedload(Booking.master))
        .where(Booking.start >= datetime.combine(prev_start, time.min), Booking.start < datetime.combine(today + timedelta(days=1), time.min))
    ).all()
    cur = [b for b in rows if b.start.date() >= start]
    prev = [b for b in rows if b.start.date() < start]
    done = [b for b in cur if b.status == "completed"]

    by_day = {start + timedelta(days=i): [0, 0] for i in range(days)}
    for b in done:
        by_day[b.start.date()][0] += b.price
        by_day[b.start.date()][1] += 1

    top: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for b in done:
        top[b.service.name][0] += 1
        top[b.service.name][1] += b.price

    masters = db.scalars(select(Master).options(joinedload(Master.schedules)).order_by(Master.id)).unique().all()
    loads = []
    for m in masters:
        available = 0
        for i in range(days):
            hours = working_hours(m, start + timedelta(days=i))
            if hours:
                (ws, we), breaks = hours
                available += (we - ws) - sum(e - s for s, e in breaks)
        mine = [b for b in done if b.master_id == m.id]
        booked = sum((b.end - b.start).seconds // 60 for b in mine)
        loads.append(MasterLoad(id=m.id, name=m.name, color=m.color,
                                utilization=round(booked / available, 3) if available else 0.0,
                                revenue=sum(b.price for b in mine)))

    first_visits = db.execute(
        select(Booking.client_id, func.min(Booking.start)).where(Booking.status == "completed").group_by(Booking.client_id)
    ).all()
    new_clients = sum(1 for _, first in first_visits if start <= first.date() <= today)

    revenue = sum(b.price for b in done)
    cancelled = sum(1 for b in cur if b.status in ("cancelled", "no_show"))
    return StatsOut(
        days=days,
        revenue=revenue,
        revenue_prev=sum(b.price for b in prev if b.status == "completed"),
        bookings=len(done),
        bookings_prev=sum(1 for b in prev if b.status == "completed"),
        avg_check=revenue // len(done) if done else 0,
        new_clients=new_clients,
        cancel_rate=round(cancelled / len(cur), 3) if cur else 0.0,
        by_day=[DayStat(date=d, revenue=v[0], bookings=v[1]) for d, v in by_day.items()],
        top_services=sorted((TopService(name=k, bookings=v[0], revenue=v[1]) for k, v in top.items()), key=lambda t: -t.revenue)[:5],
        masters=loads,
    )
