"""Akcija na proizvodu — procenat sniženja; kataloške cene u bazi ostaju neizmenjene."""

from decimal import ROUND_HALF_UP, Decimal

from app.models.product import Product
from app.services.vat import net_from_gross

_Q = Decimal("0.01")


def _discount_factor(sale_percent: int) -> Decimal:
    sp = max(0, min(99, int(sale_percent)))
    if sp <= 0:
        return Decimal("1")
    return (Decimal("100") - Decimal(sp)) / Decimal("100")


def effective_price_gross(product: Product) -> Decimal:
    g = Decimal(product.price_gross)
    f = _discount_factor(int(getattr(product, "sale_percent", 0) or 0))
    return (g * f).quantize(_Q, ROUND_HALF_UP)


def effective_price_net(product: Product) -> Decimal:
    return net_from_gross(effective_price_gross(product), Decimal(product.vat_rate_percent))


def sale_percent_at_purchase(product: Product) -> int:
    """Procenat akcije na proizvodu u trenutku formiranja stavke (0–99)."""
    return max(0, min(99, int(getattr(product, "sale_percent", 0) or 0)))
