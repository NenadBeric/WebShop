from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    order_number: str
    event_type: str
    meta: dict = Field(default_factory=dict)
    read_at: datetime | None = None
    created_at: datetime


class NotificationReadBody(BaseModel):
    ids: list[int] = Field(default_factory=list, max_length=100)


class NotificationDeleteBody(BaseModel):
    ids: list[int] = Field(default_factory=list, max_length=200)
