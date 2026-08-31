# 卡牌数据更新与资产治理

## 当前基线

- `public/cards.json`：346 个唯一卡号、456 个稀有度变体。
- `public/cards/`：456 张被数据引用的卡图（412 PNG + 44 WebP），约 505.64 MiB；无缺图、孤儿图或同变体双格式文件。
- `F:\Projects\Hero-Rush\assets`：仓库外原图归档与内容寻址发布库；首版三档 WebP 共 130,113,176 字节（约 124.08 MiB）。
- 2026-08-29 官方同步新增 44 个 SP01 变体，但通过 WebP 和 5 张异常 PNG 修复，使发布资产总量未增长。
- 卡查、组卡器卡池、卡组广场详情统一采用每页 30 张卡，并保留图片懒加载，避免单页同时请求全部卡图。

分页降低的是浏览器首屏请求数和内存压力，不会缩小既有 Git 历史。外置内容寻址管线已经落地，详见 `docs/CARD_ASSET_PIPELINE.md`；`public/cards/` 从 Git 当前版本移除及历史减重仍是后续独立验收项，不能与普通功能提交混做。

## 已验证的新卡更新流程

参考本机 `D:\WorkBuddyData\2026-06-12-03-21-19` 中的 Agent 记录，完整流程如下：

1. 从小程序 API 拉取卡牌列表。
2. 按卡牌 `id` 与现有源数据合并：新增、更新，同时保留上游暂缺但本地仍需使用的卡。
3. 应用 `超英击战_数据修正.json` 中的人工修正。
4. 同步写入 JSON 源文件和 Excel 母表。
5. 下载并裁切新增卡图。
6. 运行 `scripts/process_cards.py` 生成应用使用的 `public/cards.json`。
7. 校验唯一卡号、变体数、重复 `id` / `card_no`、缺图和孤儿图片。
8. 确认筛选器能动态识别新增系列与等级，再构建和测试。

2026-08-09 已将旧 Agent 验证过的新卡批次同步到应用：新增 86 个唯一卡号、116 个变体，主要包含 SP01 与 EB01。同步时未引入两张未被数据引用的 TB01 备用图，并修正了 BP01-105 的名称尾部异常字符与 `card_groups` 重复项。

数据更新必须同步维护以下内容，不能只改其中之一：

- 根目录卡牌 JSON 源文件；
- Excel 母表；
- 应用数据 `public/cards.json`；
- 卡图目录 `public/cards/`。

旧记录中的 `update_zhanshuang_full.py` 已被确认不可作为当前主流程。当前入口为 `scripts/sync_official_cards.py`：默认只审计，只有显式传入 `--apply` 才写入；它按官方数值 ID 合并，同时用 `(card_no, rarity)` 防止官方换 ID 后保留语义重复记录。

卡图由 `scripts/card_image_pipeline.py` 处理。裁边只读取 Alpha 通道，目标尺寸为 746×1041；新图默认质量 92 的 WebP。项目本地 Python 环境固定在 F 盘 `.venv/`，依赖清单为 `scripts/requirements-card-sync.txt`。完整命令和本次数据见 `docs/CARD_UPDATE_2026-08-29.md`。

标准化后的图片再由 `scripts/card_asset_release.py` 归档到 F 盘外置库，并生成 240/480/960 三档内容寻址 WebP。前端统一通过 `CardImage` 使用派生图并保留旧路径降级；图片上传由 `scripts/publish_card_assets.ps1` 独立完成，默认仅预演。

## 每次更新的验收门槛

- API 拉取结果非空，字段结构与预期一致。
- JSON、Excel、应用 JSON 的卡牌数量可以相互解释。
- `id` 无重复；同卡号的变体重复必须符合业务规则。
- `image_url` 对应 PNG/WebP 文件全部存在；每个变体只能有一种发布格式；新增图片尺寸和裁切结果抽样通过。
- 新增系列与等级出现在筛选器中。筛选选项由数据库动态生成，禁止再硬编码卡包编号。
- `npm test` 与 `npm run build` 通过。
- 不在同一提交中执行 Git 历史改写。

## Git 历史减重的独立决策

若选择 Git LFS，需要在执行前确认：

1. GitHub LFS 存储和流量配额；
2. 生产部署机已安装 Git LFS，并在部署脚本中执行 `git lfs pull`；
3. 所有协作者已知晓历史会被改写，需要重新克隆或重置本地分支；
4. 已创建远端和本地备份；
5. 项目经理明确批准强制推送窗口。

在以上条件未满足前，不应运行 `git lfs migrate import --everything`，也不应删除现有卡图。
