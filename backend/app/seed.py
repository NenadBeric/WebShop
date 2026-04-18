"""Idempotent seed za lokalni razvoj (dev korisnici + demo proizvodi)."""

from __future__ import annotations

import logging
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session
from app.models.dev_user import DevUser
from app.models.tenant_staff import TenantStaff
from app.models.measure_unit import MeasureUnit
from app.models.product import Product
from app.models.product_type import ProductType
from app.models.tenant_profile import TenantLocation, TenantProfile
from app.security.passwords import hash_password
from app.services.vat import gross_from_net

logger = logging.getLogger(__name__)

DEMO_TENANT = "demo-gym"


async def _seed_dev_users(session: AsyncSession) -> None:
    users = [
        ("customer@webshop.demo", "WEBSHOP_CUSTOMER", "Demo kupac"),
        ("reception@webshop.demo", "WEBSHOP_RECEPTION", "Demo recepcija"),
        ("manager@webshop.demo", "WEBSHOP_MANAGER", "Demo menadžer"),
        ("owner@webshop.demo", "WEBSHOP_OWNER", "Demo vlasnik"),
        ("admin@webshop.demo", "ADMIN", "Demo admin"),
    ]
    hp = hash_password("demo123")
    for email, role, name in users:
        r = await session.execute(select(DevUser).where(DevUser.email == email))
        row = r.scalar_one_or_none()
        if row is None:
            session.add(
                DevUser(
                    email=email,
                    password_hash=hp,
                    tenant_id=DEMO_TENANT,
                    role=role,
                    display_name=name,
                )
            )
        else:
            row.tenant_id = DEMO_TENANT
            row.role = role
            row.display_name = name
            row.password_hash = hp
    await session.commit()


async def _seed_tenant_staff_demo(session: AsyncSession) -> None:
    """Isti demo nalozi kao DevUser — redovi u tenant_staff da se vide na stranici Korisnici."""
    rows = [
        ("customer@webshop.demo", "WEBSHOP_CUSTOMER", "Demo kupac"),
        ("reception@webshop.demo", "WEBSHOP_RECEPTION", "Demo recepcija"),
        ("manager@webshop.demo", "WEBSHOP_MANAGER", "Demo menadžer"),
        ("owner@webshop.demo", "WEBSHOP_OWNER", "Demo vlasnik"),
        ("admin@webshop.demo", "ADMIN", "Demo admin"),
    ]
    for email, role, name in rows:
        en = email.strip().lower()
        r = await session.execute(
            select(TenantStaff).where(
                TenantStaff.tenant_id == DEMO_TENANT,
                TenantStaff.email_normalized == en,
            )
        )
        row = r.scalar_one_or_none()
        if row is None:
            session.add(
                TenantStaff(
                    tenant_id=DEMO_TENANT,
                    email=email.strip(),
                    email_normalized=en,
                    display_name=name,
                    role=role,
                    active=True,
                )
            )
        else:
            row.email = email.strip()
            row.display_name = name
            row.role = role
            row.active = True
    await session.commit()


async def _ensure_measure_units(session: AsyncSession) -> dict[str, int]:
    for n, so in (("kom", 0), ("kg", 1), ("l", 2)):
        r = await session.execute(
            select(MeasureUnit).where(MeasureUnit.tenant_id == DEMO_TENANT, MeasureUnit.name == n)
        )
        if r.scalar_one_or_none() is None:
            session.add(MeasureUnit(tenant_id=DEMO_TENANT, name=n, sort_order=so))
    await session.commit()
    out: dict[str, int] = {}
    r = await session.execute(select(MeasureUnit).where(MeasureUnit.tenant_id == DEMO_TENANT))
    for u in r.scalars().all():
        out[u.name] = u.id
    return out


async def _ensure_product_types(session: AsyncSession) -> dict[str, int]:
    names = ["Šejk", "Suplement", "Hrana"]
    for n in names:
        r = await session.execute(
            select(ProductType).where(ProductType.tenant_id == DEMO_TENANT, ProductType.name == n)
        )
        if r.scalar_one_or_none() is None:
            session.add(ProductType(tenant_id=DEMO_TENANT, name=n, sort_order=0))
    await session.commit()
    out: dict[str, int] = {}
    r = await session.execute(select(ProductType).where(ProductType.tenant_id == DEMO_TENANT))
    for pt in r.scalars().all():
        out[pt.name] = pt.id
    return out


