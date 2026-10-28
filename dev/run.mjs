// Dev runner for the local API server.
//
// Bundles dev/server.ts and everything it imports (the lambda handlers, and the ESM-only
// @middy/core they depend on) into one self-contained CJS file with esbuild, then runs it
// with node and restarts on change. Bundling sidesteps the CJS-vs-ESM boundary problem:
// @middy ships as ESM only, the CDK app at the repo root is CommonJS, and a plain ts loader
// ends up trying to `require()` middy and fails. esbuild inlines it instead.

import * as esbuild from "esbuild";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const outfile = path.join(dir, ".cache", "server.cjs");

let child;
function restart() {
  if (child) child.kill();
  child = spawn("node", [outfile], { stdio: "inherit" });
}

const ctx = await esbuild.context({
  entryPoints: [path.join(dir, "server.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  outfile,
  sourcemap: "inline",
  logLevel: "warning",
  plugins: [
    {
      name: "rerun",
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length === 0) restart();
          else console.error(`build failed with ${result.errors.length} error(s)`);
        });
      },
    },
  ],
});

await ctx.watch();

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    if (child) child.kill();
    await ctx.dispose();
    process.exit(0);
  });
}
