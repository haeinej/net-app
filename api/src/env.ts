import dotenv from "dotenv";
import path from "node:path";

let loaded = false;

export function loadEnv(): void {
  if (loaded) return;

  const srcDir = __dirname;
  const apiDir = path.resolve(srcDir, "..");

  dotenv.config({ path: path.join(apiDir, ".env.local") });
  dotenv.config({ path: path.join(apiDir, ".env") });

  loaded = true;
}
