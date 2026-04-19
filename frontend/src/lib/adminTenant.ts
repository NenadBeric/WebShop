/** Izabrana firma za ADMIN (JWT često nema tenant_id) — isti princip kao Trainify `trainify_selected_gym`. */

const STORAGE_KEY = "webshop_admin_tenant_id";

export function getAdminTenantId(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)?.trim();
    return v || null;
  } catch {
    return null;
  }
}

export function setAdminTenantIdInStorage(tenantId: string | null): void {
  try {
    if (tenantId && tenantId.trim()) {
      localStorage.setItem(STORAGE_KEY, tenantId.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}
