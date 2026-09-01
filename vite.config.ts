import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync, createReadStream, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const externalAssetRoot = resolve(
  process.env.HERO_RUSH_ASSET_ROOT || resolve(projectRoot, "..", "assets"),
);

function cardAssetFile(pathname: string): string | null {
  const relative = decodeURIComponent(pathname.split("?", 1)[0] || "").replace(/^\/+/, "");
  let candidate: string;
  if (relative === "card-assets.manifest.json" || relative === "card-assets.preload.json") {
    candidate = resolve(externalAssetRoot, "current", relative);
  } else if (relative.startsWith("objects/")) {
    candidate = resolve(externalAssetRoot, "store", relative);
  } else {
    return null;
  }
  const allowedRoot = relative.startsWith("objects/")
    ? resolve(externalAssetRoot, "store")
    : resolve(externalAssetRoot, "current");
  return candidate.startsWith(`${allowedRoot}${sep}`) ? candidate : null;
}

function externalCardAssets() {
  const middleware = () => (request: { url?: string }, response: {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(value?: string): void;
  }, next: () => void) => {
    const file = cardAssetFile(request.url || "");
    if (!file || !existsSync(file) || !statSync(file).isFile()) return next();
    response.setHeader("Content-Type", extname(file) === ".json" ? "application/json; charset=utf-8" : "image/webp");
    response.setHeader(
      "Cache-Control",
      extname(file) === ".json"
        ? "public, max-age=0, must-revalidate"
        : "public, max-age=31536000, immutable",
    );
    createReadStream(file).pipe(response as never);
  };
  return {
    name: "hero-rush-external-card-assets",
    configureServer(server: { middlewares: { use(path: string, handler: ReturnType<typeof middleware>): void } }) {
      server.middlewares.use("/card-assets", middleware());
    },
    configurePreviewServer(server: { middlewares: { use(path: string, handler: ReturnType<typeof middleware>): void } }) {
      server.middlewares.use("/card-assets", middleware());
    },
  };
}

function copyPublicWithoutLegacyCards() {
  return {
    name: "hero-rush-copy-public-without-legacy-cards",
    closeBundle() {
      const publicRoot = resolve(projectRoot, "public");
      const outputRoot = resolve(projectRoot, "dist");
      mkdirSync(outputRoot, { recursive: true });
      for (const entry of readdirSync(publicRoot, { withFileTypes: true })) {
        if (entry.name === "cards") continue;
        cpSync(resolve(publicRoot, entry.name), resolve(outputRoot, entry.name), {
          recursive: entry.isDirectory(),
          force: true,
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), externalCardAssets(), copyPublicWithoutLegacyCards()],
  base: "./",
  server: {
    port: 3000,
    open: false,
  },
  build: {
    outDir: "dist",
    copyPublicDir: false,
    chunkSizeWarningLimit: 300,
  },
});
