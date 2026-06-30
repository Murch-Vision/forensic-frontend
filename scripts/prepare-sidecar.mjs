/* Stage the API sidecar payload + a matching `node` runtime into src-tauri/ so
 * `tauri dev` / `tauri build` can bundle them. Invoked by the desktop:* and
 * build:* scripts, and reused per-OS in CI.
 *
 * Env:
 *   FORENSIC_API_DIR   path to the forensic-api project (default: ../forensic-api)
 *
 * The native better-sqlite3 addon and the copied `node` are platform-specific,
 * so this MUST run on the same OS/arch you are building the installer for.
 */
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const FE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = path.resolve(
  process.env.FORENSIC_API_DIR || path.join(FE, "..", "forensic-api"),
);
const TAURI = path.join(FE, "src-tauri");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, {stdio: "inherit", ...opts});

function hostTriple() {
  // `rustc -vV` prints a `host: <triple>` line (Rust is required for Tauri).
  const out = execFileSync("rustc", ["-vV"], {encoding: "utf8"});
  const m = out.match(/^host:\s*(.+)$/m);
  if (!m) throw new Error("could not read host target triple from `rustc -vV`");
  return m[1].trim();
}

if (!fs.existsSync(API)) {
  throw new Error(
    `forensic-api not found at ${API}. Set FORENSIC_API_DIR to its path.`,
  );
}

// 1. Build the API sidecar payload on this OS (server.cjs + native better-sqlite3
//    + assets + schema-only template.sqlite).
console.log(`• building API sidecar in ${API}`);
run(pnpm, ["install", "--prod=false"], {cwd: API});
run(pnpm, ["run", "build:sidecar"], {cwd: API});

// 2. Copy the payload into src-tauri/sidecar/ (bundled as Tauri resources).
const payload = path.join(API, "desktop", "dist");
const dest = path.join(TAURI, "sidecar");
fs.rmSync(dest, {recursive: true, force: true});
fs.mkdirSync(dest, {recursive: true});
fs.cpSync(payload, dest, {recursive: true});
fs.writeFileSync(path.join(dest, ".gitkeep"), "");

// 3. Stage a `node` runtime named with the Rust host target triple, which is
//    what Tauri's externalBin expects: forensic-node-<triple>[.exe].
const triple = hostTriple();
const isWin = triple.includes("windows");
const binDir = path.join(TAURI, "binaries");
fs.mkdirSync(binDir, {recursive: true});
const target = path.join(binDir, `forensic-node-${triple}${isWin ? ".exe" : ""}`);
fs.copyFileSync(process.execPath, target);
if (!isWin) fs.chmodSync(target, 0o755);
fs.writeFileSync(path.join(binDir, ".gitkeep"), "");

console.log(`\n✓ staged sidecar payload + node runtime for ${triple}`);
