import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(scriptDir, "..");
const tsconfigPath = path.join(apiDir, "tsconfig.json");

function formatDiagnostics(diagnostics) {
  const host = {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => apiDir,
    getNewLine: () => ts.sys.newLine,
  };

  return ts.formatDiagnosticsWithColorAndContext(diagnostics, host);
}

function loadConfig(overrides = {}) {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(formatDiagnostics([configFile.error]));
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    apiDir,
    overrides,
    tsconfigPath
  );

  if (parsed.errors.length > 0) {
    throw new Error(formatDiagnostics(parsed.errors));
  }

  return parsed;
}

try {
  const parsed = loadConfig({ noEmit: true });
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const diagnostics = ts.getPreEmitDiagnostics(program);

  if (diagnostics.length > 0) {
    process.stderr.write(formatDiagnostics(diagnostics));
    process.exit(1);
  }

  console.log("Typecheck passed");
} catch (error) {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  if (!String(error).endsWith("\n")) process.stderr.write("\n");
  process.exit(1);
}
