import { getSavedLanguage, getToken } from "../api/client";

export type StaffChatStreamEvent =
  | { type: "session_created"; session_id: number }
  | { type: "token"; text: string }
  | { type: "replace"; text: string }
  | { type: "done"; assistant_message_id: number | null }
  | { type: "error"; code: string };

export type StaffChatStreamResult = {
  session_id: number | null;
  error_code: string | null;
};

export async function sendStaffChatMessage(
  sessionId: number | null,
  message: string,
  onEvent: (ev: StaffChatStreamEvent) => void,
): Promise<StaffChatStreamResult> {
  const token = getToken();
  const lang = getSavedLanguage();
  let sid = sessionId;
  let res: Response;
  try {
    res = await fetch("/api/v1/ai/staff-chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "Accept-Language": lang,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ session_id: sessionId, message }),
    });
  } catch {
    onEvent({ type: "error", code: "NETWORK_ERROR" });
    return { session_id: sid, error_code: "NETWORK_ERROR" };
  }

  if (!res.ok) {
    const code = `HTTP_${res.status}`;
    onEvent({ type: "error", code });
    return { session_id: sid, error_code: code };
  }

  const reader = res.body?.getReader();
  if (!reader) {
    onEvent({ type: "error", code: "NO_STREAM" });
    return { session_id: sid, error_code: "NO_STREAM" };
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let errorOut: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const block of parts) {
      for (const line of block.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data) continue;
        try {
          const parsed = JSON.parse(data) as StaffChatStreamEvent;
          if (parsed.type === "session_created") sid = parsed.session_id;
          onEvent(parsed);
          if (parsed.type === "done") return { session_id: sid, error_code: null };
          if (parsed.type === "error") {
            errorOut = parsed.code;
            return { session_id: sid, error_code: errorOut };
          }
        } catch {
          /* ignore */
        }
      }
    }
  }

  return { session_id: sid, error_code: errorOut };
}
