import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.i18n import I18nMiddleware
from app.limiter import limiter
from app.routers import (
    admin_licenses,
    admin_tenants,
    ai,
    auth,
    cart,
    me_reception_desk,
    health,
    import_export,
    measure_units,
    notifications,
    orders,
    product_types,
    products,
    reports,
    public_tenant_theme,
    tenant_settings,
    tenant_staff,
    tenant_theme,
    uploads,
)
from app.models.ai_chat import AiChatMessage, AiChatSession  # noqa: F401
from app.models.license import LicenseAddon, LicensePlan, LicenseSubscription  # noqa: F401
from app.models.order_staff_event import OrderStaffEvent  # noqa: F401
from app.seed import run_seed_if_enabled

logger = logging.getLogger(__name__)


def _alembic_upgrade_dev() -> None:
    """Posle `uvicorn --reload` entrypoint se ne ponavlja — primeni migracije da šema prati model."""
    from alembic import command
    from alembic.config import Config

    root = Path(__file__).resolve().parent.parent
    prev = os.getcwd()
    try:
        os.chdir(root)
        cfg = Config(str(root / "alembic.ini"))
        command.upgrade(cfg, "head")
    finally:
        os.chdir(prev)


async def _telegram_reminders_loop() -> None:
    from app.database import async_session
    from app.services.telegram_scheduler import run_scheduled_telegram_reminders

    while True:
        await asyncio.sleep(60)
        try:
            async with async_session() as session:
                await run_scheduled_telegram_reminders(session)
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("Greška u Telegram podsjetnicima")


async def _expire_orders_loop() -> None:
    from app.database import async_session
    from app.services.tenant_service import expire_overdue_ready_orders

    while True:
        await asyncio.sleep(300)
        try:
            async with async_session() as session:
                n = await expire_overdue_ready_orders(session)
                if n:
                    logger.info("Automatski isteklo (ready) porudzbina: %s", n)
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("Greška u periodičnom isteku porudžbina (ready)")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    if settings.ENVIRONMENT == "development":
        try:
            await asyncio.to_thread(_alembic_upgrade_dev)
        except Exception:
            logger.exception("Alembic upgrade u lifespan-u nije uspeo (npr. baza nedostupna pri prvom startu)")
    await run_seed_if_enabled()
    expire_task = asyncio.create_task(_expire_orders_loop())
    telegram_task = asyncio.create_task(_telegram_reminders_loop())
    try:
        yield
    finally:
        telegram_task.cancel()
        try:
            await telegram_task
        except Exception:
            pass
        expire_task.cancel()
        try:
            await expire_task
        except Exception:
            pass


app = FastAPI(title="WebShop API", version="0.1.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(I18nMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=settings.UPLOAD_DIR), name="static")

app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(admin_licenses.router, prefix="/api/v1")
app.include_router(admin_tenants.router, prefix="/api/v1")
app.include_router(me_reception_desk.router, prefix="/api/v1")
app.include_router(product_types.router, prefix="/api/v1")
app.include_router(measure_units.router, prefix="/api/v1")
app.include_router(uploads.router, prefix="/api/v1")
app.include_router(products.router, prefix="/api/v1")
app.include_router(cart.router, prefix="/api/v1")
app.include_router(orders.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(import_export.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")
app.include_router(tenant_settings.router, prefix="/api/v1")
app.include_router(tenant_theme.router, prefix="/api/v1")
app.include_router(public_tenant_theme.router, prefix="/api/v1")
app.include_router(tenant_staff.router, prefix="/api/v1")
app.include_router(ai.router, prefix="/api/v1")
