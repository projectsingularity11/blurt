import { cloudEnabled } from "@/lib/cloud";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(
    {
      service: "blurt",
      backend: cloudEnabled() ? "supabase" : "local",
      version: "2.0.0",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
