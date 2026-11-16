import { ensureSchema, database } from "../_shared/database.ts";
import { createClient } from "@supabase/supabase-js";
import { z } from "npm:zod@4.6.7";
import { command, view, authorizedImage, getRoom } from "../_shared/game.ts";
import { commandInput } from "../_shared/contracts.ts";
import { dailyAt, normalizeCode } from "../_shared/rules.ts";
import type { State } from "../_shared/types.ts";
import puzzles from "../_shared/puzzles.json" with { type: "json" };
import assets from "../_shared/assets.ts";
const url = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const requestInput = z
  .object({
    kind: z.enum(["view", "command", "image", "stats"]),
    mode: z.enum(["daily", "room", "solo", ""]).optional(),
    code: z.string().max(12).optional(),
    command: commandInput.optional(),
  })
  .strict();
const safeErrors = new Set([
  "Room not found",
  "Room full",
  "Join this room first",
  "Unable to join this room",
  "Everyone needs to be ready",
  "Only the host can do that",
  "Round is not active",
  "One guess per reveal",
  "Already solved",
  "You are spectating",
  "Enter a guess",
  "Try another guess",
  "Match already started",
  "Match is not finished",
  "Picture not available",
  "Unable to remove player",
  "Invalid reaction",
  "Too many rooms",
  "No unseen pictures left in this category",
  "No daily pictures scheduled",
  "You have already seen a picture in this match",
]);
let seed: Promise<void> | undefined;
async function rpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  try {
    return await database<T>(name, args);
  } catch (e) {
    const message=(e as {message?:string}).message||"";
    if(message.includes("You have already seen a picture"))throw Error("You have already seen a picture in this match");
    if(message.includes("No daily pictures scheduled"))throw Error("No daily pictures scheduled");
    if(message.includes("No unseen pictures left"))throw Error("No unseen pictures left in this category");
    console.error("Database operation failed", {
      operation: name,
      code: (e as { code?: string }).code,
    });
    throw Error("Service unavailable");
  }
}
async function ensureCatalog() {
  seed ??= rpc("blurt_seed_catalog", {
    p_version: "photographs-v2",
    p_puzzles: puzzles,
  })
    .then(() => {})
    .catch((e) => {
      seed = undefined;
      throw e;
    });
  await seed;
}
async function limit(
  actor: string,
  bucket: string,
  max: number,
  seconds: number,
) {
  const ok = await rpc<boolean>("blurt_rate_limit", {
    p_actor: actor,
    p_bucket: bucket,
    p_limit: max,
    p_window: seconds,
  });
  if (!ok) throw Error("Too many requests. Try again shortly");
}
let prime: Promise<void> | undefined;
async function primeStorage() {
  if (prime) return prime;
  prime = (async () => {
    const { data, error } = await admin.storage
      .from("blurt-puzzles")
      .list("v1", { limit: 100 });
    if (error) throw Error("Storage unavailable");
    const existing = new Set((data || []).map((x) => x.name));
    const missing = Object.keys(assets).filter((name) => !existing.has(name));
    for (let i = 0; i < missing.length; i += 4)
      await Promise.all(missing.slice(i, i + 4).map(objectBytes));
  })().catch(() => {
    prime = undefined;
    console.error(
      "Content preparation interrupted; the next request will retry",
    );
  });
  return prime;
}
async function createCode(id: string, key: string, salt = 0) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${id}:${key}:${salt}`),
    ),
  );
  return Array.from(
    bytes.slice(0, 5),
    (n) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[n % 32],
  ).join("");
}
async function objectBytes(name: string) {
  const key = `${name.startsWith("p")?"v2":"v1"}/${name}`;
  const { data, error } = await admin.storage
    .from("blurt-puzzles")
    .download(key);
  if (data && !error) return data;
  const encoded = (assets as Record<string, string>)[name];
  if (!encoded) throw Error("Picture unavailable");
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const uploaded = await admin.storage
    .from("blurt-puzzles")
    .upload(key, bytes, {
      contentType: "image/webp",
      upsert: false,
      cacheControl: "31536000",
    });
  if (uploaded.error && uploaded.error.statusCode !== "409") {
    const recheck = await admin.storage.from("blurt-puzzles").download(key);
    if (recheck.error) throw Error("Picture unavailable");
    return recheck.data;
  }
  return new Blob([bytes], { type: "image/webp" });
}
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!token) return json({ error: "Session expired. Try again" }, 401);
    const {
      data: { user },
      error,
    } = await admin.auth.getUser(token);
    if (error || !user)
      return json({ error: "Session expired. Try again" }, 401);
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > 4096)
      return json({ error: "Request too large" }, 413);
    const input = requestInput.parse(JSON.parse(raw));
    const id = user.id;
    await ensureSchema();
    await limit(id, "requests", 240, 60);
    await ensureCatalog();
    EdgeRuntime.waitUntil(primeStorage());
    if (input.kind === "stats")
      return json(await rpc("blurt_player_stats", { p_player: id }));
    const a = input.kind === "command" ? input.command : undefined;
    if (input.kind === "command" && !a)
      return json({ error: "Check your entries" }, 400);
    if (a?.action === "create") await limit(id, "create", 6, 3600);
    if (a?.action === "join") await limit(id, "join", 20, 60);
    if (a?.action === "reaction") await limit(id, "reaction", 12, 10);
    const mode = a
      ? a.action.startsWith("solo") ? "solo" : a.action === "dailyGuess" || a.action === "skip"
        ? "daily"
        : a.action === "create"
          ? "room"
          : "room"
      : input.mode || "";
    let code = normalizeCode(a?.code || input.code || "");
    if (a?.action === "create") code = await createCode(id, a.key!);
    // The authoritative day and timestamps come from Postgres, never the caller.
    const first = await rpc<{ now: number }>("blurt_read_document", {
      p_scope: "clock",
    });
    let scope =
      mode === "solo" ? `solo:${id}:${code}` : mode === "daily" ? `daily:${id}:${dailyAt(first.now)}` : `room:${code}`;
    if (mode === "solo" && !["FREE","FLASH"].includes(code)) return json({error:"Choose a mode"},400);
    if (mode === "room" && !/^[A-HJ-NP-Z2-9]{5}$/.test(code))
      return json({ error: "Room not found" }, 404);
    for (let attempt = 0; attempt < 8; attempt++) {
      const doc = await rpc<{ now: number; revision: number; payload: State }>(
        "blurt_read_document",
        { p_scope: scope },
      );
      if (mode === "daily" && scope !== `daily:${id}:${dailyAt(doc.now)}`) {
        scope = `daily:${id}:${dailyAt(doc.now)}`;
        continue;
      }
      const state = doc.payload;
      const before = JSON.stringify(state);
      const migrating=mode==="room"?state.rooms[code]:undefined;
      if(migrating?.status==="playing"&&!migrating.deck&&migrating.roundData){
        const remaining=migrating.rounds-migrating.round;
        const later=remaining>0?await rpc<string[]>("blurt_draw_puzzles",{p_players:migrating.members.map(p=>p.id),p_category:migrating.category,p_count:remaining,p_deal:`upgrade:${code}:${migrating.matchId||migrating.created}`}):[];
        migrating.deck=[...Array(migrating.round).fill(migrating.roundData.puzzle),...later];
        migrating.dealKey=`upgrade:${code}:${migrating.matchId||migrating.created}`;
      }

      if (mode === "daily")
        state.dailyPuzzle = {
          day: dailyAt(doc.now),
          id: await rpc<string>("blurt_daily_puzzle", {
            p_day: dailyAt(doc.now),
          }),
        };
      const receipt = a?.key ? `${id}:${a.key}` : undefined;
      const replay = receipt && state.requests?.[receipt];
      if (a && !replay) {
        if (a.action === "create") {
          if (doc.revision > 0)
            return json({ error: "Try creating the room again" }, 409);
          command(state, id, { ...a, reservedCode: code }, doc.now);
        } else {
          let reservedPuzzle:string|undefined;let reservedDeck:string[]|undefined;let reservedDeal:string|undefined;
          if(mode==="solo") {
            const prior=state.solo?.[`${id}:${code}`];
            const timedOut=prior?.ends && doc.now>=prior.ends;
            if((a.action==="soloStart"&&(!prior||prior.finished||timedOut))||(a.action==="soloNext"&&prior?.current.done&&!prior.finished&&!timedOut)) {
              const deal=await rpc<string[]>("blurt_draw_puzzles",{p_players:[id],p_category:"All pictures",p_count:1,p_deal:`solo:${id}:${a.key}`});
              reservedPuzzle=deal[0];
            }
          }
          if(a.action==="start") {
            const r=getRoom(state,code,doc.now);const active=r.members.filter(p=>p.id===id||doc.now-p.seen<45000);
            if(r.host===id&&r.status==="lobby"&&active.length>=2&&active.every(p=>p.ready)){
              reservedDeal=`party:${code}:${a.key}`;
              reservedDeck=await rpc<string[]>("blurt_draw_puzzles",{p_players:r.members.map(p=>p.id),p_category:r.category,p_count:r.rounds,p_deal:reservedDeal});
            }
          }
          if(a.action==="join"){
            const r=getRoom(state,code,doc.now);
            if(r.status!=="lobby"&&!r.members.some(p=>p.id===id)){
              if(r.banned.includes(id))throw Error("Unable to join this room");
              if(r.members.length>=8)throw Error("Room full");
              const pictures=r.deck?.slice(Math.max(0,r.round-1))||[r.roundData!.puzzle];
              await rpc("blurt_register_viewer",{p_player:id,p_pictures:pictures,p_deal:`watch:${code}:${r.matchId||r.created}`,p_match_deal:r.dealKey||""});
            }
          }
          command(state,id,{...a,reservedPuzzle,reservedDeck,reservedDeal},doc.now);
        }
        if (receipt) {
          state.requests ??= {};
          state.requests[receipt] = { at: doc.now, code };
          const old = Object.keys(state.requests).sort(
            (x, y) => state.requests![x].at - state.requests![y].at,
          );
          for (const k of old.slice(0, Math.max(0, old.length - 128)))
            delete state.requests[k];
        }
      }
      if (input.kind === "image") {
        const name = authorizedImage(state, id, mode, code, doc.now);
        if (
          JSON.stringify(state) !== before &&
          !(await rpc<boolean>("blurt_commit_document", {
            p_scope: scope,
            p_revision: doc.revision,
            p_payload: state,
          }))
        )
          continue;
        return new Response(await objectBytes(name), {
          headers: {
            "Content-Type": "image/webp",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      const output =
        a?.action === "leave"
          ? { now: doc.now, me: id }
          : view(state, id, mode, code, doc.now);
      if (
        JSON.stringify(state) !== before &&
        !(await rpc<boolean>("blurt_commit_document", {
          p_scope: scope,
          p_revision: doc.revision,
          p_payload: state,
        }))
      )
        continue;
      return json({
        ...output,
        ...(a?.action === "create" || a?.action === "join" ? { code } : {}),
      });
    }
    return json({ error: "The room changed. Try again" }, 409);
  } catch (e) {
    if (e instanceof z.ZodError || e instanceof SyntaxError)
      return json({ error: "Check your entries" }, 400);
    const message = e instanceof Error ? e.message : "Service unavailable";
    if (safeErrors.has(message))
      return json({ error: message }, message === "Room not found" ? 404 : 400);
    if (message.startsWith("Too many requests"))
      return json({ error: message }, 429);
    console.error("BLURT request failed", { reason: message });
    return json({ error: "Connection lost. Try again" }, 503);
  }
});
