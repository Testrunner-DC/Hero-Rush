import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if ([".ts", ".tsx"].includes(extname(entry.name))) files.push(full);
  }
  return files;
}

const sourceFiles = await walk(join(root, "src"));
const directConsumers = [];
for (const file of sourceFiles) {
  const source = await readFile(file, "utf8");
  if (/<img[\s\S]{0,300}src=\{[^}]*image_url[^}]*\}/m.test(source)
    || /src=\{`\/cards\/\$\{/m.test(source)) {
    directConsumers.push(relative(root, file));
  }
}

const cardImage = await readFile(join(root, "src", "components", "CardImage.tsx"), "utf8");
const resolver = await readFile(join(root, "src", "lib", "cardAssets.ts"), "utf8");
const vite = await readFile(join(root, "vite.config.ts"), "utf8");
const publish = await readFile(join(root, "server", "publish-card-assets.sh"), "utf8");
const deploy = await readFile(join(root, "server", "deploy-server.sh"), "utf8");

const contracts = [
  [directConsumers.length === 0, `卡图入口绕过 CardImage：${directConsumers.join(", ")}`],
  [cardImage.includes("resolveCardAssets") && cardImage.includes("data-card-asset-source"), "CardImage 必须使用统一 resolver 并暴露当前来源"],
  [cardImage.includes('intent === "thumb" ? "lazy"') && cardImage.includes('decoding = "async"'), "CardImage 必须默认懒加载缩略图并异步解码"],
  [resolver.includes("detailWebp") && resolver.includes("boardWebp") && resolver.includes("thumbWebp"), "resolver 必须支持详情、对战和缩略三档资源"],
  [resolver.includes('"same-origin"') && resolver.includes('"legacy"') && resolver.includes('"placeholder"'), "resolver 必须保留同源、旧图和占位降级"],
  [vite.includes('server.middlewares.use("/card-assets"') && vite.includes("externalAssetRoot"), "开发服务器必须从仓库外提供卡图"],
  [publish.includes("assetVersion") && publish.includes("flock") && publish.includes("mv -Tf"), "服务器卡图发布必须校验版本、加锁并原子切换"],
  [deploy.includes("max-age=31536000, immutable") && deploy.includes("max-age=300, must-revalidate"), "Caddy 必须区分内容对象与 manifest 缓存"],
];

const failures = contracts.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error(`卡图架构契约失败：\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`卡图架构契约通过（${contracts.length} 项，扫描 ${sourceFiles.length} 个 TS/TSX 文件）`);
