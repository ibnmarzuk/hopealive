import { spawnSync } from "node:child_process";

const result = spawnSync(
  "pnpm",
  [
    "exec",
    "esbuild",
    "server/vercel.ts",
    "--bundle",
    "--platform=node",
    "--packages=external",
    "--format=esm",
    "--outfile=api/index.js",
  ],
  { stdio: "inherit", env: process.env },
);

if (result.error) {
  console.error("[Vercel] Could not bundle the API handler:", result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
