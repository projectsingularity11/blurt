import type { NextConfig } from "next";
const config: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["pg"],
  poweredByHeader: false,
  outputFileTracingExcludes: {
    "/*": ["./content/prepared/p*.webp", "./content/originals/**/*"],
  },
  outputFileTracingIncludes: { "/api/image": ["./content/prepared/a*.webp"] },
};
export default config;
