"""Mejl + Telegram nakon kreiranja porudžbine (ne ruši API ako kanal padne)."""

from __future__ import annotations

import html
import logging
import smtplib
from decimal import Decimal
from email.mime.text import MIMEText

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.i18n.messages import MESSAGES
from app.models.shop_order import Order, OrderLine
from app.models.tenant_profile import TenantProfile
from app.services.telegram_api import resolve_telegram_bot_token, send_telegram_message

logger = logging.getLogger(__name__)


def _t(key: str, lang: str, **kwargs: object) -> str:
    lang = lang if lang in ("sr", "en", "ru", "zh") else "sr"
    row = MESSAGES.get(key) or {}
    text = row.get(lang) or row.get("sr", key)
    if kwargs:
        try:
            return str(text).format(**kwargs)
        except (KeyError, ValueError):
            return str(text)
    return str(text)


def _send_smtp_email(
    *,
    host: str,
    port: int,
    user: str,
    password: str,
    use_tls: bool,
    mail_from: str,
    to_addr: str,
    subject: str,
    body: str,
) -> None:
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = mail_from
    msg["To"] = to_addr

    with smtplib.SMTP(host, port, timeout=30) as smtp:
        smtp.ehlo()
        if use_tls:
            smtp.starttls()
            smtp.ehlo()
        if user:
            smtp.login(user, password)
        smtp.sendmail(mail_from, [to_addr], msg.as_string())


async def _telegram_send(text: str, chat_id: str) -> None:
    token = (settings.TELEGRAM_BOT_TOKEN or "").strip()
    if not token or not chat_id.strip():
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(url, json={"chat_id": chat_id.strip(), "text": text[:4000]})
        r.raise_for_status()


async def dispatch_after_order_created(db: AsyncSession, order: Order) -> None:
    """Poziva se odmah posle commit-a nove porudžbine."""
    lang = (order.preferred_lang or "sr")[:8]
    if lang not in ("sr", "en", "ru", "zh"):
        lang = "sr"

    p = await db.get(TenantProfile, order.tenant_id)
    if not p:
        p = TenantProfile(tenant_id=order.tenant_id)

    await db.refresh(order, ["lines"])
    lines = list(order.lines or [])
    for ln in lines:
        await db.refresh(ln, ["product"])

    # --- Mejl kupcu ---
    to_email = (order.client_email or "").strip()
    smtp_host = (p.smtp_host or "").strip() or (settings.SMTP_HOST or "").strip()
    smtp_port = int(p.smtp_port or settings.SMTP_PORT or 587)
    smtp_user = (p.smtp_user or "").strip() or (settings.SMTP_USER or "").strip()
    smtp_password = (p.smtp_password or "").strip() or (settings.SMTP_PASSWORD or "").strip()
    mail_from = (p.smtp_from or "").strip() or (settings.SMTP_FROM or "").strip() or "webshop@localhost"
    use_tls = bool(p.smtp_use_tls)

    if smtp_host and to_email:
        subject = _t("email_order_subject", lang, order_number=order.order_number)
        name = f"{order.client_first_name or ''} {order.client_last_name or ''}".strip() or order.client_email
        body_parts = [_t("email_order_body_intro", lang, name=name, order_number=order.order_number)]
        for ln in lines:
            pr = ln.product
            pname = pr.name if pr else str(ln.product_id)
            price = str(ln.unit_price * Decimal(ln.quantity))
            sp = int(getattr(ln, "sale_percent_applied", 0) or 0)
            if sp > 0:
                body_parts.append(
                    _t(
                        "email_order_line_discounted",
                        lang,
                        product=pname,
                        qty=str(ln.quantity),
                        list_gross=str(getattr(ln, "catalog_unit_price_gross", ln.unit_price)),
                        sale_pct=str(sp),
                        price=price,
                    ),
                )
            else:
                body_parts.append(
                    _t("email_order_line", lang, product=pname, qty=str(ln.quantity), price=price),
                )
        body = "\n".join(body_parts)
        try:

            def _run() -> None:
                _send_smtp_email(
                    host=smtp_host,
                    port=smtp_port,
                    user=smtp_user,
                    password=smtp_password,
                    use_tls=use_tls,
                    mail_from=mail_from,
                    to_addr=to_email,
                    subject=subject,
                    body=body,
                )

            import asyncio

            await asyncio.to_thread(_run)
            logger.info("Order email poslat: %s → %s", order.order_number, to_email)
        except Exception:
            logger.exception("Slanje mejla porudžbine %s nije uspelo", order.order_number)
    else:
        logger.info(
            "Order email preskočen (SMTP host=%s, kupac email=%s): broj=%s",
            bool(smtp_host),
            bool(to_email),
            order.order_number,
        )

    # --- Telegram recepcija ---
    if not p.telegram_notify_new_order:
        return
    chat = (p.telegram_chat_id or "").strip()
    token = resolve_telegram_bot_token(p)
    if not chat or not token:
        return
    client_label = html.escape(
        f"{order.client_first_name or ''} {order.client_last_name or ''}".strip() or order.client_email or "?"
    )
    try:
        text = _t(
            "telegram_new_order",
            lang,
            order_number=order.order_number,
            total=str(order.total),
            client=client_label,
        )
        await send_telegram_message(text, chat, token=token)
    except Exception:
        logger.exception("Telegram nova porudžbina %s nije poslata", order.order_number)
