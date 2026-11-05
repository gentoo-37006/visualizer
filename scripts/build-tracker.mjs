import { build } from "esbuild";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, process.argv[2] ?? "dist/tracker");
await mkdir(output, { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ["src/tracker/main.tsx"],
  bundle: true,
  minify: true,
  outfile: resolve(output, "viewer.js"),
  target: ["es2020"],
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "linked",
});
await cp(resolve(root, "public/fields"), resolve(output, "fields"), { recursive: true });
await cp(resolve(root, "public/robot.png"), resolve(output, "robot.png"));
await writeFile(resolve(output, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Onboard Visualizer</title><link rel="stylesheet" href="/visualizer/viewer.css"></head><body style="margin:0"><div id="root"></div><script src="/visualizer/viewer.js" defer></script></body></html>
`);
console.log(`Tracker built in ${output}`);
