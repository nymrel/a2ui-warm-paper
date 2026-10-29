import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
async function find(root) {
  const result = [];
  for (const e of await readdir(root, { withFileTypes: true })) {
    const p = path.join(root, e.name);
    if (e.isDirectory()) result.push(...(await find(p)));
    else if (e.name === "AndroidManifest.xml" && /release/i.test(p))
      result.push(p);
  }
  return result;
}
const manifests = await find("android/app/build/intermediates");
if (!manifests.length)
  throw new Error(
    "No merged release manifest found; permission boundary remains unverified.",
  );
for (const manifest of manifests) {
  const xml = await readFile(manifest, "utf8");
  if (
    /uses-permission[^>]*android\.permission\.(INTERNET|ACCESS_NETWORK_STATE)/.test(
      xml,
    )
  )
    throw new Error("Release manifest retains network permission: " + manifest);
}
console.log(
  "Verified network permissions absent from " +
    manifests.length +
    " merged release manifests.",
);
