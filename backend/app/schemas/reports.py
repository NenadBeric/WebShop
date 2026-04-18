from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field


class ShopReportKpiOut(BaseModel):
    orders_total: int = 0
    orders_open: int = 0
    orders_ready_or_picked: int = 0
    orders_rejected_or_expired: int = 0
    revenue_settled: Decimal = Field(Decimal("0"), description="Suma total za ready + picked_up")
    revenue_pipeline: Decimal = Field(
        Decimal("0"), description="Suma total isključujući rejected i expired"
    )


class ShopReportStatusSlice(BaseModel):
    status: str
    count: int


class ShopReportDailyRow(BaseModel):
    day: date
    orders: int = 0
    revenue_gross: Decimal = Decimal("0")


class ShopReportProductRow(BaseModel):
    product_id: int
    product_name: str
    quantity_sold: int = 0
    revenue_gross: Decimal = Decimal("0")
    quantity_sold_on_sale: int = 0
    revenue_gross_on_sale: Decimal = Decimal("0")


class ShopReportDiscountSummary(BaseModel):
    """Prodaja gde je na stavci bio aktiviran popust (snimak `sale_percent_applied`); katalog = trenutni proizvodi sa akcijom."""

    revenue_gross_from_discounted_lines: Decimal = Decimal("0")
    units_sold_on_discounted_lines: int = 0
    order_line_rows_on_sale: int = 0
    catalog_products_with_active_sale: int = 0


class ShopReportSourceSlice(BaseModel):
    source_code: str
    orders: int = 0
    revenue_gross: Decimal = Decimal("0")


class ShopReportOut(BaseModel):
    date_from: date
    date_to: date
    kpis: ShopReportKpiOut
    by_status: list[ShopReportStatusSlice]
    by_day: list[ShopReportDailyRow]
    top_products: list[ShopReportProductRow]
    by_source: list[ShopReportSourceSlice]
    discount: ShopReportDiscountSummary
