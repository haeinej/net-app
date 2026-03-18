#!/usr/bin/env node
/**
 * EAS CLI runs `expo config --type introspect` locally before upload.
 * That step often hangs indefinitely on Node 22+ with this stack; Node 20 LTS is reliable.
 * @see docs/eas-local-build.md
 */
const major = Number.parseInt(process.version.slice(1).split(".")[0], 10);
if (Number.isNaN(major) || major < 18) {
  console.error(`[eas] Need Node >= 18. Current: ${process.version}`);
  process.exit(1);
}
if (major >= 22) {
  console.error(
    `[eas] Node ${process.version} often hangs during local EAS prep (expo config --introspect).`,
  );
  console.error("    Use Node 20 LTS, then retry, e.g.:");
  console.error("      cd mobile && nvm use   # uses .nvmrc (20)");
  console.error("      npm run build:ios:testflight");
  console.error("    See docs/eas-local-build.md");
  process.exit(1);
}
