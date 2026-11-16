import { cloudEnabled, cloudRequest, proxyResponse } from "@/lib/cloud";
import { errorResponse } from "@/lib/http";
import { identity } from "@/lib/session";
import { transaction } from "@/lib/store";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    if (cloudEnabled())
      return proxyResponse(await cloudRequest({ kind: "stats" }));
    const id = await identity();
    const stats = await transaction((s) => {
      const runs = Object.entries(s.daily)
        .filter(([key, r]) => key.startsWith(id + ":") && r.done)
        .map(([, r]) => r);
      const won = runs.filter((r) => r.solved);
      return {
        played: runs.length,
        won: won.length,
        best: won.length ? Math.min(...won.map((r) => r.guesses.length)) : null,
      };
    });
    return Response.json(stats, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
