import { build } from "esbuild";
import { rmSync } from "node:fs";

// Clean dist
try { rmSync("dist", { recursive: true }); } catch {}

// Bundle with esbuild (OCPlatform imports are external — resolved at runtime)
await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  external: [
    "openclaw",
    "openclaw/*",
  ],
  sourcemap: true,
  minify: false,
  treeShaking: true,
});

console.log("✅ Built dist/index.js");
