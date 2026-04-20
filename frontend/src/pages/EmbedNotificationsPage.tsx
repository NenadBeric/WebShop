import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useI18n } from "../i18n/I18nContext";
import { IconTrash } from "../components/NavIcons";
import { isChromelessAppShellSearch } from "../lib/trainifyEmbedUrl";
import { useNotifications } from "../notifications/NotificationContext";
import type { AppNotification } from "../types";

function localeFor(lang: string): string {
  if (lang === "sr") return "sr-Latn-RS";
  if (lang === "ru") return "ru-RU";
  if (lang === "zh") return "zh-CN";
  return "en-GB";
}

function formatShortTime(iso: string, lang: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(localeFor(lang), { dateStyle: "short", timeStyle: "short" }).format(d);
  } catch {
    return "";
  }
}

function statusLabel(t: (k: string) => string, status: string): string {
  const key = `status.${status}`;
  const m = t(key);
  return m === key ? status : m;
}

function notificationText(n: AppNotification, t: (k: string, vars?: Record<string, string | number>) => string): string {
  const order = n.order_number;
  switch (n.event_type) {
    case "reception.order_created":
      return t("notif.reception.order_created", { order });
    case "reception.customer_substitution": {
      const accepted = Boolean(n.meta?.accepted);
      const product = typeof n.meta?.product_name === "string" ? n.meta.product_name.trim() : "";
      if (accepted) {
        return product ? t("notif.reception.swap_accepted_line", { order, product }) : t("notif.reception.swap_accepted", { order });
      }
      return product ? t("notif.reception.swap_declined_line", { order, product }) : t("notif.reception.swap_declined", { order });
    }
    case "customer.status_changed": {
      const st = typeof n.meta?.status === "string" ? n.meta.status : "";
      return t("notif.customer.status_changed", { order, status: statusLabel(t, st) });
    }
    case "customer.substitution_offer":
      return t("notif.customer.substitution_offer", { order });
    case "customer.order_line_removed":
      return t("notif.customer.order_line_removed", { order });
    case "customer.order_qty_reduced":
      return t("notif.customer.order_qty_reduced", { order });
    case "customer.quantity_reduction_offer":
      return t("notif.customer.quantity_reduction_offer", { order });
    case "customer.quantity_reduction_withdrawn":
      return t("notif.customer.quantity_reduction_withdrawn", { order });
    case "customer.reception_batch_proposed":
      return t("notif.customer.reception_batch_proposed", { order, n: typeof n.meta?.change_count === "number" ? n.meta.change_count : 0 });
    case "reception.customer_pending_bulk":
      return t("notif.reception.customer_pending_bulk", { order });
    case "reception.customer_qty_reply": {
      const accepted = Boolean(n.meta?.accepted);
      const product = typeof n.meta?.product_name === "string" ? n.meta.product_name.trim() : "";
      if (accepted) {
        return product ? t("notif.reception.qty_accepted_line", { order, product }) : t("notif.reception.qty_accepted", { order });
      }
      return product ? t("notif.reception.qty_declined_line", { order, product }) : t("notif.reception.qty_declined", { order });
    }
    case "customer.substitution_withdrawn":
      return t("notif.customer.substitution_withdrawn", { order });
    default:
      return t("notif.generic", { order, type: n.event_type });
  }
}

export function EmbedNotificationsPage() {
  const { t, lang } = useI18n();
  const { items, unreadCount, loading, refresh, markRead, deleteIds, clearRead } = useNotifications();
  const loc = useLocation();
  const navigate = useNavigate();
  const [busyAllRead, setBusyAllRead] = useState(false);
  const [busyClear, setBusyClear] = useState(false);
  const embedMode = useMemo(() => isChromelessAppShellSearch(loc.search), [loc.search]);

  const unreadIds = useMemo(() => items.filter((n) => !n.read_at).map((n) => n.id), [items]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onMarkAllRead = useCallback(async () => {
    if (!unreadIds.length) return;
    setBusyAllRead(true);
    try {
      await markRead(unreadIds);
    } finally {
      setBusyAllRead(false);
    }
  }, [markRead, unreadIds]);

  const onClearRead = useCallback(async () => {
    if (unreadCount === items.length) return;
    setBusyClear(true);
    try {
      await clearRead();
    } finally {
      setBusyClear(false);
    }
  }, [items.length, unreadCount, clearRead]);

  const onDeleteOne = useCallback(
    async (id: number) => {
      await deleteIds([id]);
    },
    [deleteIds],
  );

  const onOpen = useCallback(
    async (n: AppNotification) => {
      if (!n.read_at) await markRead([n.id]);
      if (embedMode) {
        window.parent?.postMessage(
          {
            type: "webshop-open-order",
            version: 1,
            orderId: n.order_id,
            orderNumber: n.order_number,
          },
          "*",
        );
        return;
      }
      navigate(`/orders/${n.order_id}`);
    },
    [markRead, embedMode, navigate],
  );

  return (
    <div className="page embed-notif-page">
      <div className="card">
        <div className="embed-notif-head">
          <div className="embed-notif-head-row">
            <div>
              <h2 style={{ margin: 0 }}>{t("nav.notifications")}</h2>
              {unreadCount > 0 ? <div className="muted" style={{ marginTop: 4 }}>{t("notif.unread_count", { n: unreadCount })}</div> : null}
            </div>
            <div className="embed-notif-actions">
              <button type="button" className="btn" disabled={loading || busyAllRead || unreadIds.length === 0} onClick={() => void onMarkAllRead()}>
                {t("notif.mark_all_read")}
              </button>
              <button
                type="button"
                className="btn"
                disabled={loading || busyClear || items.length === 0 || unreadCount === items.length}
                onClick={() => void onClearRead()}
              >
                {t("notif.delete_read")}
              </button>
              <button type="button" className="btn" disabled={loading} onClick={() => void refresh()}>
                {t("common.refresh")}
              </button>
            </div>
          </div>
        </div>

        <div className="embed-notif-list">
          {items.length === 0 ? (
            <p className="notif-empty">{t("notif.empty")}</p>
          ) : (
            items.map((n) => {
              const unread = !n.read_at;
              return (
                <div
                  key={n.id}
                  className={`notif-item ${unread ? "notif-item--unread" : "notif-item--read"} embed-notif-item`}
                  role="button"
                  tabIndex={0}
                  onClick={() => void onOpen(n)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") void onOpen(n);
                  }}
                >
                  <div className="embed-notif-item-main">
                    <div className="notif-item-meta">
                      <span className={unread ? "notif-pill notif-pill--unread" : "notif-pill notif-pill--read"}>
                        {unread ? t("notif.unread_badge") : t("notif.read_badge")}
                      </span>
                      <span className="notif-item-time">{formatShortTime(n.created_at, lang)}</span>
                    </div>
                    <div className="notif-item-text">{notificationText(n, t)}</div>
                  </div>
                  <button
                    type="button"
                    className="embed-notif-delete"
                    aria-label={t("notif.delete_one")}
                    title={t("notif.delete_one")}
                    onClick={(e) => {
                      e.stopPropagation();
                      void onDeleteOne(n.id);
                    }}
                  >
                    <IconTrash width={18} height={18} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

