import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../i18n/I18nContext";
import { useNotifications } from "../notifications/NotificationContext";
import type { AppNotification } from "../types";
import { IconBell } from "./NavIcons";

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
    return new Intl.DateTimeFormat(localeFor(lang), {
      dateStyle: "short",
      timeStyle: "short",
    }).format(d);
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
        return product
          ? t("notif.reception.swap_accepted_line", { order, product })
          : t("notif.reception.swap_accepted", { order });
      }
      return product
        ? t("notif.reception.swap_declined_line", { order, product })
        : t("notif.reception.swap_declined", { order });
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
      return t("notif.customer.reception_batch_proposed", {
        order,
        n: typeof n.meta?.change_count === "number" ? n.meta.change_count : 0,
      });
    case "reception.customer_pending_bulk":
      return t("notif.reception.customer_pending_bulk", { order });
    case "reception.customer_qty_reply": {
      const accepted = Boolean(n.meta?.accepted);
      const product = typeof n.meta?.product_name === "string" ? n.meta.product_name.trim() : "";
      if (accepted) {
        return product
          ? t("notif.reception.qty_accepted_line", { order, product })
          : t("notif.reception.qty_accepted", { order });
      }
      return product
        ? t("notif.reception.qty_declined_line", { order, product })
        : t("notif.reception.qty_declined", { order });
    }
    case "customer.substitution_withdrawn":
      return t("notif.customer.substitution_withdrawn", { order });
    default:
      return t("notif.generic", { order, type: n.event_type });
  }
}

export function NotificationBell() {
  const { t, lang } = useI18n();
  const { items, unreadCount, loading, refresh, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [markAllBusy, setMarkAllBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  /** Osveži listu kad se panel otvori — ne pozivati refresh unutar setOpen updater-a (upozorenje React-a). */
  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const toggle = useCallback(() => {
    setOpen((v) => !v);
  }, []);

  const onOpenOrder = useCallback(
    (n: AppNotification) => {
      void markRead([n.id]);
      setOpen(false);
    },
    [markRead],
  );

  const onMarkAllRead = useCallback(async () => {
    const ids = items.filter((n) => !n.read_at).map((n) => n.id);
    if (!ids.length) return;
    setMarkAllBusy(true);
    try {
      await markRead(ids);
    } finally {
      setMarkAllBusy(false);
    }
  }, [items, markRead]);

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button
        type="button"
        className="icon-btn notif-trigger"
        onClick={toggle}
        title={t("nav.notifications")}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className="nav-icon-wrap">
          <IconBell />
          {unreadCount > 0 && <span className="nav-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
        </span>
      </button>
      {open && (
        <div className="notif-panel card" role="menu">
          <div className="notif-panel-head">
            <div className="notif-panel-head-row">
              <strong>{t("nav.notifications")}</strong>
              {unreadCount > 0 ? (
                <span className="notif-head-badge" aria-live="polite">
                  {t("notif.unread_count", { n: unreadCount })}
                </span>
              ) : null}
            </div>
            {items.length > 0 ? <p className="notif-panel-legend">{t("notif.legend")}</p> : null}
            {unreadCount > 0 ? (
              <div className="notif-panel-actions">
                <button
                  type="button"
                  className="btn notif-mark-all-btn"
                  disabled={loading || markAllBusy}
                  onClick={() => void onMarkAllRead()}
                >
                  {t("notif.mark_all_read")}
                </button>
              </div>
            ) : null}
          </div>
          <div className="notif-list">
            {items.length === 0 ? (
              <p className="notif-empty">{t("notif.empty")}</p>
            ) : (
              items.map((n) => {
                const unread = !n.read_at;
                return (
                  <Link
                    key={n.id}
                    to={`/orders/${n.order_id}`}
                    role="menuitem"
                    className={`notif-item${unread ? " notif-item--unread" : " notif-item--read"}`}
                    aria-label={`${unread ? t("notif.unread_badge") : t("notif.read_badge")}. ${notificationText(n, t)}`}
                    onClick={() => onOpenOrder(n)}
                  >
                    <div className="notif-item-meta">
                      <span className={unread ? "notif-pill notif-pill--unread" : "notif-pill notif-pill--read"}>
                        {unread ? t("notif.unread_badge") : t("notif.read_badge")}
                      </span>
                      <span className="notif-item-time">{formatShortTime(n.created_at, lang)}</span>
                    </div>
                    <span className="notif-item-text">{notificationText(n, t)}</span>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
