import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const cli = path.join(
  path.dirname(require.resolve("expo/package.json")),
  "node_modules/@expo/cli/build/src/start/server",
);
test("patched Zod remains compatible with the pinned Expo DevTools schemas", () => {
  const { PluginSchema, DevToolsPluginOutputSchema } = require(
    path.join(cli, "DevToolsPlugin.schema.js"),
  );
  const plugin = PluginSchema.parse({
    packageName: "local-fixture",
    packageRoot: "/fixture",
    cliExtensions: {
      description: "fixture",
      entryPoint: "index.js",
      commands: [
        {
          name: "inspect",
          title: "Inspect",
          environments: ["cli", "mcp"],
          parameters: [{ name: "limit", type: "number", description: "Count" }],
        },
      ],
    },
  });
  assert.equal(plugin.packageName, "local-fixture");
  assert.equal(
    DevToolsPluginOutputSchema.parse([
      { type: "text", text: "fixture", level: "info" },
    ]).length,
    1,
  );
  const { createMCPDevToolsExtensionSchema } = require(
    path.join(cli, "createMCPDevToolsExtensionSchema.js"),
  );
  const schema = createMCPDevToolsExtensionSchema(plugin);
  assert.deepEqual(schema.parse({ command: "inspect", limit: 3 }), {
    command: "inspect",
    limit: 3,
  });
  assert.throws(() => schema.parse({ command: "inspect", unknown: true }));
});
