import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(scriptDir, "..");
const tsconfigPath = path.join(apiDir, "tsconfig.json");
const tempDistDir = path.join(apiDir, ".dist-build");
const previousDistDir = path.join(apiDir, ".dist-previous");
const distDir = path.join(apiDir, "dist");

function formatDiagnostics(diagnostics) {
  const host = {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => apiDir,
    getNewLine: () => ts.sys.newLine,
  };

  return ts.formatDiagnosticsWithColorAndContext(diagnostics, host);
}

function loadConfig() {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(formatDiagnostics([configFile.error]));
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    apiDir,
    {
      outDir: tempDistDir,
      noEmit: false,
      incremental: false,
      tsBuildInfoFile: undefined,
    },
    tsconfigPath
  );

  if (parsed.errors.length > 0) {
    throw new Error(formatDiagnostics(parsed.errors));
  }

  return parsed;
}

rmSync(tempDistDir, { recursive: true, force: true });
rmSync(previousDistDir, { recursive: true, force: true });

let program;

try {
  const parsed = loadConfig();
  program = ts.createProgram(parsed.fileNames, parsed.options);
} catch (error) {
  rmSync(tempDistDir, { recursive: true, force: true });
  process.stderr.write(error instanceof Error ? error.message : String(error));
  if (!String(error).endsWith("\n")) process.stderr.write("\n");
  process.exit(1);
}

const preEmitDiagnostics = ts.getPreEmitDiagnostics(program);
if (preEmitDiagnostics.length > 0) {
  rmSync(tempDistDir, { recursive: true, force: true });
  process.stderr.write(formatDiagnostics(preEmitDiagnostics));
  process.exit(1);
}

mkdirSync(tempDistDir, { recursive: true });
const emitResult = program.emit();

if (emitResult.emitSkipped) {
  rmSync(tempDistDir, { recursive: true, force: true });
  const allDiagnostics = ts.sortAndDeduplicateDiagnostics([
    ...preEmitDiagnostics,
    ...emitResult.diagnostics,
  ]);
  if (allDiagnostics.length > 0) {
    process.stderr.write(formatDiagnostics(allDiagnostics));
  }
  process.exit(1);
}

if (!existsSync(tempDistDir)) {
  process.stderr.write("Build failed: TypeScript did not produce output.\n");
  process.exit(1);
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
