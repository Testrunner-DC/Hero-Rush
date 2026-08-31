#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

readonly static_root="/opt/hero-rush-static/card-assets"
readonly objects_root="${static_root}/objects"
readonly releases_root="${static_root}/releases"
readonly incoming_root="/opt/hero-rush-assets-incoming"
readonly web_dist="/opt/hero-rush/dist"
readonly lock_file="/run/lock/hero-rush-card-assets.lock"

fail() { printf '[Hero 卡图] 错误：%s\n' "$*" >&2; exit 1; }
log() { printf '[Hero 卡图] %s\n' "$*"; }

mode="${1:-}"
asset_version="${2:-}"
archive_sha256="${3:-}"
archive="${4:-}"
manifest_file="${5:-}"
preload_file="${6:-}"
[[ "$mode" == "deploy" || "$mode" == "dry-run" ]] || fail "模式必须为 deploy 或 dry-run"
[[ "$asset_version" =~ ^[0-9a-f]{64}$ ]] || fail "assetVersion 格式无效"
[[ "$archive_sha256" =~ ^[0-9a-f]{64}$ ]] || fail "压缩包 SHA-256 格式无效"
for input in "$archive" "$manifest_file" "$preload_file"; do
  [[ "$input" == "${incoming_root}/${asset_version}/"* ]] || fail "输入文件不在受控 incoming 目录"
  [[ -f "$input" && ! -L "$input" ]] || fail "输入文件不存在或是符号链接：$input"
done

exec 9>"$lock_file"
flock -n 9 || fail "已有卡图发布正在进行"
[[ "$(sha256sum "$archive" | awk '{print $1}')" == "$archive_sha256" ]] || fail "压缩包 SHA-256 校验失败"
while IFS= read -r member; do
  [[ "$member" =~ ^objects/[0-9a-f]{2}/[0-9a-f]{64}/(thumb-240|board-480|detail-960)\.webp$ ]] \
    || fail "压缩包包含异常路径：$member"
done < <(tar -tzf "$archive")

mkdir -p "$objects_root" "$releases_root"
stage="${static_root}/.stage-${asset_version}-$$"
cleanup() {
  if [[ -d "$stage" ]]; then
    rm -rf -- "$stage"
  fi
}
trap cleanup EXIT
mkdir -p "$stage"
tar --no-same-owner --no-same-permissions -xzf "$archive" -C "$stage"
if find "$stage" -type l -print -quit | grep -q .; then fail "压缩包不得包含符号链接"; fi

node - "$asset_version" "$manifest_file" "$preload_file" "$stage" "$static_root" <<'NODE'
const { lstatSync, readFileSync } = require('node:fs')
const { resolve, sep } = require('node:path')
const [version, manifestPath, preloadPath, stage, root] = process.argv.slice(2)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const preload = JSON.parse(readFileSync(preloadPath, 'utf8'))
const fail = message => { throw new Error(message) }
if (manifest.schemaVersion !== 1 || manifest.complete !== true || manifest.assetVersion !== version) fail('manifest 版本或完整性无效')
const entries = Object.entries(manifest.cards || {})
if (entries.length !== manifest.cardCount || entries.length < 1) fail('manifest 卡牌数量无效')
const filenames = { thumbWebp: 'thumb-240.webp', boardWebp: 'board-480.webp', detailWebp: 'detail-960.webp' }
const rows = []
const objects = new Map()
const crypto = require('node:crypto')
for (const [cardId, card] of entries) {
  if (card.cardId !== cardId || !/^[0-9a-f]{64}$/.test(card.contentHash)) fail(`卡牌条目无效：${cardId}`)
  rows.push(`${cardId}:${card.contentHash}`)
  const objectBytes = {}
  for (const [variant, filename] of Object.entries(filenames)) {
    const relative = `objects/${card.contentHash.slice(0, 2)}/${card.contentHash}/${filename}`
    if (card.variants?.[variant] !== relative) fail(`对象路径无效：${cardId}:${variant}`)
    const staged = resolve(stage, relative)
    const existing = resolve(root, relative)
    const candidate = (() => {
      try { return lstatSync(staged).isFile() ? staged : null } catch {}
      try { return lstatSync(existing).isFile() ? existing : null } catch {}
      return null
    })()
    if (!candidate || !candidate.startsWith(resolve(candidate === staged ? stage : root) + sep)) fail(`对象缺失：${relative}`)
    const actualBytes = lstatSync(candidate).size
    if (!Number.isSafeInteger(card.bytes?.[variant]) || actualBytes !== card.bytes[variant]) fail(`对象大小不匹配：${relative}`)
    objectBytes[variant] = actualBytes
  }
  const previous = objects.get(card.contentHash)
  if (previous && JSON.stringify(previous) !== JSON.stringify(objectBytes)) fail(`重复对象大小不一致：${card.contentHash}`)
  objects.set(card.contentHash, objectBytes)
}
const actualVersion = crypto.createHash('sha256').update(rows.sort().join('\n')).digest('hex')
if (actualVersion !== version) fail('assetVersion 与卡牌哈希聚合不一致')
const totalBytes = [...objects.values()].reduce(
  (total, sizes) => total + Object.values(sizes).reduce((sum, value) => sum + value, 0),
  0,
)
if (manifest.objectCount !== objects.size) fail('manifest 对象数量无效')
if (manifest.totalBytes !== totalBytes || totalBytes > 300 * 1024 * 1024) fail('manifest 对象总大小无效')
if (!Array.isArray(preload.entries) || preload.assetVersion !== version || preload.entries.length > 30) fail('preload 清单无效')
for (const entry of preload.entries) {
  const card = manifest.cards?.[entry.cardId]
  const expectedUrl = card ? `/card-assets/${card.variants.thumbWebp}` : ''
  if (!card || entry.url !== expectedUrl) fail(`preload 条目无效：${entry.cardId}`)
}
NODE

if [[ "$mode" == "dry-run" ]]; then
  log "干运行通过：清单、压缩包、现有对象与新增对象均有效"
  exit 0
fi

if [[ -d "$stage/objects" ]]; then
  while IFS= read -r -d '' source; do
    relative="${source#${stage}/}"
    destination="${static_root}/${relative}"
    mkdir -p "$(dirname "$destination")"
    if [[ -e "$destination" ]]; then
      [[ "$(stat -c %s "$source")" == "$(stat -c %s "$destination")" ]] || fail "既有不可变对象大小冲突：$relative"
    else
      mv "$source" "$destination"
    fi
  done < <(find "$stage/objects" -type f -print0)
fi

release_dir="${releases_root}/${asset_version}"
mkdir -p "$release_dir"
install -m 0644 "$manifest_file" "$release_dir/card-assets.manifest.json"
install -m 0644 "$preload_file" "$release_dir/card-assets.preload.json"
if [[ -e "$release_dir/objects" && ! -L "$release_dir/objects" ]]; then
  fail "发布目录中的 objects 不是符号链接"
fi
ln -sfn ../../objects "$release_dir/objects"
next_link="${static_root}/.current-${asset_version}-$$"
ln -s "$release_dir" "$next_link"
mv -Tf "$next_link" "$static_root/current"
if [[ -d "$web_dist" ]]; then ln -sfn "$static_root/current" "$web_dist/card-assets"; fi
find "$objects_root" -type d -exec chmod 0755 {} +
find "$objects_root" -type f -exec chmod 0644 {} +
rm -rf -- "${incoming_root:?}/${asset_version}"
log "发布完成：${asset_version}"
