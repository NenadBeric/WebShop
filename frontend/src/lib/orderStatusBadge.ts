const KNOWN = new Set([
  "pending_confirm",
  "partial_waiting_swap",
  "ready",
  "picked_up",
  "rejected",
  "expired",
]);

/** Klase za obojeni badge statusa narudžbine (dark/light u index.css). */
export function orderStatusBadgeClass(status: string): string {
  const suffix = KNOWN.has(status) ? status : "unknown";
  return `badge badge--status badge--status-${suffix}`;
}
