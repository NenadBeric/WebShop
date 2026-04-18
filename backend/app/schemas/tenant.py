from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class TenantLocationOut(BaseModel):
    id: int
    code: str
    name: str
    address_line: str = ""
    sort_order: int = 0
    is_active: bool = True

    model_config = {"from_attributes": True}


class TenantLocationIn(BaseModel):
    code: str = Field(..., min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=255)
    address_line: str = Field(default="", max_length=2000)
    sort_order: int = Field(default=0, ge=0, le=9999)
    is_active: bool = True

    @field_validator("code")
    @classmethod
    def code_trim(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("code_empty")
        return s


class TenantProfileOut(BaseModel):
    tenant_id: str
    legal_name: str
    trade_name: str
    pib: str
    mb: str
    address_line: str
    city: str
    postal_code: str
    country: str
    phone: str
    contact_email: str
    website: str
    timezone: str
    terms_note: str
    max_schedule_days_ahead: int
    min_notice_hours_before_pickup: int
    pickup_grace_hours_after_slot: int
    locations: list[TenantLocationOut] = Field(default_factory=list)
    telegram_chat_id: str = ""
    telegram_bot_token_set: bool = False
    telegram_notify_new_order: bool = True
    notify_before_pickup_minutes: int = 10
    day_reminder_hour_local: int = 8
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_from: str = ""
    smtp_use_tls: bool = True
    smtp_password_set: bool = False


class TenantProfileUpdate(BaseModel):
    legal_name: str = Field(default="", max_length=255)
    trade_name: str = Field(default="", max_length=255)
    pib: str = Field(default="", max_length=32)
    mb: str = Field(default="", max_length=32)
    address_line: str = Field(default="", max_length=4000)
    city: str = Field(default="", max_length=128)
    postal_code: str = Field(default="", max_length=16)
    country: str = Field(default="RS", max_length=2)
    phone: str = Field(default="", max_length=64)
    contact_email: str = Field(default="", max_length=255)
    website: str = Field(default="", max_length=255)
    timezone: str = Field(default="Europe/Belgrade", max_length=64)
    terms_note: str = Field(default="", max_length=8000)
    max_schedule_days_ahead: int = Field(default=14, ge=0, le=365)
    min_notice_hours_before_pickup: int = Field(default=0, ge=0, le=168)
    pickup_grace_hours_after_slot: int = Field(default=24, ge=1, le=720)
    locations: list[TenantLocationIn] = Field(default_factory=list)
    telegram_chat_id: str = Field(default="", max_length=64)
    telegram_bot_token: str | None = Field(default=None, max_length=128)
    telegram_notify_new_order: bool = True
    notify_before_pickup_minutes: int = Field(default=10, ge=0, le=720)
    day_reminder_hour_local: int = Field(default=8, ge=0, le=23)
    smtp_host: str = Field(default="", max_length=255)
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_user: str = Field(default="", max_length=255)
    smtp_password: str | None = Field(default=None, max_length=255)
    smtp_from: str = Field(default="", max_length=255)
    smtp_use_tls: bool = True


class TenantOrderRulesOut(BaseModel):
    """Za checkout — kupac vidi pravila bez osetljivih podataka firme."""

    max_schedule_days_ahead: int
    min_notice_hours_before_pickup: int
    pickup_grace_hours_after_slot: int
    timezone: str
    locations: list[TenantLocationOut]
