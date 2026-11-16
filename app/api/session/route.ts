import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { cloudEnabled, cloudSession } from "@/lib/cloud";
import { identity } from "@/lib/session";
import { checkOrigin, errorResponse } from "@/lib/http";
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const jar = await cookies();
    if (cloudEnabled()) {
      const project = new URL(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
      ).hostname.split(".")[0];
      for (const c of jar.getAll())
        if (
          c.name === `sb-${project}-auth-token` ||
          c.name.startsWith(`sb-${project}-auth-token.`)
        )
          jar.delete(c.name);
      await cloudSession(true);
    } else {
      jar.delete("blurt_guest");
      await identity(true);
    }
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
