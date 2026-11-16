import { cloudEnabled, cloudRequest, proxyResponse } from "@/lib/cloud";
import { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { identity } from "@/lib/session";
import { transaction } from "@/lib/store";
import { authorizedImage } from "@/lib/game";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    if (cloudEnabled())
      return proxyResponse(
        await cloudRequest({
          kind: "image",
          mode: req.nextUrl.searchParams.get("mode") || "",
          code: req.nextUrl.searchParams.get("code") || "",
        }),
      );
    const id = await identity();
    const name = await transaction((s) =>
      authorizedImage(
        s,
        id,
        req.nextUrl.searchParams.get("mode") || "",
        req.nextUrl.searchParams.get("code") || "",
      ),
    );
    const bytes = await readFile(`content/prepared/${name}`);
    return new Response(bytes, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Picture unavailable. Try again.", { status: 403 });
  }
}
