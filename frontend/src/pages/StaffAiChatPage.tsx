import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { canManage, useAuth } from "../auth/AuthContext";
import { InfoButton } from "../components/InfoButton";
import { useI18n } from "../i18n/I18nContext";
import type { StaffChatMessageRow, StaffChatSessionRow } from "../types";
import { sendStaffChatMessage } from "./staffChatStream";

export function StaffAiChatPage() {
  const { user } = useAuth();
  const role = user?.role || "";
  const { t } = useI18n();

  const [sessions, setSessions] = useState<StaffChatSessionRow[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<StaffChatMessageRow[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesScrollRef = useRef<HTMLDivElement>(null);

  const loadSessions = useCallback(async () => {
    const rows = await apiFetch<StaffChatSessionRow[]>("/api/v1/ai/staff-chat/sessions");
    setSessions(rows);
  }, []);

  const loadMessages = useCallback(async (sid: number) => {
    const rows = await apiFetch<StaffChatMessageRow[]>(`/api/v1/ai/staff-chat/sessions/${sid}/messages`);
    setMessages(rows);
  }, []);

  useEffect(() => {
    void loadSessions().catch(() => setSessions([]));
  }, [loadSessions]);

  useEffect(() => {
    if (activeSessionId != null) void loadMessages(activeSessionId).catch(() => setMessages([]));
    else setMessages([]);
  }, [activeSessionId, loadMessages]);

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
  }, [messages, streaming]);

  async function onNewChat() {
    setActiveSessionId(null);
    setMessages([]);
    setStreaming("");
    setErr(null);
    setSidebarOpen(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setErr(null);
    setBusy(true);
    setInput("");
    setStreaming("");
    let acc = "";

    const result = await sendStaffChatMessage(activeSessionId, text, (ev) => {
      if (ev.type === "token") {
        acc += ev.text;
        setStreaming(acc);
      }
      if (ev.type === "replace") {
        acc = ev.text;
        setStreaming(acc);
      }
    });

    setBusy(false);
    setStreaming("");

    if (result.error_code) {
      setErr(t(`aiStaff.error.${result.error_code}`) || result.error_code);
      return;
    }

    if (result.session_id != null) {
      setActiveSessionId(result.session_id);
      await loadMessages(result.session_id);
    }
    await loadSessions();
  }

  async function onDeleteSession(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(t("aiStaff.confirmDelete"))) return;
    await apiFetch(`/api/v1/ai/staff-chat/sessions/${id}`, { method: "DELETE" });
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setMessages([]);
    }
    await loadSessions();
  }

  if (!canManage(role)) {
    return <Navigate to="/catalog" replace />;
  }

  return (
    <div className="staff-ai-page">
      <div className="staff-ai-page__header">
        <div className="page-title-row" style={{ marginBottom: "0.35rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <h1>{t("aiStaff.title")}</h1>
          <InfoButton label={t("aiStaff.title")} content={<p style={{ margin: 0 }}>{t("aiStaff.subtitle")}</p>} />
          <button type="button" className="btn" onClick={() => setSidebarOpen((s) => !s)}>
            {t("aiStaff.sessions")}
          </button>
        </div>
      </div>

      <div className="staff-ai-layout">
        <aside className={`staff-ai-sidebar card${sidebarOpen ? " staff-ai-sidebar--open" : ""}`} style={{ padding: "0.75rem" }}>
          <button type="button" className="btn btn-primary" style={{ width: "100%", marginBottom: "0.75rem" }} onClick={() => void onNewChat()}>
            {t("aiStaff.newChat")}
          </button>
          <div className="staff-ai-sidebar__list">
            {sessions.map((s) => (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setActiveSessionId(s.id);
                  setSidebarOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveSessionId(s.id);
                    setSidebarOpen(false);
                  }
                }}
                className="card"
                style={{
                  padding: "0.5rem",
                  cursor: "pointer",
                  border: activeSessionId === s.id ? "2px solid var(--accent)" : undefined,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.25rem", alignItems: "start" }}>
                  <div style={{ fontSize: "0.9rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{s.title || t("aiStaff.untitled")}</div>
                  <button type="button" className="btn" style={{ padding: "0.15rem 0.35rem", fontSize: "0.75rem" }} onClick={(ev) => void onDeleteSession(s.id, ev)}>
                    ×
                  </button>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                  {s.message_count} {t("aiStaff.msgShort")}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="card staff-ai-chat" style={{ padding: "0.75rem" }}>
          <div className="staff-ai-chat__messages" ref={messagesScrollRef}>
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  marginBottom: "0.75rem",
                  textAlign: m.role === "user" ? "right" : "left",
                }}
              >
                <div
                  style={{
                    display: "inline-block",
                    maxWidth: "92%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: 8,
                    background: m.role === "user" ? "var(--accent-soft, rgba(99,102,241,0.15))" : "var(--panel-2, rgba(0,0,0,0.06))",
                    whiteSpace: "pre-wrap",
                    textAlign: "left",
                  }}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {streaming ? (
              <div style={{ marginBottom: "0.75rem" }}>
                <div
                  style={{
                    display: "inline-block",
                    maxWidth: "92%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: 8,
                    background: "var(--panel-2, rgba(0,0,0,0.06))",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {streaming}
                </div>
              </div>
            ) : null}
          </div>
          <div className="staff-ai-chat__footer">
            {err && <p style={{ color: "var(--danger)", margin: "0 0 0.5rem" }}>{err}</p>}
            <form className="staff-ai-chat__form" onSubmit={(e) => void onSubmit(e)}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("aiStaff.placeholder")}
              rows={4}
              disabled={busy}
            />
            <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()}>
              {busy ? "…" : t("aiStaff.send")}
            </button>
          </form>
          </div>
        </section>
      </div>
    </div>
  );
}
