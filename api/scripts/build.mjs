import { existsSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(scriptDir, "..");
const tempDistDir = path.join(apiDir, ".dist-build");
const previousDistDir = path.join(apiDir, ".dist-previous");
const distDir = path.join(apiDir, "dist");
const tscBin = path.join(apiDir, "node_modules", "typescript", "bin", "tsc");

rmSync(tempDistDir, { recursive: true, force: true });
rmSync(previousDistDir, { recursive: true, force: true });

const build = spawnSync(
  process.execPath,
  [tscBin, "--pretty", "false", "--outDir", tempDistDir],
  {
    cwd: apiDir,
    stdio: "inherit",
  }
);

if (build.status !== 0) {
  rmSync(tempDistDir, { recursive: true, force: true });
  process.exit(build.status ?? 1);
}

let movedPrevious = false;

try {
  if (existsSync(distDir)) {
    renameSync(distDir, previousDistDir);
    movedPrevious = true;
  }

  renameSync(tempDistDir, distDir);

  if (movedPrevious) {
    rmSync(previousDistDir, { recursive: true, force: true });
  }

  console.log("Built API to dist/");
} catch (error) {
  if (existsSync(tempDistDir)) {
    rmSync(tempDistDir, { recursive: true, force: true });
  }

  if (!existsSync(distDir) && movedPrevious && existsSync(previousDistDir)) {
    renameSync(previousDistDir, distDir);
  }

  throw error;
}
