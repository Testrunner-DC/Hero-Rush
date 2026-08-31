# Hero-Rush 卡图资产管线

## 目标与边界

本管线参考 GrandUMI 的“原图外置、派生图分档、图片独立同步”方案，并采用 Legion12 的内容寻址、原子 manifest、长缓存和版本回滚设计。

- Git 只保存代码、卡牌数据、管线和发布清单契约，不再把持续增长的二进制当作普通源码管理。
- 原图和生成物默认位于仓库同级 `F:\Projects\Hero-Rush\assets`，不会写入 C 盘。
- 迁移期间 `public/cards/` 仍保留为兼容兜底；删除 Git 当前版本中的旧卡图和历史减重必须分别验收、分别批准。
- 图片发布与代码发布分离。任何 manifest、对象或公网缓存头不完整都会阻止图片切换，但不会影响旧图兜底。

## 目录结构

```text
F:\Projects\Hero-Rush\
├── app\                         # Git 工作树
└── assets\                      # 不属于 Git
    ├── original\                # 唯一原图归档，管线永不自动删除
    ├── store\objects\           # SHA-256 内容寻址派生对象
    ├── releases\<assetVersion>\ # 历史 manifest，默认保留 3 版
    ├── current\                  # 当前 manifest 与 preload
    ├── current.json              # 当前版本指针
    └── transfer\                 # 可重建的上传临时包
```

对象路径不含卡名或卡号，只由内容哈希决定：

```text
objects/<哈希前两位>/<64位SHA-256>/thumb-240.webp
objects/<哈希前两位>/<64位SHA-256>/board-480.webp
objects/<哈希前两位>/<64位SHA-256>/detail-960.webp
```

三档用途：

| 变体 | 最大宽度 | 用途 |
| --- | ---: | --- |
| `thumb-240.webp` | 240px | 卡查、组卡器、卡组广场、起手小图 |
| `board-480.webp` | 480px | 对战场、手牌、基地 |
| `detail-960.webp` | 960px，不放大原图 | 悬停、侧栏、详情弹窗 |

## 本地流程

首次建立外置库：

```powershell
npm run cards:assets:archive
npm run cards:assets:build
npm run cards:assets:audit
npm run cards:assets:publish
```

其中 `cards:assets:publish` 默认只是预演，不连接服务器。只有明确执行下列命令才会上传并切换线上资产：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/publish_card_assets.ps1 -Upload
```

每次新卡更新的顺序：

1. 同步官方数据并完成透明边框裁切、尺寸标准化。
2. `cards:verify` 验证兼容图片与 `cards.json`。
3. `cards:assets:archive` 将新源图复制到外置唯一归档。
4. `cards:assets:build` 仅生成新增内容哈希对应的三档对象，并原子发布 manifest。
5. `cards:assets:audit` 逐张核对卡号、哈希、路径、尺寸、格式和总体积。
6. `cards:assets:publish` 查看增量上传规模；获得发布授权后才加 `-Upload`。

## 前端降级与缓存

所有卡图必须使用 `src/components/CardImage.tsx`，候选顺序为：

1. 配置的 CDN 内容寻址对象；
2. 同源 `/card-assets/` 内容寻址对象；
3. 当前 `image_url` 兼容图；
4. 内置 SVG 占位。

详情图还会依次回退到对战图和缩略图。manifest 在卡牌数据库显示前加载；加载失败时冷却 15 秒，旧路径继续可用。

- 哈希对象：`Cache-Control: public, max-age=31536000, immutable`
- manifest/preload：`Cache-Control: public, max-age=300, must-revalidate`

`npm run cards:assets:contract` 会阻止新的 React 卡图入口绕过统一组件。

## 发布与回滚

服务器脚本 `server/publish-card-assets.sh` 会：

1. 校验受控 incoming 路径、压缩包 SHA-256 和内部路径；
2. 拒绝符号链接、路径穿越、错误哈希、缺图或大小不匹配；
3. 在文件锁内复用已有不可变对象并加入新对象；
4. 写入独立发布目录，然后原子切换 `current`；
5. 将 `dist/card-assets` 指向共享活动版本。

回滚只需把服务器 `current` 原子指回上一版 release。对象按内容寻址，回滚不会覆盖或重传二进制。

## 存储治理

- 原图预算：650 MiB。
- 派生对象预算：300 MiB。
- manifest 历史：最近 3 版。
- 传输缓存预算：320 MiB，可随时重建。
- `npm run cards:assets:prune` 永远是只读预演。
- 只有显式执行 `card_asset_release.py prune --apply` 才会删除未被保留版本引用的派生对象；不会删除 `original/`。
- Git 历史重写不属于本管线，仍需项目经理单独批准强推窗口和备份方案。

## 2026-08-29 首版结果

- 卡牌变体：456/456。
- 唯一源对象：456。
- 三档派生文件：1,368。
- 派生对象总量：130,113,176 字节，约 124.08 MiB。
- 相对兼容原图约 505.64 MiB，网页发布卡图减少约 75.5%。
- 版本：`a1b0baf911e0fe9ff4e1b778f47e1a9f28c25372880ed6ac94bbe7ec253e6f67`。
- 全量审计：通过。
- 服务器 SSH 检查：连接超时，因此尚未上传、切换或验证公网缓存头。
