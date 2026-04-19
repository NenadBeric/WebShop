from pydantic import BaseModel


class AdminTenantBriefOut(BaseModel):
    tenant_id: str
    trade_name: str

    model_config = {"from_attributes": True}
