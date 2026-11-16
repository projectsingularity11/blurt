import { cloudEnabled } from "@/lib/cloud";
import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { transaction } from "@/lib/store";
import { advanceAll } from "@/lib/game";
export async function POST(req: NextRequest) {
  if (cloudEnabled()) return Response.json({ managed: true });
  const key = process.env.BLURT_WORKER_SECRET;
  const provided = req.headers.get("authorization") || "";
  if (
    !key ||
    provided.length !== `Bearer ${key}`.length ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(`Bearer ${key}`))
  )
    return new Response("Unauthorized", { status: 401 });
  await transaction((s) => advanceAll(s));
  return Response.json({ ok: true });
}
