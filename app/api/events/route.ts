import { errorResponse } from "@/lib/http";
import { normalizeCode } from "@/lib/rules";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { identity } from "@/lib/session";
import { transaction } from "@/lib/store";
import { view } from "@/lib/game";
import { cloudEnabled, cloudSession } from "@/lib/cloud";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const code = normalizeCode(req.nextUrl.searchParams.get("code") || "");
  const cloud = cloudEnabled();
  let id = "";
  let token = "";
  try {
    if (cloud) token = (await cloudSession()).accessToken;
    else id = await identity();
  } catch (e) {
    return errorResponse(e);
  }
  const encoder = new TextEncoder();
  let stopped = false;
  let pending = false;
  let realtimeReady = !cloud;
  let recovery: ReturnType<typeof setInterval>;
  let deadline: ReturnType<typeof setTimeout>;
  const client = cloud
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      )
    : undefined;
  let closeStream: (() => void) | undefined;
  const clean = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(recovery);
    clearTimeout(deadline);
    if (client) void client.removeAllChannels();
  };
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown, event?: string) => {
        if (!stopped)
          controller.enqueue(
            encoder.encode(
              `${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(data)}\n\n`,
            ),
          );
      };
      closeStream = () => {
        if (stopped) return;
        clean();
        try {
          controller.close();
        } catch {}
      };
      const refresh = async () => {
        if (stopped || pending) return;
        pending = true;
        try {
          if (!cloud) {
            send(await transaction((s) => view(s, id, "room", code)));
            return;
          }
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/blurt-api`,
            {
              method: "POST",
              headers: {
                apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ kind: "view", mode: "room", code }),
              cache: "no-store",
              signal: AbortSignal.timeout(10000),
            },
          );
          const data = await response.json();
          if (response.ok) {
            send(data);
            if (realtimeReady) send({}, "connected");
          } else if (response.status === 400 || response.status === 404) {
            send({ error: data.error || "Room not found" }, "room-error");
            closeStream?.();
          } else if (response.status === 401) {
            send({}, "unavailable");
            closeStream?.();
          } else send({}, "unavailable");
        } catch {
          send({}, "unavailable");
        } finally {
          pending = false;
        }
      };
      const connect = async () => {
        await refresh();
        if (stopped) return;
        if (client) {
          await client.realtime.setAuth(token);
          client
            .channel(`room:${code}`, { config: { private: true } })
            .on("broadcast", { event: "changed" }, () => void refresh())
            .subscribe((status, error) => {
              if (stopped) return;
              if (status === "SUBSCRIBED") {
                realtimeReady = true;
                send({}, "connected");
                void refresh();
              } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                realtimeReady = false;
                console.warn("Room subscription interrupted", {
                  reason: error?.message,
                });
                send({}, "unavailable");
              }
            });
          recovery = setInterval(() => void refresh(), 10000);
        } else {
          send({}, "connected");
          recovery = setInterval(() => void refresh(), 750);
        }
        deadline = setTimeout(() => closeStream?.(), 50000);
      };
      void connect();
      req.signal.addEventListener("abort", () => closeStream?.(), {
        once: true,
      });
    },
    cancel() {
      clean();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "private, no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      Vary: "Cookie",
    },
  });
}
