import "server-only";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
export async function identity(create = false) {
  const jar = await cookies();
  let token = jar.get("blurt_guest")?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    if (!create) throw Error("Session expired. Try again");
    token = randomBytes(32).toString("hex");
    jar.set("blurt_guest", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "true",
      maxAge: 365 * 86400,
      path: "/",
    });
  }
  return createHash("sha256").update(token).digest("hex");
}
