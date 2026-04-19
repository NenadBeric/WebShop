import { FormEvent, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { InfoButton } from "../components/InfoButton";
import { ProductImageZoom } from "../components/ProductImageZoom";
import { SubstitutionOfferPick } from "../components/SubstitutionOfferPick";
import { apiFetch } from "../api/client";
import { orderStatusBadgeClass } from "../lib/orderStatusBadge";
import { canReception, useAuth } from "../auth/AuthContext";
import { useI18n } from "../i18n/I18nContext";
import type { OrderDetail, Product } from "../types";

function staffEventLabel(t: (k: string) => string, eventType: string) {
  const key = `order.staff_evt.${eventType}`;
  const mapped = t(key);
  return mapped === key ? eventType : mapped;
}

function statusLabel(t: (k: string) => string, status: string) {
  const key = `status.${status}`;
  const mapped = t(key);
  return mapped === key ? status : mapped;
}

export function OrderPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const role = user?.role || "";
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [subChoice, setSubChoice] = useState<Record<number, number>>({});
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [subPick, setSubPick] = useState<Record<number, number[]>>({});
  const [qtyDraft, setQtyDraft] = useState<Record<number, string>>({});
  const [lineBusy, setLineBusy] = useState(false);
  const [lineErr, setLineErr] = useState<string | null>(null);
  const [expandedLineId, setExpandedLineId] = useState<number | null>(null);
  const lineEditorAnchorRef = useRef<HTMLTableRowElement | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setErr(null);
    try {
      const o = await apiFetch<OrderDetail>(`/api/v1/orders/${id}`);
      setOrder(o);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (order?.status !== "pending_confirm") setExpandedLineId(null);
  }, [order?.status]);

  useEffect(() => {
    if (expandedLineId == null || !lineEditorAnchorRef.current) return;
    lineEditorAnchorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [expandedLineId]);

  const staff = canReception(role);

  useEffect(() => {
    const preloadDeskEditor =
      staff && order && order.is_my_order !== true && order.status === "pending_confirm";
    if (!preloadDeskEditor || !id) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const prods = await apiFetch<Product[]>("/api/v1/products");
        if (!cancelled) setCatalog(prods);
      } catch {
        if (!cancelled) setCatalog([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [staff, id, order?.status, order?.is_my_order]);

  const pendingCustomerLineIds = useMemo(() => {
    if (!order) return [];
    const qtyP = order.pending_quantity_reductions ?? [];
    const s = new Set<number>();
    for (const p of order.pending_substitutions) s.add(p.line_id);
    for (const p of qtyP) s.add(p.line_id);
    return Array.from(s).sort((a, b) => a - b);
  }, [order]);

  const anyMultiSub = useMemo(() => {
    if (!order) return false;
    return order.pending_substitutions.some((p) => (p.offered_product_ids?.length ?? 0) > 1);
  }, [order]);

  /** Poslednji završeni predlog zamene po `line_id`: true ako je status `rejected` (ne meša se sa starijim odbijanjem posle prihvata). */
  const lineLastSubstitutionRejected = useMemo(() => {
    if (!order) return new Map<number, boolean>();
    const resolved = order.resolved_substitutions ?? [];
    const byLine = new Map<number, { id: number; status: string }[]>();
    for (const r of resolved) {
      const lid = r.line_id;
      const arr = byLine.get(lid) ?? [];
      arr.push({ id: r.id, status: r.status });
      byLine.set(lid, arr);
    }
    const out = new Map<number, boolean>();
    for (const [lid, rows] of byLine) {
      const latest = rows.reduce((a, b) => (b.id > a.id ? b : a));
      out.set(lid, latest.status === "rejected");
    }
    return out;
  }, [order]);

  const canBulkAcceptPending = useMemo(() => {
    if (!order) return false;
    const qtyP = order.pending_quantity_reductions ?? [];
    return (qtyP.length > 0 || order.pending_substitutions.length > 0) && !anyMultiSub;
  }, [order, anyMultiSub]);

  /** Recepcija: koja dugmad smeju u kom statusu (usklađeno sa backend update_order_status). */
  const receptionStaffActions = useMemo(() => {
    const idle = {
      approve: { enabled: false as boolean, title: undefined as string | undefined },
      reject: { enabled: false as boolean, title: undefined as string | undefined },
      markReady: { enabled: false as boolean, title: undefined as string | undefined },
      markPickedUp: { enabled: false as boolean, title: undefined as string | undefined },
    };
    if (!order) return idle;
    const st = order.status;
    const pendingCustomer =
      (order.pending_substitutions?.length ?? 0) + (order.pending_quantity_reductions?.length ?? 0) > 0;
    const busy = lineBusy;
    const terminal = st === "picked_up" || st === "rejected" || st === "expired";

    const customerRejectedBlock = order.approve_blocked_by_customer_rejection === true;
    const approveEnabled =
      st === "pending_confirm" && !pendingCustomer && !busy && !customerRejectedBlock;
    const rejectEnabled = !terminal && !busy;
    const markReadyEnabled = st === "partial_waiting_swap" && !pendingCustomer && !busy;
    const markPickedEnabled = st === "ready" && !pendingCustomer && !busy;

    function blockedTitle(
      enabled: boolean,
      afterCommon: () => string | undefined,
    ): string | undefined {
      if (enabled) return undefined;
      if (busy) return t("reception.hint_busy");
      if (terminal) return t("reception.hint_terminal");
      if (pendingCustomer) return t("reception.hint_pending_customer");
      return afterCommon();
    }

    return {
      approve: {
        enabled: approveEnabled,
        title: blockedTitle(approveEnabled, () => {
          if (customerRejectedBlock) return t("reception.hint_approve_customer_rejected");
          if (st !== "pending_confirm") return t("reception.hint_approve_pending_confirm_only");
          return undefined;
        }),
      },
      reject: {
        enabled: rejectEnabled,
        title: rejectEnabled ? undefined : busy ? t("reception.hint_busy") : t("reception.hint_terminal"),
      },
      markReady: {
        enabled: markReadyEnabled,
        title: blockedTitle(markReadyEnabled, () =>
          st === "ready" || st === "picked_up"
            ? t("reception.hint_ready_already_past")
            : st === "pending_confirm"
              ? t("reception.hint_mark_ready_use_approve")
              : t("reception.hint_mark_ready_partial_only"),
        ),
      },
      markPickedUp: {
        enabled: markPickedEnabled,
        title: blockedTitle(markPickedEnabled, () =>
          st !== "ready" ? t("reception.hint_pickup_needs_ready") : undefined,
        ),
      },
    };
  }, [order, lineBusy, t]);

  async function act(action: "approve_all" | "reject_all" | "mark_ready" | "mark_picked_up") {
    if (!id) return;
    await apiFetch(`/api/v1/orders/${id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        rejection_reason: action === "reject_all" ? reason : null,
      }),
    });
    setReason("");
    await load();
  }

  async function onSubRespond(e: FormEvent, offerId: number) {
    e.preventDefault();
    if (!id || !order) return;
    const pend = order.pending_substitutions.find((p) => p.id === offerId);
    if (!pend) return;
    const selected = subChoice[pend.id];
    if (!selected) {
      window.alert(t("order.sub_need_pick"));
      return;
    }
    await apiFetch<OrderDetail>(`/api/v1/orders/${id}/substitution/response`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offer_id: pend.id,
        accept: !!selected,
        selected_product_id: selected || null,
      }),
    });
    await load();
  }

  async function declineOffer(offerId: number) {
    if (!id || !order) return;
    await apiFetch<OrderDetail>(`/api/v1/orders/${id}/substitution/response`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offer_id: offerId,
        accept: false,
      }),
    });
    await load();
  }

  function toggleSubPick(lineId: number, productId: number) {
    const cur = subPick[lineId] || [];
    const has = cur.includes(productId);
    if (!has && cur.length >= 3) {
      setLineErr(t("order.sub_max_three"));
      return;
    }
    setLineErr(null);
    if (!has) {
      setQtyDraft((d) => ({ ...d, [lineId]: "" }));
    }
    setSubPick((prev) => {
      const c = prev[lineId] || [];
      if (c.includes(productId)) return { ...prev, [lineId]: c.filter((x) => x !== productId) };
      return { ...prev, [lineId]: [...c, productId] };
    });
  }

  function onQtyDraftChange(lineId: number, value: string) {
    setQtyDraft((d) => ({ ...d, [lineId]: value }));
    const n = Number(value.trim());
    if (value.trim() && Number.isFinite(n) && n >= 1) {
      setSubPick((p) => ({ ...p, [lineId]: [] }));
    }
  }

  function buildProposePayload(): { changes: { line_id: number; offered_product_ids: number[]; proposed_quantity?: number }[] } {
    if (!order) return { changes: [] };
    const changes: { line_id: number; offered_product_ids: number[]; proposed_quantity?: number }[] = [];
    for (const ln of order.lines) {
      const ids = subPick[ln.id] || [];
      const raw = qtyDraft[ln.id]?.trim() ?? "";
      const n = Number(raw);
      const hasSub = ids.length > 0;
      const hasQty = Number.isFinite(n) && n >= 1 && n < ln.quantity;
      if (!hasSub && !hasQty) continue;
      if (hasSub) {
        changes.push({ line_id: ln.id, offered_product_ids: ids });
      } else {
        changes.push({ line_id: ln.id, offered_product_ids: [], proposed_quantity: n });
      }
    }
    return { changes };
  }

  async function submitProposalsToCustomer() {
    if (!id || !order) return;
    const { changes } = buildProposePayload();
    if (changes.length === 0) {
      setLineErr(t("order.propose_nothing"));
      return;
    }
    setLineErr(null);
    setLineBusy(true);
    try {
      const o = await apiFetch<OrderDetail>(`/api/v1/orders/${id}/reception/propose-changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      setOrder(o);
      setSubPick({});
      setQtyDraft({});
      setExpandedLineId(null);
    } catch (e) {
      setLineErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLineBusy(false);
    }
  }

  async function customerRejectAllPending() {
    if (!id) return;
    setLineErr(null);
    setLineBusy(true);
    try {
      const o = await apiFetch<OrderDetail>(`/api/v1/orders/${id}/customer/pending/reject-all`, { method: "POST" });
      setOrder(o);
    } catch (e) {
      setLineErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLineBusy(false);
    }
  }

  async function customerAcceptAllPending() {
    if (!id) return;
    setLineErr(null);
    setLineBusy(true);
    try {
      const o = await apiFetch<OrderDetail>(`/api/v1/orders/${id}/customer/pending/accept-all`, { method: "POST" });
      setOrder(o);
    } catch (e) {
      setLineErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLineBusy(false);
    }
  }

  async function removeLine(lineId: number) {
    if (!id) return;
    if (!window.confirm(t("order.confirm_remove_line"))) return;
    setLineErr(null);
    setLineBusy(true);
    try {
      const o = await apiFetch<OrderDetail>(`/api/v1/orders/${id}/lines/${lineId}`, { method: "DELETE" });
      setOrder(o);
      setSubPick({});
      setQtyDraft({});
      setExpandedLineId((cur) => (cur === lineId ? null : cur));
    } catch (e) {
      setLineErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLineBusy(false);
    }
  }

  async function cancelStaffOffer(offerId: number) {
    if (!id) return;
    setLineErr(null);
    setLineBusy(true);
    try {
      const o = await apiFetch<OrderDetail>(`/api/v1/orders/${id}/substitution-offers/${offerId}/cancel`, {
        method: "POST",
      });
      setOrder(o);
    } catch (e) {
      setLineErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLineBusy(false);
    }
  }

  async function cancelStaffQtyOffer(offerId: number) {
    if (!id) return;
    setLineErr(null);
    setLineBusy(true);
    try {
      const o = await apiFetch<OrderDetail>(`/api/v1/orders/${id}/quantity-reduction-offers/${offerId}/cancel`, {
        method: "POST",
      });
      setOrder(o);
    } catch (e) {
      setLineErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLineBusy(false);
    }
  }

  async function respondQtyOffer(offerId: number, accept: boolean) {
    if (!id) return;
    setLineErr(null);
    setLineBusy(true);
    try {
      const o = await apiFetch<OrderDetail>(`/api/v1/orders/${id}/quantity-reduction/response`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer_id: offerId, accept }),
      });
      setOrder(o);
    } catch (e) {
      setLineErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLineBusy(false);
    }
  }

  if (loading) return <p>{t("common.loading")}</p>;
  if (err || !order) return <p style={{ color: "var(--danger)" }}>{err || t("common.error")}</p>;

  const isMyOrder = order.is_my_order === true;
  const receptionDesk = staff && !isMyOrder;
  const viewAsCustomer = !receptionDesk;

  const replacementCandidates = catalog.filter((p) => p.available);
  const qtyPending = order.pending_quantity_reductions ?? [];
  const resolvedSub = order.resolved_substitutions ?? [];
  const resolvedQty = order.resolved_quantity_reductions ?? [];
  const pendingStaffEdit = receptionDesk && order.status === "pending_confirm";
  const lineTableColSpan = 4 + (staff ? 1 : 0) + (pendingStaffEdit ? 1 : 0);

  return (
    <div>
      <p>
        <Link to={receptionDesk ? "/reception" : "/orders"}>{t("common.back")}</Link>
      </p>
      <h1 style={{ marginTop: 0 }}>
        {t("order.title")} #{order.order_number}
      </h1>
      <p>
        {t("order.status")}: <span className={orderStatusBadgeClass(order.status)}>{statusLabel(t, order.status)}</span>
      </p>
      <p>
        {t("order.number")}: {order.order_number}
      </p>
      <div className="card" style={{ marginBottom: "1rem" }}>
        <p style={{ marginTop: 0, marginBottom: "0.35rem", color: "var(--muted)", fontSize: "0.9rem" }}>
          {t("order.buyer_details")}
        </p>
        <p style={{ margin: 0 }}>
          {t("reception.first_name")}: {order.client_first_name || "—"} · {t("reception.last_name")}:{" "}
          {order.client_last_name || "—"}
        </p>
        <p style={{ margin: "0.35rem 0 0" }}>
          {t("reception.email")}: {order.client_email}
        </p>
      </div>
      <div className="card" style={{ marginBottom: "1rem" }}>
        <p style={{ marginTop: 0 }}>{t("order.qr")}</p>
        <ProductImageZoom
          src={order.qr_data_url}
          altName={t("order.qr")}
          buttonAriaLabel={t("order.qr_open_preview")}
          thumbClassName="order-qr-thumb"
          buttonClassName="order-qr-zoom-btn"
          imgStyle={{ maxWidth: 220, width: "100%", height: "auto", display: "block" }}
        />
      </div>
      <div className="table-wrap card">
        <div className="page-title-row" style={{ marginBottom: "0.5rem" }}>
          <h3 style={{ marginTop: 0 }}>{t("order.lines")}</h3>
          {pendingStaffEdit ? (
            <InfoButton label={t("order.lines")} content={<p style={{ margin: 0 }}>{t("order.line_click_hint")}</p>} />
          ) : null}
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>{t("order.product")}</th>
              <th>{t("cart.qty")}</th>
              <th>{t("cart.prices")}</th>
              {staff && <th>Stock</th>}
              {pendingStaffEdit && <th>{t("order.col_actions")}</th>}
            </tr>
          </thead>
          <tbody>
            {order.lines.map((ln) => {
              const rowOpen = pendingStaffEdit && expandedLineId === ln.id;
              const canReduce = ln.quantity > 1;
              const picked = subPick[ln.id] || [];
              return (
                <Fragment key={ln.id}>
                  <tr
                    className={pendingStaffEdit ? "row-order" : undefined}
                    tabIndex={pendingStaffEdit ? 0 : undefined}
                    onClick={
                      pendingStaffEdit
                        ? () => setExpandedLineId((cur) => (cur === ln.id ? null : ln.id))
                        : undefined
                    }
                    onKeyDown={
                      pendingStaffEdit
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setExpandedLineId((cur) => (cur === ln.id ? null : ln.id));
                            }
                          }
                        : undefined
                    }
                    style={rowOpen ? { outline: "2px solid var(--accent)", outlineOffset: "-2px" } : undefined}
                  >
                    <td>{ln.id}</td>
                    <td>
                      <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: "0.35rem" }}>
                        <span>{ln.product_name}</span>
                        {lineLastSubstitutionRejected.get(ln.id) ? (
                          <span className="badge badge--sub-declined" title={t("order.line_sub_declined_title")}>
                            {t("order.line_sub_declined_badge")}
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td>{ln.quantity}</td>
                    <td style={{ fontSize: "0.85rem" }}>
                      {(() => {
                        const pct = Math.floor(Number(ln.sale_percent_applied ?? 0));
                        const hasSale = pct > 0;
                        if (!hasSale) {
                          return (
                            <>
                              {t("catalog.price_net")}: {ln.unit_price_net} / {t("catalog.price_gross")}: {ln.unit_price}{" "}
                              ({t("catalog.vat")} {ln.vat_rate_percent}%)
                            </>
                          );
                        }
                        return (
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                            <span style={{ color: "var(--muted)" }}>
                              {t("order.line_list_prices")}: {t("catalog.price_net")} {ln.catalog_unit_price_net} /{" "}
                              {t("catalog.price_gross")} {ln.catalog_unit_price_gross} · {t("order.line_discount_label")}{" "}
                              <strong>-{pct}%</strong>
                            </span>
                            <span>
                              {t("order.line_paid_unit_prices")}: {t("catalog.price_net")} {ln.unit_price_net} /{" "}
                              {t("catalog.price_gross")} {ln.unit_price} ({t("catalog.vat")} {ln.vat_rate_percent}%)
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                    {staff && (
                      <td>
                        {ln.product_available_now ? (
                          <span className="badge ok">OK</span>
                        ) : (
                          <span className="badge bad">N/A</span>
                        )}
                      </td>
                    )}
                    {pendingStaffEdit && (
                      <td onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="btn"
                          disabled={lineBusy}
                          title={t("order.confirm_remove_line")}
                          onClick={() => void removeLine(ln.id)}
                        >
                          {t("order.reject_line")}
                        </button>
                      </td>
                    )}
                  </tr>
                  {rowOpen && (
                    <tr ref={lineEditorAnchorRef} className="order-line-editor-row">
                      <td colSpan={lineTableColSpan}>
                        <div
                          role="region"
                          aria-label={t("order.line_editor_region")}
                          className="order-line-editor-inner"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <h4
                            style={{
                              marginTop: 0,
                              marginBottom: "0.35rem",
                              fontSize: "1.05rem",
                              display: "flex",
                              flexWrap: "wrap",
                              alignItems: "baseline",
                              gap: "0.35rem",
                            }}
                          >
                            <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: "0.35rem" }}>
                              <span>{ln.product_name}</span>
                              {lineLastSubstitutionRejected.get(ln.id) ? (
                                <span className="badge badge--sub-declined" title={t("order.line_sub_declined_title")}>
                                  {t("order.line_sub_declined_badge")}
                                </span>
                              ) : null}
                            </span>
                            <span style={{ color: "var(--muted)", fontWeight: 400 }}>
                              × {ln.quantity} {t("cart.qty").toLowerCase()}
                            </span>
                            <InfoButton
                              label={ln.product_name}
                              content={
                                <div>
                                  <p style={{ margin: "0 0 0.5rem" }}>{t("order.line_review_hint")}</p>
                                  <p style={{ margin: 0 }}>{t("order.one_change_per_line_hint")}</p>
                                </div>
                              }
                            />
                          </h4>
                          {lineErr && (
                            <p style={{ color: "var(--danger)", marginBottom: "0.75rem" }} role="alert">
                              {lineErr}
                            </p>
                          )}
                          {lineBusy && (
                            <p style={{ color: "var(--muted)", marginBottom: "0.5rem" }}>{t("common.loading")}</p>
                          )}
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
                            {canReduce && (
                              <div className="field" style={{ marginBottom: 0, minWidth: "12rem" }}>
                                <label htmlFor={`qty-${ln.id}`}>{t("order.reduce_qty_label")}</label>
                                <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                                  <input
                                    id={`qty-${ln.id}`}
                                    type="number"
                                    min={1}
                                    max={ln.quantity - 1}
                                    value={qtyDraft[ln.id] ?? ""}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      onQtyDraftChange(ln.id, e.target.value);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    disabled={lineBusy}
                                    style={{ maxWidth: "7rem" }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                          <div style={{ marginTop: "0.75rem" }}>
                            <p style={{ margin: "0 0 0.35rem", fontSize: "0.85rem", color: "var(--muted)" }}>
                              {t("order.sub_pick_label")}
                            </p>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                                gap: "0.35rem",
                                maxHeight: "220px",
                                overflow: "auto",
                                marginBottom: "0.5rem",
                              }}
                            >
                              {replacementCandidates
                                .filter((p) => p.id !== ln.product_id)
                                .map((p) => (
                                  <label
                                    key={p.id}
                                    style={{
                                      display: "flex",
                                      gap: "0.35rem",
                                      alignItems: "center",
                                      fontSize: "0.85rem",
                                      cursor: "pointer",
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={picked.includes(p.id)}
                                      disabled={lineBusy || (!picked.includes(p.id) && picked.length >= 3)}
                                      onChange={() => toggleSubPick(ln.id, p.id)}
                                    />
                                    <span>{p.name}</span>
                                  </label>
                                ))}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {pendingStaffEdit && (
          <div
            style={{
              borderTop: "1px solid var(--border)",
              marginTop: "0.85rem",
              paddingTop: "1rem",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem", marginBottom: "0.65rem" }}>
              <InfoButton
                label={t("order.propose_changes")}
                content={<p style={{ margin: 0 }}>{t("order.propose_changes_hint")}</p>}
              />
              <button
                type="button"
                className="btn btn-primary"
                disabled={lineBusy || buildProposePayload().changes.length === 0}
                onClick={() => void submitProposalsToCustomer()}
              >
                {t("order.propose_changes")}
              </button>
            </div>
          </div>
        )}
      </div>

      {(resolvedSub.length > 0 || resolvedQty.length > 0) && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <div className="page-title-row" style={{ marginBottom: "0.35rem" }}>
            <h3 style={{ marginTop: 0 }}>
              {receptionDesk ? t("order.sub_history_title_staff") : t("order.sub_history_title_customer")}
            </h3>
            <InfoButton
              label={receptionDesk ? t("order.sub_history_title_staff") : t("order.sub_history_title_customer")}
              content={
                <p style={{ margin: 0 }}>
                  {receptionDesk ? t("order.sub_history_intro_staff") : t("order.sub_history_intro_customer")}
                </p>
              }
            />
          </div>
          {resolvedSub.map((row) => {
            const lineName = order.lines.find((l) => l.id === row.line_id)?.product_name || `#${row.line_id}`;
            const labels =
              row.offered_products && row.offered_products.length > 0
                ? row.offered_products.map((x) => x.name).join(", ")
                : row.offered_product_ids.join(", ");
            const acc = row.status === "accepted";
            const withdrawn = row.status === "withdrawn";
            return (
              <div
                key={`rsub-${row.id}`}
                style={{
                  borderTop: "1px solid var(--border)",
                  paddingTop: "0.65rem",
                  marginTop: "0.65rem",
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                  <strong>{lineName}</strong>
                  <span className={acc ? "badge ok" : withdrawn ? "badge" : "badge bad"}>
                    {acc
                      ? t("order.sub_resolved_accepted")
                      : withdrawn
                        ? t("order.sub_resolved_withdrawn")
                        : t("order.sub_resolved_rejected")}
                  </span>
                </div>
                <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
                  {t("order.sub_resolved_offered")}: {labels}
                </p>
                {acc && row.selected_product_name ? (
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }}>
                    {t("order.sub_resolved_selected")}: {row.selected_product_name}
                  </p>
                ) : null}
              </div>
            );
          })}
          {resolvedQty.map((row) => {
            const acc = row.status === "accepted";
            const withdrawn = row.status === "withdrawn";
            return (
              <div
                key={`rqty-${row.id}`}
                style={{
                  borderTop: "1px solid var(--border)",
                  paddingTop: "0.65rem",
                  marginTop: "0.65rem",
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                  <strong>{row.product_name || `#${row.line_id}`}</strong>
                  <span className={acc ? "badge ok" : withdrawn ? "badge" : "badge bad"}>
                    {acc
                      ? t("order.qty_resolved_accepted")
                      : withdrawn
                        ? t("order.qty_resolved_withdrawn")
                        : t("order.qty_resolved_rejected")}
                  </span>
                </div>
                <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
                  {t("order.qty_resolved_amounts", { from: row.previous_quantity, to: row.proposed_quantity })}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {receptionDesk && (order.staff_events?.length ?? 0) > 0 ? (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginTop: 0, fontSize: "1.05rem" }}>{t("order.staff_log_title")}</h3>
          <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.9rem", color: "var(--fg)" }}>
            {(order.staff_events ?? []).map((ev) => (
              <li key={ev.id} style={{ marginBottom: "0.35rem" }}>
                <span style={{ color: "var(--muted)" }}>{new Date(ev.created_at).toLocaleString()}</span>
                {" · "}
                <span>{staffEventLabel(t, ev.event_type)}</span>
                {ev.from_status && ev.to_status ? (
                  <span style={{ color: "var(--muted)" }}>
                    {" "}
                    ({statusLabel(t, ev.from_status)} → {statusLabel(t, ev.to_status)})
                  </span>
                ) : null}
                {" · "}
                <span style={{ color: "var(--muted)" }}>
                  {ev.actor_name === "system"
                    ? t("order.staff_actor_system")
                    : ev.actor_name || ev.actor_email || ev.actor_sub || "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {receptionDesk &&
        order.status === "partial_waiting_swap" &&
        (order.pending_substitutions.length > 0 || qtyPending.length > 0) && (
          <div className="card" style={{ marginTop: "1rem" }}>
            {order.pending_substitutions.length > 0 && (
              <>
                <div className="page-title-row" style={{ marginBottom: "0.35rem" }}>
                  <h3 style={{ marginTop: 0 }}>{t("order.sub_pending_title")}</h3>
                  <InfoButton label={t("order.sub_pending_title")} content={<p style={{ margin: 0 }}>{t("order.sub_pending_hint")}</p>} />
                </div>
              </>
            )}
            {lineErr && (
              <p style={{ color: "var(--danger)" }} role="alert">
                {lineErr}
              </p>
            )}
            {order.pending_substitutions.map((pend) => {
              const lineName = order.lines.find((l) => l.id === pend.line_id)?.product_name || `#${pend.line_id}`;
              const labels =
                pend.offered_products && pend.offered_products.length > 0
                  ? pend.offered_products.map((x) => x.name).join(", ")
                  : pend.offered_product_ids.join(", ");
              return (
                <div
                  key={pend.id}
                  style={{
                    borderTop: "1px solid var(--border)",
                    paddingTop: "0.75rem",
                    marginTop: "0.75rem",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                    alignItems: "center",
                  }}
                >
                  <span style={{ flex: "1 1 200px" }}>
                    <strong>{lineName}</strong>
                    <span style={{ color: "var(--muted)", marginLeft: "0.35rem" }}>({labels})</span>
                  </span>
                  <button type="button" className="btn" disabled={lineBusy} onClick={() => void cancelStaffOffer(pend.id)}>
                    {t("order.cancel_sub")}
                  </button>
                </div>
              );
            })}
            {qtyPending.length > 0 && (
              <>
                <div
                  className="page-title-row"
                  style={{ marginTop: order.pending_substitutions.length > 0 ? "1.25rem" : 0, marginBottom: "0.35rem" }}
                >
                  <h3 style={{ marginTop: 0 }}>{t("order.qty_pending_staff_title")}</h3>
                  <InfoButton
                    label={t("order.qty_pending_staff_title")}
                    content={<p style={{ margin: 0 }}>{t("order.qty_pending_staff_hint")}</p>}
                  />
                </div>
                {qtyPending.map((pend) => (
                  <div
                    key={`qty-${pend.id}`}
                    style={{
                      borderTop: "1px solid var(--border)",
                      paddingTop: "0.75rem",
                      marginTop: "0.75rem",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ flex: "1 1 220px" }}>
                      {t("order.qty_customer_body", {
                        product: pend.product_name || `#${pend.line_id}`,
                        from: pend.previous_quantity,
                        to: pend.proposed_quantity,
                      })}
                    </span>
                    <button type="button" className="btn" disabled={lineBusy} onClick={() => void cancelStaffQtyOffer(pend.id)}>
                      {t("order.qty_cancel")}
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

      {viewAsCustomer && (qtyPending.length > 0 || order.pending_substitutions.length > 0) && (
        <div style={{ marginTop: "1rem" }}>
          <div className="card" style={{ marginBottom: "1rem" }}>
            <div className="page-title-row" style={{ marginBottom: "0.35rem" }}>
              <h3 style={{ marginTop: 0 }}>{t("order.customer_pending_title")}</h3>
              <InfoButton
                label={t("order.customer_pending_title")}
                content={
                  <>
                    <p style={{ margin: "0 0 0.5rem" }}>{t("order.customer_pending_intro")}</p>
                    {anyMultiSub ? <p style={{ margin: 0 }}>{t("order.customer_accept_all_blocked")}</p> : null}
                  </>
                }
              />
            </div>
            {lineErr && (
              <p style={{ color: "var(--danger)" }} role="alert">
                {lineErr}
              </p>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.75rem" }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={lineBusy || !canBulkAcceptPending}
                onClick={() => void customerAcceptAllPending()}
              >
                {t("order.customer_accept_all")}
              </button>
              <button type="button" className="btn" disabled={lineBusy} onClick={() => void customerRejectAllPending()}>
                {t("order.customer_reject_all")}
              </button>
            </div>
          </div>

          {pendingCustomerLineIds.map((lineId) => {
            const line = order.lines.find((l) => l.id === lineId);
            const title = line?.product_name || `#${lineId}`;
            const qFor = qtyPending.filter((p) => p.line_id === lineId);
            const sFor = order.pending_substitutions.filter((p) => p.line_id === lineId);
            return (
              <div key={`cline-${lineId}`} className="card" style={{ marginBottom: "1rem" }}>
                <h3 style={{ marginTop: 0, borderBottom: "1px solid var(--border)", paddingBottom: "0.35rem" }}>
                  {t("order.customer_line_heading", { product: title })}
                </h3>
                {qFor.map((pend) => (
                  <div key={`cqty-${pend.id}`} style={{ marginTop: "0.75rem" }}>
                    <p style={{ margin: "0 0 0.5rem", fontSize: "0.9rem" }}>
                      <strong>{t("order.change_type_qty")}</strong> —{" "}
                      {t("order.qty_customer_body", {
                        product: pend.product_name || title,
                        from: pend.previous_quantity,
                        to: pend.proposed_quantity,
                      })}
                    </p>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ marginRight: "0.5rem" }}
                      disabled={lineBusy}
                      onClick={() => void respondQtyOffer(pend.id, true)}
                    >
                      {t("order.qty_customer_accept")}
                    </button>
                    <button type="button" className="btn" disabled={lineBusy} onClick={() => void respondQtyOffer(pend.id, false)}>
                      {t("order.qty_customer_decline")}
                    </button>
                  </div>
                ))}
                {sFor.map((pend) => (
                  <form
                    key={pend.id}
                    style={{ marginTop: "0.75rem" }}
                    onSubmit={(e) => void onSubRespond(e, pend.id)}
                  >
                    <p style={{ margin: "0 0 0.5rem", fontSize: "0.9rem" }}>
                      <strong>{t("order.change_type_sub")}</strong> — {t("order.sub_customer_title")}
                    </p>
                    <p style={{ margin: "0 0 0.35rem", fontSize: "0.88rem", fontWeight: 600 }}>{t("order.sub_customer_pick")}</p>
                    <SubstitutionOfferPick
                      offerKey={pend.id}
                      offeredProductIds={pend.offered_product_ids}
                      offeredProducts={
                        pend.offered_products as Array<Record<string, unknown>> | undefined
                      }
                      selectedId={subChoice[pend.id]}
                      disabled={lineBusy}
                      onSelect={(productId) => setSubChoice((c) => ({ ...c, [pend.id]: productId }))}
                    />
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.75rem" }}>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={lineBusy || subChoice[pend.id] == null}
                        title={subChoice[pend.id] == null ? t("order.sub_pick_required") : undefined}
                      >
                        {t("order.sub_customer_accept")}
                      </button>
                      <button type="button" className="btn" disabled={lineBusy} onClick={() => void declineOffer(pend.id)}>
                        {t("order.sub_customer_decline")}
                      </button>
                    </div>
                  </form>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {receptionDesk && (
        <div className="card" style={{ marginTop: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>{t("reception.actions")}</h3>
          <div className="field">
            <label>{t("reception.reason")}</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {order.status === "pending_confirm" && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={!receptionStaffActions.approve.enabled}
                title={receptionStaffActions.approve.title}
                onClick={() => void act("approve_all")}
              >
                {t("reception.approve")}
              </button>
            )}
            <button
              type="button"
              className="btn"
              disabled={!receptionStaffActions.reject.enabled}
              title={receptionStaffActions.reject.title}
              onClick={() => void act("reject_all")}
            >
              {t("reception.reject")}
            </button>
            {order.status === "partial_waiting_swap" && (
              <button
                type="button"
                className="btn"
                disabled={!receptionStaffActions.markReady.enabled}
                title={receptionStaffActions.markReady.title}
                onClick={() => void act("mark_ready")}
              >
                {t("reception.ready")}
              </button>
            )}
            <button
              type="button"
              className="btn"
              disabled={!receptionStaffActions.markPickedUp.enabled}
              title={receptionStaffActions.markPickedUp.title}
              onClick={() => void act("mark_picked_up")}
            >
              {t("reception.picked")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
