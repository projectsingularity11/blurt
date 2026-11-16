import { NextRequest, NextResponse } from "next/server";
export function checkOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host"))
    throw Error("Invalid origin");
}
export async function readBody(req: Request, limit = 4096) {
  const reader = req.body?.getReader();
  if (!reader) throw Error("Check your entries");
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw Error("Request too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
const userErrors = new Set([
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
  "Invalid origin",
  "Request too large",
  "Check your entries",
  "Session expired. Try again",
  "Could not start your session. Try again shortly",
]);
export function errorResponse(e: unknown) {
  const message = e instanceof Error ? e.message : "";
  if (userErrors.has(message))
    return NextResponse.json(
      { error: message },
      {
        status: message.startsWith("Session expired")
          ? 401
          : message === "Request too large"
            ? 413
            : 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  console.error("BLURT API failure", {
    name: e instanceof Error ? e.name : "Unknown",
  });
  return NextResponse.json(
    { error: "Connection lost. Try again" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
