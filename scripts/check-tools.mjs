/**
 * Asserts every registry slug has a ported tool component. Run before a
 * release build so a missing folder fails loudly instead of shipping a
 * dashboard entry that opens "Unknown tool".
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const registry = readFileSync(join(root, "src", "lib", "tools-registry.ts"), "utf8");
const slugs = [...registry.matchAll(/slug: "([^"]+)"/g)].map((m) => m[1]);

const missing = slugs.filter((slug) => {
  const dir = join(root, "src", "tools", slug);
  if (!existsSync(dir)) return true;
  return !readdirSync(dir).some((f) => f.endsWith("-client.tsx"));
});
const orphans = readdirSync(join(root, "src", "tools"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== "_shared" && !slugs.includes(d.name))
  .map((d) => d.name);

if (missing.length || orphans.length) {
  if (missing.length) console.error(`MISSING tool components (${missing.length}):`, missing.join(", "));
  if (orphans.length) console.error("Folders not in registry:", orphans.join(", "));
  process.exit(1);
}
console.log(`Tool check passed: all ${slugs.length} registry tools have components.`);
