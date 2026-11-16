import { execFileSync } from "node:child_process";
if (process.env.NEXT_PUBLIC_SUPABASE_URL)
  console.log(
    "Using the isolated Supabase Edge backend; migrations are managed there.",
  );
else if (process.env.DATABASE_URL)
  execFileSync(process.execPath, ["scripts/migrate.mjs"], { stdio: "inherit" });
else
  console.warn(
    "DATABASE_URL is not set. Deploying UI; gameplay will explicitly require database setup.",
  );
