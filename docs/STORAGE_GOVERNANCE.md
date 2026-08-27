# Hero-Rush 存储治理与目录规范

## 统一目录

自 2026-08-27 起，本机 Hero-Rush 的物理文件统一存放在：

```text
F:\Projects\Hero-Rush\
├─ app\              唯一主仓库，日常开发、测试和部署均从这里执行
├─ workspace\        Codex 临时编辑、检查和中间结果
├─ source-library\   原始卡图、母表、抓取脚本和旧 WorkBuddy 工作区
├─ references\       Agent 记录与只读流程参考
├─ legacy\           旧版源文件和少量历史构建元数据
├─ codex-session\    本项目 Codex 会话文件
├─ cache\            npm 与文档工具缓存
├─ temp\             可随时重建的临时文件
└─ archives\         经项目经理批准保留的发布或迁移快照
```

兼容路径 `D:\GPT-Project`、`D:\CodexWork\Hero-Rush`、旧 Agent 路径及旧 WorkBuddy 路径均保留为 NTFS 目录联接。新脚本不得继续写死这些兼容路径；仓库内脚本应使用 `$PSScriptRoot` 或从脚本目录推导仓库根目录。

## 唯一事实源

- 应用代码事实源：`F:\Projects\Hero-Rush\app`。
- 原始卡牌数据与高分辨率素材事实源：`source-library`。
- 网站使用的结构化数据与优化后卡图：`app\public`。
- `dist`、测试输出和依赖不是事实源，不得作为归档长期保存。
- `source-library` 中带未提交改动的旧仓库只作历史参考，不得代替主仓库发布。

## 当前存储预算

| 项目 | 预算 | 超限动作 |
|---|---:|---|
| 主仓库规范数据（排除 `.git`、依赖和构建） | 650 MiB | 暂停新增大文件，提交治理方案 |
| `public/cards` 卡图 | 600 MiB | 先评估对象存储/CDN，不直接继续堆入 Git |
| `.git` 元数据 | 250 MiB | 审计大对象；历史重写必须独立审批 |
| 主仓库 `node_modules` | 180 MiB | 删除并按锁文件重装，禁止多工作区重复保存 |
| 闲置时 `dist` | 0 MiB | 验收或部署后执行生成内容清理 |
| 单张网站卡图 | 5 MiB | 优化尺寸/压缩格式后再提交 |

运行 `npm run storage:audit` 查看当前占用；发布门禁可使用：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\audit_storage.ps1 -Strict
```

## 日常清理

测试或构建结束后运行：

```powershell
npm run clean:generated
```

该命令只删除仓库内的构建与覆盖率目录，保留依赖。需要彻底重装依赖时再显式运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\clean_generated.ps1 -Dependencies
npm ci
```

清理脚本会校验仓库身份、目标绝对路径和目录联接，拒绝递归清理仓库外目录。

## 卡牌资产增长规则

1. API 响应、Excel 母表、原始高分辨率卡图只进入 `source-library`，不复制到多个临时工作区。
2. `app\public\cards` 只保留网站实际引用的优化版本；新增批次必须执行缺图、孤儿图、尺寸和单文件大小审计。
3. 不保留本地 `dist` 作为发布备份；发布备份应在服务器使用带版本号的短期备份，并设置保留数量。
4. 卡图接近 600 MiB 前完成 CDN/对象存储方案。Git LFS 只能改善 Git 分发，不能替代网站 CDN，也不能与普通功能提交一起执行历史迁移。
5. 每个新卡批次单独提交，记录唯一卡号、变体、净增 MiB 和回滚点。

## 保留策略

- `temp`：任务完成即可清理。
- `cache`：只保留当前工具版本所需内容；缓存异常时可整目录重建。
- `archives`：默认只保留最近 2 个正式发布快照；长期资料转入 `source-library` 并附说明。
- 旧构建：不保留完整卡图副本，只保留版本号、提交号、构建清单和必要日志。
- Codex 会话：本次只迁移 Hero-Rush 自身会话；其他项目会话不在本项目治理范围内。

## 受限权限下继续开发

关闭完全访问权限前，应在 Codex 中将 `F:\Projects\Hero-Rush\app` 作为项目目录打开。受限沙箱按项目根目录授予写权限，旧 C/D 联接主要用于兼容历史路径，不能替代把 F 盘目录设置为正式项目根。
