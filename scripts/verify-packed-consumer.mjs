import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error("verify:consumer must run through npm so the locked npm CLI is explicit");
}

function runNode(args, cwd, options = {}) {
  return execFileSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    windowsHide: true,
    ...options,
  });
}

function runNpm(args, cwd, options = {}) {
  return runNode([npmCli, ...args], cwd, options);
}

const temp = mkdtempSync(join(tmpdir(), "a2ui-packed-consumer-"));

try {
  const packOutput = runNpm(
    ["pack", "--json", "--silent", "--pack-destination", temp],
    root,
    { capture: true },
  );
  // npm forwards prepack stdout before its JSON report even with --silent.
  const reportStart = packOutput.indexOf("[");
  assert.notEqual(reportStart, -1, "npm pack did not emit a JSON report");
  const packReport = JSON.parse(packOutput.slice(reportStart));
  assert.equal(packReport.length, 1, "npm pack must create exactly one artifact");
  const packedFiles = new Set(packReport[0].files.map((entry) => entry.path));
  for (const required of [
    "dist/index.js",
    "dist/index.d.ts",
    "dist/styles/warm-paper.css",
    "dist/styles/warm-paper.css.d.ts",
    "package.json",
    "README.md",
    "LICENSE",
  ]) {
    assert(packedFiles.has(required), `packed artifact is missing ${required}`);
  }

  const tarball = join(temp, packReport[0].filename).replaceAll("\\", "/");
  writeFileSync(
    join(temp, "package.json"),
    JSON.stringify({
      name: "a2ui-packed-consumer-probe",
      version: "0.0.0",
      private: true,
      type: "module",
      dependencies: {
        "a2ui-warm-paper": `file:${tarball}`,
        "@types/react": "19.2.18",
        "@types/react-dom": "19.2.5",
        react: "19.2.8",
        "react-dom": "19.2.8",
        typescript: "7.0.2",
      },
    }, null, 2) + "\n",
  );

  writeFileSync(
    join(temp, "consumer.cjs"),
    `const assert = require("node:assert/strict");
const fs = require("node:fs");
const library = require("a2ui-warm-paper");
assert.equal(typeof library.parseA2UI, "function");
assert.equal(library.warmPaperTokens.colors.cream, "#FAF8F2");
const cssPath = require.resolve("a2ui-warm-paper/styles/warm-paper.css");
assert.match(fs.readFileSync(cssPath, "utf8"), /--a2ui-cream:\\s*#FAF8F2/i);
`,
  );

  writeFileSync(
    join(temp, "consumer.mjs"),
    `import assert from "node:assert/strict";
import { parseA2UI, warmPaperTokens } from "a2ui-warm-paper";
assert.equal(typeof parseA2UI, "function");
assert.equal(warmPaperTokens.colors.cedar, "#2A332E");
`,
  );

  writeFileSync(
    join(temp, "consumer.tsx"),
    `import { A2UIRenderer, type A2UIPayload } from "a2ui-warm-paper";
import "a2ui-warm-paper/styles/warm-paper.css";

const payload: A2UIPayload = {
  id: "consumer-probe",
  type: "container",
  title: "Packed declaration probe",
};

const view = <A2UIRenderer data={payload} />;
void view;
`,
  );

  runNpm(["install", "--ignore-scripts", "--no-audit", "--no-fund"], temp);
  runNode(["consumer.cjs"], temp);
  runNode(["consumer.mjs"], temp);
  runNode([
    join(temp, "node_modules", "typescript", "bin", "tsc"),
    "--module", "NodeNext",
    "--moduleResolution", "NodeNext",
    "--target", "ES2022",
    "--jsx", "react-jsx",
    "--strict",
    "--noEmit",
    "--skipLibCheck",
    "consumer.tsx",
  ], temp);

  console.log(
    `Packed consumer contract passed (${packedFiles.size} files; CommonJS, ESM, declarations, and CSS export).`,
  );
} finally {
  const resolvedTemp = resolve(temp);
  const resolvedRoot = resolve(tmpdir());
  if (!resolvedTemp.startsWith(resolvedRoot)) {
    throw new Error("refusing to remove a consumer probe outside the OS temp directory");
  }
  rmSync(resolvedTemp, { recursive: true, force: true });
}
