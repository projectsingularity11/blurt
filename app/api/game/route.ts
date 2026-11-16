import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { identity } from "@/lib/session";
import { transaction } from "@/lib/store";
import { command, view } from "@/lib/game";
import { commandInput } from "@/lib/contracts";
import { cloudEnabled, cloudRequest, proxyResponse } from "@/lib/cloud";
import { checkOrigin, readBody, errorResponse } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const mode = z
      .enum(["daily", "room", "solo", ""])
      .parse(req.nextUrl.searchParams.get("mode") || "");
    const code = req.nextUrl.searchParams.get("code") || "";
    if (cloudEnabled())
      return proxyResponse(
        await cloudRequest({ kind: "view", mode, code }, true),
      );
    const id = await identity(true);
    return NextResponse.json(
      await transaction((s) => view(s, id, mode, code)),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(
      e instanceof z.ZodError ? Error("Check your entries") : e,
    );
  }
}
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const a = commandInput.parse(await readBody(req));
    if (cloudEnabled())
      return proxyResponse(
        await cloudRequest({ kind: "command", command: a }, true),
      );
    const id = await identity(true);
    return NextResponse.json(
      await transaction((s) => {
        const code = command(s, id, a);
        return {
          code,
          ...view(
            s,
            id,
            a.action.startsWith("solo")
              ? "solo"
              : a.action === "dailyGuess" || a.action === "skip"
                ? "daily"
                : a.code && a.action !== "leave"
                  ? "room"
                  : "",
            a.code,
          ),
        };
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(
      e instanceof z.ZodError ? Error("Check your entries") : e,
    );
  }
}
