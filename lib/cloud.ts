import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export function cloudEnabled() {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}
export async function cloudSession(create = false) {
  const jar = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.COOKIE_SECURE === "true",
        path: "/",
      },
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (values) => {
          for (const { name, value, options } of values)
            jar.set(name, value, options);
        },
      },
    },
  );
  const hadSession = jar
    .getAll()
    .some((c) => /^sb-.*-auth-token/.test(c.name) && !!c.value);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (
    error &&
    (error.name === "AuthRetryableFetchError" || (error.status || 0) >= 500)
  )
    throw Error("Connection lost. Try again");
  if (!user) {
    if (hadSession || !create) throw Error("Session expired. Try again");
    const { error: signupError } = await supabase.auth.signInAnonymously();
    if (signupError) {
      console.error("Guest sign-in failed", {
        status: signupError.status,
        code: signupError.code,
      });
      throw Error("Could not start your session. Try again shortly");
    }
  } else if (error) throw Error("Session expired. Try again");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw Error("Session expired. Try again");
  return { supabase, user: session.user, accessToken: session.access_token };
}
export async function cloudRequest(
  body: Record<string, unknown>,
  create = false,
) {
  const session = await cloudSession(create);
  return fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/blurt-api`,
    {
      method: "POST",
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    },
  );
}
export function proxyResponse(response: Response) {
  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type":
        response.headers.get("Content-Type") || "application/json",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
