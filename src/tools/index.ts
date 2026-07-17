import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/**
 * Auto-discovered tool screens: every src/tools/<slug>/<slug>-client.tsx is
 * lazy-loaded (own chunk) and keyed by slug. Adding a tool = adding its folder;
 * no central edits needed. scripts/check-tools.mjs asserts this map covers the
 * whole registry before a release build.
 */
const modules = import.meta.glob(["./*/*-client.tsx", "!./_shared/**"]);

export const TOOL_COMPONENTS: Record<string, LazyExoticComponent<ComponentType>> = {};

for (const [path, load] of Object.entries(modules)) {
  const slug = path.split("/")[1];
  TOOL_COMPONENTS[slug] = lazy(async () => {
    const mod = (await load()) as Record<string, unknown>;
    const component =
      (mod.default as ComponentType | undefined) ??
      (Object.values(mod).find((v) => typeof v === "function") as ComponentType);
    return { default: component };
  });
}
