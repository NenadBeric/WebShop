from __future__ import annotations

from dataclasses import dataclass

RECEPTION_ROLES = frozenset({"WEBSHOP_RECEPTION", "WEBSHOP_MANAGER", "WEBSHOP_OWNER", "ADMIN"})
MANAGER_ROLES = frozenset({"WEBSHOP_MANAGER", "WEBSHOP_OWNER", "ADMIN"})
OWNER_ROLES = frozenset({"WEBSHOP_OWNER", "ADMIN"})
CUSTOMER_ROLES = frozenset({"WEBSHOP_CUSTOMER", "WEBSHOP_RECEPTION", "WEBSHOP_MANAGER", "WEBSHOP_OWNER", "ADMIN"})
STAFF_ADMIN_ROLES = frozenset({"WEBSHOP_MANAGER", "WEBSHOP_OWNER", "ADMIN"})

_ALL_ASSIGNABLE = frozenset(
    {"ADMIN", "WEBSHOP_OWNER", "WEBSHOP_MANAGER", "WEBSHOP_RECEPTION", "WEBSHOP_CUSTOMER"}
)
_OWNER_ASSIGNABLE = frozenset({"WEBSHOP_MANAGER", "WEBSHOP_RECEPTION", "WEBSHOP_CUSTOMER"})
_MANAGER_ASSIGNABLE = frozenset({"WEBSHOP_RECEPTION", "WEBSHOP_CUSTOMER"})


@dataclass
class CurrentUser:
    sub: str
    tenant_id: str
    role: str
    email: str
    name: str

    def is_admin(self) -> bool:
        return self.role == "ADMIN"

    def can_reception(self) -> bool:
        return self.role in RECEPTION_ROLES

    def can_manage_catalog(self) -> bool:
        return self.role in MANAGER_ROLES

    def can_shop(self) -> bool:
        return self.role in CUSTOMER_ROLES

    def can_manage_staff(self) -> bool:
        return self.role in STAFF_ADMIN_ROLES

    def assignable_staff_roles(self) -> frozenset[str]:
        if self.role == "ADMIN":
            return _ALL_ASSIGNABLE
        if self.role == "WEBSHOP_OWNER":
            return _OWNER_ASSIGNABLE
        if self.role == "WEBSHOP_MANAGER":
            return _MANAGER_ASSIGNABLE
        return frozenset()


def may_modify_staff_row(actor: CurrentUser, target_row_role: str) -> bool:
    """Da li uloga sme da menja/deaktivira zapis sa datom ulogom (ciljni red u tenant_staff)."""
    if actor.is_admin():
        return True
    if actor.role == "WEBSHOP_OWNER":
        return target_row_role in ("WEBSHOP_MANAGER", "WEBSHOP_RECEPTION", "WEBSHOP_CUSTOMER")
    if actor.role == "WEBSHOP_MANAGER":
        return target_row_role in ("WEBSHOP_RECEPTION", "WEBSHOP_CUSTOMER")
    return False
