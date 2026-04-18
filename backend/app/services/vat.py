"""PDV kalkulacije — moraju biti usklađene sa frontendom (`frontend/src/lib/vat.ts`)."""

from decimal import ROUND_HALF_UP, Decimal

Q = Decimal("0.01")
ALLOWED_VAT = (Decimal("0"), Decimal("10"), Decimal("20"))


def assert_allowed_vat(v: Decimal) -> None:
    if v not in ALLOWED_VAT:
        raise ValueError("invalid_vat")


def gross_from_net(net: Decimal, vat_percent: Decimal) -> Decimal:
    assert_allowed_vat(vat_percent)
    return (net * (Decimal("1") + vat_percent / Decimal("100"))).quantize(Q, ROUND_HALF_UP)


def net_from_gross(gross: Decimal, vat_percent: Decimal) -> Decimal:
    assert_allowed_vat(vat_percent)
    if vat_percent == 0:
        return gross.quantize(Q, ROUND_HALF_UP)
    return (gross / (Decimal("1") + vat_percent / Decimal("100"))).quantize(Q, ROUND_HALF_UP)


def prices_consistent(net: Decimal, gross: Decimal, vat_percent: Decimal, *, tol: Decimal = Decimal("0.02")) -> bool:
    assert_allowed_vat(vat_percent)
    exp = gross_from_net(net, vat_percent)
    return abs(exp - gross) <= tol
