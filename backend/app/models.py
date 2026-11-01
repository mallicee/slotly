from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, String, Table, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


master_services = Table(
    "master_services",
    Base.metadata,
    Column("master_id", ForeignKey("masters.id", ondelete="CASCADE"), primary_key=True),
    Column("service_id", ForeignKey("services.id", ondelete="CASCADE"), primary_key=True),
)


class Service(Base):
    __tablename__ = "services"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(60))
    duration: Mapped[int]  # minutes
    price: Mapped[int]  # roubles
    active: Mapped[bool] = mapped_column(default=True)

    masters: Mapped[list[Master]] = relationship(secondary=master_services, back_populates="services")


class Master(Base):
    __tablename__ = "masters"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    role: Mapped[str] = mapped_column(String(80))
    color: Mapped[str] = mapped_column(String(9))

    services: Mapped[list[Service]] = relationship(secondary=master_services, back_populates="masters")
    schedules: Mapped[list[Schedule]] = relationship(back_populates="master", cascade="all, delete-orphan")


class Schedule(Base):
    """Weekly working hours. weekday: 0 = Monday ... 6 = Sunday."""

    __tablename__ = "schedules"

    id: Mapped[int] = mapped_column(primary_key=True)
    master_id: Mapped[int] = mapped_column(ForeignKey("masters.id", ondelete="CASCADE"))
    weekday: Mapped[int]
    start: Mapped[str] = mapped_column(String(5))
    end: Mapped[str] = mapped_column(String(5))
    break_start: Mapped[str | None] = mapped_column(String(5))
    break_end: Mapped[str | None] = mapped_column(String(5))

    master: Mapped[Master] = relationship(back_populates="schedules")


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    phone: Mapped[str] = mapped_column(String(20), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    bookings: Mapped[list[Booking]] = relationship(back_populates="client")


class Booking(Base):
    __tablename__ = "bookings"
    __table_args__ = (Index("ix_bookings_master_start", "master_id", "start"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    master_id: Mapped[int] = mapped_column(ForeignKey("masters.id"))
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id"))
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    start: Mapped[datetime] = mapped_column(DateTime)
    end: Mapped[datetime] = mapped_column(DateTime)
    price: Mapped[int]
    status: Mapped[str] = mapped_column(String(12), default="new")
    comment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    master: Mapped[Master] = relationship()
    service: Mapped[Service] = relationship()
    client: Mapped[Client] = relationship(back_populates="bookings")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(120), unique=True)
    password_hash: Mapped[str] = mapped_column(String(200))


STATUSES = ("new", "confirmed", "completed", "cancelled", "no_show")
ACTIVE_STATUSES = ("new", "confirmed", "completed")  # statuses that occupy time
