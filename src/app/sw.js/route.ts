import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const dynamic = "force-static";

export async function GET() {
  const source = await readFile(join(process.cwd(), "src/service-worker/worker.js"), "utf8");
  // Prerendered once per build, so every deployment has a distinct worker/cache.
  return new Response(source.replace("__BUILD_VERSION__", randomUUID()), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
