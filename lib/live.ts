import type { View } from "./types";
// The server subscribes to Supabase Realtime using the HttpOnly guest session.
// Browsers receive sanitized snapshots over a same-origin authenticated stream.
export async function subscribeRoom(
  code: string,
  onView: (view: View) => void,
  onStatus: (status: string) => void,
  onError?: (message: string) => void,
) {
  const events = new EventSource(`/api/events?code=${code}`);
  events.onmessage = (e) => onView(JSON.parse(e.data));
  events.addEventListener("connected", () => onStatus("Connected"));
  events.addEventListener("unavailable", () => onStatus("Reconnecting…"));
  events.addEventListener("room-error", (e) => {
    const { error } = JSON.parse((e as MessageEvent).data);
    events.close();
    onError?.(error);
  });
  events.onerror = () => onStatus("Reconnecting…");
  const resume = () => {
    if (
      document.visibilityState === "visible" &&
      events.readyState !== EventSource.OPEN
    )
      onStatus("Reconnecting…");
  };
  document.addEventListener("visibilitychange", resume);
  return () => {
    events.close();
    document.removeEventListener("visibilitychange", resume);
  };
}
