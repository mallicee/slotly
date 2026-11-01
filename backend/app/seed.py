"""Demo data: catalog from shared/catalog.json plus ~6 weeks of realistic bookings."""

from __future__ import annotations

import json
import os
import random
from datetime import date, datetime, time, timedelta
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import hash_password
from .availability import free_slots
from .models import Booking, Client, Master, Schedule, Service, User
from .scheduling import STEP, working_hours

CATALOG = Path(os.getenv("CATALOG_PATH", Path(__file__).resolve().parents[2] / "shared" / "catalog.json"))

FIRST = ["Алексей", "Мария", "Иван", "Анна", "Дмитрий", "Екатерина", "Максим", "Ольга", "Сергей", "Полина",
         "Никита", "Алина", "Егор", "Дарья", "Кирилл", "Виктория", "Роман", "Софья", "Павел", "Ксения"]
LAST = ["И.", "С.", "К.", "М.", "П.", "Л.", "В.", "Н.", "Р.", "Т."]


def load_catalog() -> dict:
    return json.loads(CATALOG.read_text(encoding="utf-8"))


def seed_catalog(db: Session, catalog: dict) -> None:
    services = {s["id"]: Service(**s) for s in catalog["services"]}
    db.add_all(services.values())
    for m in catalog["masters"]:
        sch = m["schedule"]
        brk = sch.get("break") or [None, None]
        master = Master(id=m["id"], name=m["name"], role=m["role"], color=m["color"])
        master.services = [services[i] for i in m["services"]]
        master.schedules = [
            Schedule(weekday=d, start=sch["start"], end=sch["end"], break_start=brk[0], break_end=brk[1])
            for d in sch["days"]
        ]
        db.add(master)
    db.flush()


def seed_admin(db: Session, catalog: dict) -> None:
    email = os.getenv("ADMIN_EMAIL", catalog["demoAdmin"]["email"])
    password = os.getenv("ADMIN_PASSWORD", catalog["demoAdmin"]["password"])
    db.add(User(email=email.strip().lower(), password_hash=hash_password(password)))


def seed_bookings(db: Session, today: date, rng: random.Random, past_days: int = 62, future_days: int = 14) -> None:
    clients = []
    for i in range(140):
        name = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
        phone = f"+79{rng.randrange(10**8, 10**9):09d}"
        if phone not in {c.phone for c in clients}:
            clients.append(Client(name=name, phone=phone, created_at=datetime.combine(today, time()) - timedelta(days=rng.randrange(0, 120))))
    db.add_all(clients)
    regulars = clients[:35]  # some people come back often

    masters = db.scalars(select(Master)).all()
    for offset in range(-past_days, future_days + 1):
        day = today + timedelta(days=offset)
        # Fridays and weekends are busier; the future is less booked yet.
        load = 0.55 + (0.2 if day.weekday() >= 4 else 0) - (0.03 * max(offset, 0))
        for m in masters:
            hours = working_hours(m, day)
            if hours is None:
                continue
            work, breaks = hours
            busy: list[tuple[int, int]] = []
            cursor = work[0]
            while cursor < work[1]:
                service = rng.choice(m.services)
                slots = [t for t in free_slots(work=work, duration=service.duration, busy=busy, breaks=breaks, step=STEP) if t >= cursor]
                if not slots:
                    break
                t = slots[0]
                cursor = t + service.duration
                if rng.random() > load:
                    cursor += 30  # leave a gap
                    continue
                busy.append((t, t + service.duration))
                start = datetime.combine(day, time(t // 60, t % 60))
                if offset < 0:
                    status = rng.choices(["completed", "cancelled", "no_show"], [88, 8, 4])[0]
                else:
                    status = rng.choices(["confirmed", "new"], [70, 30])[0]
                client = rng.choice(regulars) if rng.random() < 0.45 else rng.choice(clients)
                db.add(Booking(
                    master_id=m.id, service_id=service.id, client=client, start=start,
                    end=start + timedelta(minutes=service.duration), price=service.price, status=status,
                    comment="", created_at=start - timedelta(days=rng.randrange(1, 10)),
                ))


def seed_all(db: Session, today: date, rng_seed: int = 42) -> None:
    catalog = load_catalog()
    seed_catalog(db, catalog)
    seed_admin(db, catalog)
    seed_bookings(db, today, random.Random(rng_seed))
    db.commit()


def business_info() -> dict:
    return load_catalog()["business"]
