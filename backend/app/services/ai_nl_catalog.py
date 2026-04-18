"""Prirodnojezička pretraga kataloga (WEBSHOP_AI.md §2.1) — OpenAI-compatible chat API."""

from __future__ import annotations

import json
import logging
import re
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models.product import Product
from app.services.ai.llm_resolve import chat_completions_url_and_model
from app.services.product_sale import effective_price_gross, effective_price_net

logger = logging.getLogger(__name__)

# Gornja granica cene (RSD bruto) kada korisnik eksplicitno kaže do/ispod/…
_MAX_PRICE_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"\b(?:do|ispod|manje\s+od|pod|maksimumu?|maks\.?|max)\s+(\d{1,7}(?:[.,]\d{1,2})?)\s*(?:rsd|din(?:ara|ari)?)?\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:under|below|at\s+most)\s+(\d{1,7}(?:[.,]\d{1,2})?)\s*(?:rsd|din)?\b",
        re.IGNORECASE,
    ),
    re.compile(r"\bдо\s+(\d{1,7}(?:[.,]\d{1,2})?)\b", re.IGNORECASE),
)


def _parse_money_token(raw: str) -> Decimal | None:
    s = raw.strip().replace(",", ".")
    try:
        d = Decimal(s)
    except InvalidOperation:
        return None
    if d <= 0:
        return None
    return d


def _extract_max_price_rsd(query: str) -> Decimal | None:
    """Najstroža gornja granica (min od svih pogodaka) ako upit sadrži jasan budžet u RSD."""
    text = (query or "").strip()
    if not text:
        return None
    caps: list[Decimal] = []
    for pat in _MAX_PRICE_PATTERNS:
        for m in pat.finditer(text):
            d = _parse_money_token(m.group(1))
            if d is not None:
                caps.append(d)
    if not caps:
        return None
    return min(caps)


def _product_price_gross(p: Product) -> Decimal:
    try:
        return effective_price_gross(p)
    except Exception:
        return Decimal("0")


def _dec_str(v: object, *, places: str = "0.01") -> str:
    try:
        return str(Decimal(v).quantize(Decimal(places)))
    except Exception:
        return str(v)


def _product_row_json(p: Product) -> str:
    """Jedan JSON objekat po liniji — opis i specijalni znakovi bez problema kao u TSV."""
    tid = getattr(p.type_row, "name", "") if p.type_row else ""
    unit = getattr(p.measure_row, "name", "") if p.measure_row else ""
    desc = (p.description or "").strip()
    if len(desc) > 6000:
        desc = desc[:6000] + "…"
    repl = list(p.replacement_product_ids or [])
    row: dict[str, Any] = {
        "id": int(p.id),
        "name": p.name,
        "description": desc,
        "product_type_id": int(p.product_type_id),
        "product_type": tid,
        "measure_unit_id": int(p.measure_unit_id),
        "measure_unit": unit,
        "package_quantity": _dec_str(p.quantity, places="0.0001"),
        "price_net_rsd": _dec_str(p.price_net),
        "price_gross_rsd": _dec_str(p.price_gross),
        "sale_percent": int(getattr(p, "sale_percent", 0) or 0),
        "price_gross_effective_rsd": _dec_str(effective_price_gross(p)),
        "price_net_effective_rsd": _dec_str(effective_price_net(p)),
        "vat_percent": _dec_str(p.vat_rate_percent, places="0.01"),
        "available": bool(p.available),
        "replacement_product_ids": repl,
    }
    return json.dumps(row, ensure_ascii=False, separators=(",", ":"))


async def nl_catalog_search(db: AsyncSession, *, tenant_id: str, query: str) -> list[dict[str, Any]]:
    if not (settings.LLM_API_KEY or "").strip():
        raise ValueError("ai_disabled")

    r = await db.execute(
        select(Product)
        .where(Product.tenant_id == tenant_id, Product.available.is_(True))
        .options(selectinload(Product.type_row), selectinload(Product.measure_row))
        .order_by(Product.id)
        .limit(200)
    )
    products = list(r.scalars().all())
    if not products:
        return []

    max_price = _extract_max_price_rsd(query)
    if max_price is not None:
        before = len(products)
        products = [p for p in products if _product_price_gross(p) <= max_price]
        if not products:
            logger.info("AI katalog: nakon budžeta ≤%s nema proizvoda (bilo ih %s)", max_price, before)
            return []
        logger.debug("AI katalog: budžet ≤%s RSD, proizvoda %s", max_price, len(products))

    lines = [_product_row_json(p) for p in products]
    catalog_block = "\n".join(lines)
    try:
        url, model = chat_completions_url_and_model()
    except ValueError as e:
        raise ValueError("llm_misconfigured") from e
    budget_note = ""
    if max_price is not None:
        budget_note = (
            f" The user budget is at most {max_price} RSD gross per product (price_gross_rsd); "
            "never suggest a product whose price_gross_rsd exceeds this. "
        )
    sys = (
        "You are a catalog search assistant. Each line under 'Products:' is one JSON object for a product, "
        "with keys: id, name, description (full store text up to 6000 chars), product_type_id, product_type, "
        "measure_unit_id, measure_unit, package_quantity (amount per sellable unit, e.g. weight/volume count), "
        "price_net_rsd, price_gross_rsd (list/catalog VAT-inclusive RSD before sale), sale_percent (0–99; 0 means no sale), "
        "price_gross_effective_rsd and price_net_effective_rsd (prices after applying sale_percent), "
        "vat_percent, available, replacement_product_ids (IDs of substitute products if any). "
        "When sale_percent > 0, the customer pays price_gross_effective_rsd, not price_gross_rsd."
        + budget_note
        + " Use description, product_type, measure_unit and package_quantity together to judge edibility, "
        "portion size, diet suitability, and value. "
        "Given the user query and the list, respond with ONLY a JSON array of up to 12 objects: "
        '[{"product_id": <int>, "reason": "<short why it matches>"}] '
        "ordered by relevance (cheaper good fits first when the user cares about price). "
        "Only use product_id values that exist in the list. No markdown."
    )
    temp = min(float(settings.LLM_TEMPERATURE), 0.35)
    payload = {
        "model": model,
        "temperature": temp,
        "messages": [
            {"role": "system", "content": sys},
            {"role": "user", "content": f"Query: {query}\n\nProducts:\n{catalog_block}"},
        ],
    }
    headers = {"Authorization": f"Bearer {settings.LLM_API_KEY}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()

    content = (data.get("choices") or [{}])[0].get("message", {}).get("content") or "[]"
    content = content.strip()
    if content.startswith("```"):
        content = re.sub(r"^```[a-zA-Z]*\n?", "", content)
        content = re.sub(r"\n?```$", "", content).strip()

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        logger.warning("AI catalog JSON parse fail: %s", content[:200])
        return []

    if not isinstance(parsed, list):
        return []

    valid_ids = {int(p.id) for p in products}
    pmap = {int(p.id): p for p in products}
    out: list[dict[str, Any]] = []
    seen: set[int] = set()
    for item in parsed[:12]:
        if not isinstance(item, dict):
            continue
        try:
            pid = int(item.get("product_id", -1))
        except (TypeError, ValueError):
            continue
        if pid not in valid_ids or pid in seen:
            continue
        pr = pmap.get(pid)
        if max_price is not None and pr is not None and _product_price_gross(pr) > max_price:
            continue
        seen.add(pid)
        reason = str(item.get("reason", ""))[:300]
        name = pr.name if pr else str(pid)
        out.append({"product_id": pid, "name": name, "reason": reason})
    return out