async def _ensure_tenant_profile(session: AsyncSession) -> None:
    r = await session.get(TenantProfile, DEMO_TENANT)
    if r is not None:
        return
    session.add(
        TenantProfile(
            tenant_id=DEMO_TENANT,
            legal_name="Demo teretana d.o.o.",
            trade_name="Demo Gym",
            pib="107777777",
            mb="21234567",
            address_line="Bulevar demo 1",
            city="Beograd",
            postal_code="11000",
            country="RS",
            phone="+381 11 000 0000",
            contact_email="info@webshop.demo",
            website="",
            timezone="Europe/Belgrade",
            terms_note="Plaćanje na recepciji prilikom preuzimanja.",
            max_schedule_days_ahead=5,
            min_notice_hours_before_pickup=0,
            pickup_grace_hours_after_slot=24,
        )
    )
    await session.flush()
    session.add(
        TenantLocation(
            tenant_id=DEMO_TENANT,
            code="MAIN",
            name="Glavna recepcija",
            address_line="Bulevar demo 1",
            sort_order=0,
            is_active=True,
        )
    )
    session.add(
        TenantLocation(
            tenant_id=DEMO_TENANT,
            code="POOL",
            name="Bazen",
            address_line="Bazen — isti objekat",
            sort_order=1,
            is_active=True,
        )
    )
    await session.commit()


async def _seed_products(session: AsyncSession) -> None:
    r = await session.execute(select(Product).where(Product.tenant_id == DEMO_TENANT).limit(1))
    if r.scalar_one_or_none():
        return
    types = await _ensure_product_types(session)
    units = await _ensure_measure_units(session)
    vat = Decimal("20")
    samples = [
        ("Protein šejk čokolada", "50g proteina, priprema u teretani.", Decimal("291.67"), types["Šejk"], Decimal("50")),
        ("Kreatin monohidrat", "500g", Decimal("2333.33"), types["Suplement"], Decimal("500")),
        ("Grčki jogurt", "Za poslije treninga", Decimal("183.33"), types["Hrana"], Decimal("1")),
    ]
    imgs = [
        "https://placehold.co/400x300?text=Shake",
        "https://placehold.co/400x300?text=Creatine",
        "https://placehold.co/400x300?text=Yogurt",
    ]
    products: list[Product] = []
    for (name, desc, net, tid, qty), img in zip(samples, imgs, strict=True):
        gross = gross_from_net(net, vat)
        products.append(
            Product(
                tenant_id=DEMO_TENANT,
                product_type_id=tid,
                measure_unit_id=units["kom"],
                quantity=qty,
                name=name,
                description=desc,
                vat_rate_percent=vat,
                price_net=net,
                price_gross=gross,
                image_url=img,
                available=True,
                replacement_product_ids=[],
            )
        )
    for p in products:
        session.add(p)
    await session.commit()
    r = await session.execute(select(Product).where(Product.tenant_id == DEMO_TENANT))
    by_name = {p.name: p for p in r.scalars().all()}
    shake = by_name.get("Protein šejk čokolada")
    yogurt = by_name.get("Grčki jogurt")
    if shake and yogurt:
        shake.replacement_product_ids = [yogurt.id]
        await session.commit()


async def run_seed_if_enabled() -> None:
    if not settings.WEBSHOP_SEED_DEMO or settings.ENVIRONMENT == "production":
        return
    async with async_session() as session:
        await _seed_dev_users(session)
        try:
            await _ensure_tenant_profile(session)
            await _seed_tenant_staff_demo(session)
            await _ensure_product_types(session)
            await _ensure_measure_units(session)
            await _seed_products(session)
        except ProgrammingError:
            await session.rollback()
            logger.exception(
                "WebShop seed: nedostaje očekivana šema (npr. measure_units ili product_types). "
                "Pokrenite migracije: alembic upgrade head (u kontejneru backend: docker compose exec backend alembic upgrade head). "
                "Dev korisnici su ipak osveženi — login može raditi; katalog može padati dok migracije nisu primenjene."
            )
            return
    logger.info("WebShop seed (dev) proveren / primenjen.")
