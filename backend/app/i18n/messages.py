from __future__ import annotations

import contextlib
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

_current_lang: ContextVar[str] = ContextVar("_current_lang", default="sr")

SUPPORTED_LANGS = ("sr", "en", "ru", "zh")

MESSAGES: dict[str, dict[str, str]] = {
    "not_found": {
        "sr": "Podatak nije pronađen.",
        "en": "Resource not found.",
        "ru": "Данные не найдены.",
        "zh": "未找到数据。",
    },
    "forbidden": {
        "sr": "Nemate dozvolu.",
        "en": "Forbidden.",
        "ru": "Нет доступа.",
        "zh": "无权限。",
    },
    "invalid_token": {
        "sr": "Nevažeći token.",
        "en": "Invalid token.",
        "ru": "Недействительный токен.",
        "zh": "无效的令牌。",
    },
    "legacy_auth_disabled": {
        "sr": "Lokalni login je isključen.",
        "en": "Legacy login is disabled.",
        "ru": "Локальный вход отключён.",
        "zh": "已禁用本地登录。",
    },
    "bad_credentials": {
        "sr": "Pogrešan email ili lozinka.",
        "en": "Invalid email or password.",
        "ru": "Неверный email или пароль.",
        "zh": "邮箱或密码错误。",
    },
    "validation_error": {
        "sr": "Neispravan zahtev.",
        "en": "Invalid request.",
        "ru": "Неверный запрос.",
        "zh": "请求无效。",
    },
    "invalid_order_qr": {
        "sr": "QR kod nije prepoznat kao porudžbina.",
        "en": "QR code is not a valid order code.",
        "ru": "QR-код не распознан как заказ.",
        "zh": "无法识别为订单二维码。",
    },
    "product_unavailable": {
        "sr": "Proizvod nije dostupan.",
        "en": "Product is not available.",
        "ru": "Товар недоступен.",
        "zh": "商品不可用。",
    },
    "order_not_editable": {
        "sr": "Narudžbina se ne može menjati u ovom statusu.",
        "en": "Order cannot be changed in this status.",
        "ru": "Заказ нельзя изменить в этом статусе.",
        "zh": "此状态下无法修改订单。",
    },
    "order_pending_customer": {
        "sr": "Čeka se odgovor kupca (zamena ili smanjenje količine).",
        "en": "Awaiting customer response (replacement or quantity change).",
        "ru": "Ожидается ответ покупателя (замена или изменение количества).",
        "zh": "正在等待顾客确认（换货或数量变更）。",
    },
    "order_approve_customer_rejected_line": {
        "sr": "Kupac je odbio poslednji predlog na jednoj ili više stavki — uklonite te stavke iz porudžbine (ili pošaljite novi predlog kupcu) pre celokupnog odobrenja.",
        "en": "The customer rejected the latest proposal on one or more lines — remove those lines (or send a new proposal) before approving the whole order.",
        "ru": "Покупатель отклонил последнее предложение по одной или нескольким позициям — удалите эти позиции (или отправьте новое предложение) перед полным одобрением заказа.",
        "zh": "顾客已拒绝一条或多条明细上的最新建议——请先删除这些明细（或发送新的建议），再整单批准。",
    },
    "mark_ready_wrong_status": {
        "sr": "„Spremno za preuzimanje“ je moguće samo kada je narudžbina u statusu „Delimično — čeka zamenu“ (nakon rešenih predloga). Za novu porudžbinu koristite „Odobri celu“.",
        "en": "“Ready for pickup” is only available when the order is in “Partial — awaiting replacement” (after proposals are resolved). For a new order use “Approve entire order”.",
        "ru": "«Готов к выдаче» доступен только в статусе «Частично — ожидается замена» (после решения предложений). Для нового заказа используйте «Одобрить весь заказ».",
        "zh": "仅当订单处于“部分待换货”（建议已处理）时才能标记为待取货；新订单请使用“批准整单”。",
    },
    "mark_picked_up_wrong_status": {
        "sr": "„Preuzeto“ je moguće samo kada je status „Spremno za preuzimanje“.",
        "en": "“Picked up” is only available when the status is “Ready for pickup”.",
        "ru": "«Выдан» можно только при статусе «Готов к выдаче».",
        "zh": "只有状态为“待取货”时才能标记为“已取货”。",
    },
    "order_bulk_accept_needs_pick": {
        "sr": "Za neke zamene postoji više ponuđenih proizvoda — prihvatite ih pojedinačno.",
        "en": "Some replacement offers have multiple options — please accept them one by one.",
        "ru": "У части предложений замены несколько вариантов — примите их по отдельности.",
        "zh": "部分换货建议有多个选项，请逐条确认。",
    },
    "cannot_remove_last_line": {
        "sr": "Ne možete ukloniti jedinu stavku — odbijte celu narudžbinu.",
        "en": "You cannot remove the only line item — reject the whole order instead.",
        "ru": "Нельзя удалить единственную позицию — отклоните весь заказ.",
        "zh": "无法删除唯一的明细行，请改为拒绝整单。",
    },
    "line_quantity_must_decrease": {
        "sr": "Navedite manju količinu od trenutne (npr. umesto 5 kom, 3 kom).",
        "en": "Enter a quantity smaller than the current line quantity.",
        "ru": "Укажите меньшее количество, чем сейчас в позиции.",
        "zh": "请输入小于当前数量的件数。",
    },
    "trainify_stub": {
        "sr": "Trainify integracija (Faza 2) — endpoint još nije aktivan.",
        "en": "Trainify integration (phase 2) — endpoint not active yet.",
        "ru": "Интеграция Trainify (фаза 2) — endpoint пока не активен.",
        "zh": "Trainify 集成（第二阶段）— 端点尚未启用。",
    },
    "price_vat_mismatch": {
        "sr": "Cena bez PDV, sa PDV i stopa nisu usklađeni.",
        "en": "Net price, gross price and VAT rate do not match.",
        "ru": "Цена без НДС, с НДС и ставка не согласованы.",
        "zh": "净价、含税价与税率不一致。",
    },
    "product_type_duplicate": {
        "sr": "Tip sa tim nazivom već postoji.",
        "en": "A type with this name already exists.",
        "ru": "Тип с таким названием уже есть.",
        "zh": "已存在同名类型。",
    },
    "product_type_in_use": {
        "sr": "Tip se ne može obrisati jer ga koriste proizvodi.",
        "en": "Cannot delete this type while products use it.",
        "ru": "Нельзя удалить тип: есть товары.",
        "zh": "有商品使用该类型，无法删除。",
    },
    "measure_unit_duplicate": {
        "sr": "Jedinica mere sa tim nazivom već postoji.",
        "en": "A unit of measure with this name already exists.",
        "ru": "Единица измерения с таким названием уже есть.",
        "zh": "已存在同名的计量单位。",
    },
    "measure_unit_in_use": {
        "sr": "Jedinicu mere nije moguće obrisati jer je koriste proizvodi.",
        "en": "Cannot delete this unit while products use it.",
        "ru": "Нельзя удалить единицу: есть товары.",
        "zh": "有商品使用该计量单位，无法删除。",
    },
    "upload_too_large": {
        "sr": "Fajl je prevelik.",
        "en": "File is too large.",
        "ru": "Файл слишком большой.",
        "zh": "文件过大。",
    },
    "pickup_too_soon": {
        "sr": "Preuzimanje je preblizu trenutku — povećajte min. najavu u podešavanjima ili izaberite kasniji termin.",
        "en": "Pickup is too soon — choose a later time or adjust minimum notice in tenant settings.",
        "ru": "Слишком раннее время получения — выберите позже или измените минимальный срок в настройках.",
        "zh": "取货时间过早，请选择更晚的时间或在租户设置中调整最短提前时间。",
    },
    "pickup_too_far": {
        "sr": "Datum preuzimanja je dalje nego što dozvoljavaju podešavanja (maks. broj dana unapred).",
        "en": "Pickup date is beyond the allowed scheduling window (max days ahead).",
        "ru": "Дата получения позже допустимого окна (макс. дней вперёд).",
        "zh": "取货日期超出允许的提前预约天数。",
    },
    "pickup_location_invalid": {
        "sr": "Izabrana lokacija nije važeća ili nije aktivna.",
        "en": "Selected pickup location is invalid or inactive.",
        "ru": "Выбранная локация недействительна или неактивна.",
        "zh": "所选取货地点无效或未启用。",
    },
    "tenant_location_duplicate_code": {
        "sr": "Kod lokacije mora biti jedinstven u listi.",
        "en": "Location codes must be unique in the list.",
        "ru": "Коды локаций в списке должны быть уникальны.",
        "zh": "地点代码在列表中必须唯一。",
    },
    "tenant_timezone_invalid": {
        "sr": "Neispravna IANA vremenska zona (npr. Europe/Belgrade).",
        "en": "Invalid IANA timezone (e.g. Europe/Belgrade).",
        "ru": "Неверная часовая зона IANA.",
        "zh": "无效的 IANA 时区。",
    },
    "email_order_subject": {
        "sr": "Potvrda porudžbine {order_number}",
        "en": "Order confirmation {order_number}",
        "ru": "Подтверждение заказа {order_number}",
        "zh": "订单确认 {order_number}",
    },
    "email_order_body_intro": {
        "sr": "Zdravo {name},\n\nHvala na porudžbini {order_number}. Platite na recepciji prilikom preuzimanja.\n\nStavke:",
        "en": "Hello {name},\n\nThank you for order {order_number}. Pay at reception on pickup.\n\nLines:",
        "ru": "Здравствуйте, {name},\n\nСпасибо за заказ {order_number}. Оплата на ресепшене при получении.\n\nПозиции:",
        "zh": "{name} 您好，\n\n感谢您的订单 {order_number}。取货时在柜台付款。\n\n明细：",
    },
    "email_order_line": {
        "sr": " - {product} × {qty} ({price})",
        "en": " - {product} × {qty} ({price})",
        "ru": " - {product} × {qty} ({price})",
        "zh": " - {product} × {qty} ({price})",
    },
    "email_order_line_discounted": {
        "sr": " - {product} × {qty} — redovna bruto cena {list_gross}, popust {sale_pct}%, ukupno {price}",
        "en": " - {product} × {qty} — list gross {list_gross}, {sale_pct}% off, line total {price}",
        "ru": " - {product} × {qty} — бруто по прайсу {list_gross}, скидка {sale_pct}%, итого {price}",
        "zh": " - {product} × {qty} — 目录含税价 {list_gross}，折扣 {sale_pct}%，小计 {price}",
    },
    "telegram_new_order": {
        "sr": "Nova porudžbina {order_number} ({total}). Kupac: {client}.",
        "en": "New order {order_number} ({total}). Customer: {client}.",
        "ru": "Новый заказ {order_number} ({total}). Клиент: {client}.",
        "zh": "新订单 {order_number}（{total}）。客户：{client}。",
    },
    "telegram_pickup_reminder": {
        "sr": "Za {minutes} min: pripremite porudžbinu {order_number} ({lines}) za {when}.",
        "en": "In {minutes} min: prepare order {order_number} ({lines}) for {when}.",
        "ru": "Через {minutes} мин: подготовьте заказ {order_number} ({lines}) к {when}.",
        "zh": "{minutes} 分钟后：请准备订单 {order_number}（{lines}），{when}。",
    },
    "telegram_day_reminder": {
        "sr": "Danas: pripremite porudžbinu {order_number} ({lines}) — okvirni dan.",
        "en": "Today: prepare order {order_number} ({lines}) — day window.",
        "ru": "Сегодня: подготовьте заказ {order_number} ({lines}) — день.",
        "zh": "今天：请准备订单 {order_number}（{lines}）— 按日。",
    },
    "ai_disabled": {
        "sr": "AI pretraga je isključena (podesite LLM_API_KEY na backendu, kao u Trainify-ju).",
        "en": "AI search is disabled (set LLM_API_KEY on the backend, same as Trainify).",
        "ru": "Поиск ИИ отключён (укажите LLM_API_KEY на бэкенде, как в Trainify).",
        "zh": "AI 搜索已关闭（请在后端设置 LLM_API_KEY，与 Trainify 相同）。",
    },
    "llm_misconfigured": {
        "sr": "LLM nije ispravno podešen (LLM_PROVIDER / LLM_MODEL / LLM_BASE_URL kao u Trainify .env).",
        "en": "LLM is misconfigured (check LLM_PROVIDER / LLM_MODEL / LLM_BASE_URL like Trainify .env).",
        "ru": "Неверная настройка LLM (проверьте LLM_PROVIDER / LLM_MODEL / LLM_BASE_URL как в Trainify .env).",
        "zh": "LLM 配置有误（请检查 LLM_PROVIDER / LLM_MODEL / LLM_BASE_URL，与 Trainify .env 一致）。",
    },
    "staff_email_zitadel_exists": {
        "sr": "Ovaj mejl već postoji u Zitadel-u. Obratite se administratoru da poveže nalog ili ukloni duplikat.",
        "en": "This email already exists in Zitadel. Contact your administrator to link the account or resolve the duplicate.",
        "ru": "Такой email уже есть в Zitadel. Обратитесь к администратору.",
        "zh": "该邮箱已在 Zitadel 中存在，请联系管理员处理。",
    },
    "staff_email_local_exists": {
        "sr": "Ovaj mejl je već registrovan u sistemu (lokalna baza).",
        "en": "This email is already registered in the system (local database).",
        "ru": "Этот email уже зарегистрирован в системе (локальная база).",
        "zh": "该邮箱已在系统（本地数据库）中注册。",
    },
    "staff_zitadel_not_configured": {
        "sr": "Provera Zitadela nije podešena (ZITADEL_MANAGEMENT_PAT / OIDC_ISSUER). Kontaktirajte administratora.",
        "en": "Zitadel check is not configured (ZITADEL_MANAGEMENT_PAT / OIDC_ISSUER). Contact your administrator.",
        "ru": "Проверка Zitadel не настроена (ZITADEL_MANAGEMENT_PAT / OIDC_ISSUER).",
        "zh": "未配置 Zitadel 校验（ZITADEL_MANAGEMENT_PAT / OIDC_ISSUER）。",
    },
    "staff_zitadel_check_failed": {
        "sr": "Provera mejla u Zitadel-u nije uspela. Pokušajte kasnije ili kontaktirajte administratora.",
        "en": "Could not verify the email in Zitadel. Try again later or contact your administrator.",
        "ru": "Не удалось проверить email в Zitadel. Повторите позже.",
        "zh": "无法在 Zitadel 中验证邮箱，请稍后重试或联系管理员。",
    },
    "staff_invalid_role": {
        "sr": "Izabrana uloga nije dozvoljena za vaš nalog.",
        "en": "The selected role is not allowed for your account.",
        "ru": "Выбранная роль недоступна для вашей учётной записи.",
        "zh": "您的账户不允许分配所选角色。",
    },
    "reception_desk_required": {
        "sr": "Izaberite lokaciju pulta (preuzimanja) u podešavanjima recepcije.",
        "en": "Select your reception desk (pickup location) before continuing.",
        "ru": "Выберите точку выдачи (локацию стойки) перед продолжением.",
        "zh": "请先在前台设置中选择您的取货地点。",
    },
    "reception_invalid_location": {
        "sr": "Lokacija nije važeća ili nije aktivna za ovu firmu.",
        "en": "The location is not valid or not active for this tenant.",
        "ru": "Локация недействительна или неактивна для этой компании.",
        "zh": "该地点对此商户无效或未启用。",
    },
}


def tr(key: str, **kwargs: object) -> str:
    lang = _current_lang.get()
    entry = MESSAGES.get(key)
    if entry is None:
        return key
    text = entry.get(lang) or entry.get("sr", key)
    if kwargs:
        with contextlib.suppress(KeyError, IndexError):
            text = text.format(**kwargs)
    return text


class I18nMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        header = request.headers.get("accept-language", "sr")
        lang = _parse_lang(header)
        token = _current_lang.set(lang)
        try:
            return await call_next(request)
        finally:
            _current_lang.reset(token)


def _parse_lang(header: str) -> str:
    for part in header.split(","):
        tag = part.split(";")[0].strip().lower()
        code = tag.split("-")[0]
        if code in SUPPORTED_LANGS:
            return code
    return "sr"
