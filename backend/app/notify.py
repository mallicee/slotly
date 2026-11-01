"""Telegram notifications about new bookings (optional).

Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to enable. Failures are logged and
never break the booking itself.
"""

from __future__ import annotations

import html
import logging
import os

import httpx

from .schemas import BookingOut

log = logging.getLogger(__name__)

WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"]


def format_booking(b: BookingOut) -> str:
    e = html.escape
    when = f"{b.start:%d.%m} ({WEEKDAYS[b.start.weekday()]}) {b.start:%H:%M}–{b.end:%H:%M}"
    lines = [
        "🗓 <b>Новая запись</b>",
        f"{e(b.service_name)} · {b.price} ₽",
        f"{when} · мастер {e(b.master_name)}",
        f"👤 {e(b.client_name)}, {e(b.client_phone)}",
    ]
    if b.comment:
        lines.append(f"💬 {e(b.comment)}")
    return "\n".join(lines)


def send_booking_notification(b: BookingOut) -> None:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        return
    try:
        r = httpx.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": format_booking(b), "parse_mode": "HTML"},
            timeout=10,
        )
        r.raise_for_status()
    except httpx.HTTPError as exc:
        log.warning("Telegram notification failed for booking %s: %s", b.id, type(exc).__name__)
