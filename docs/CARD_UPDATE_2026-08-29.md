# 官方卡库更新报告（2026-08-29）

## 更新结果

- 官方接口：`https://zhanshuang-prod-api.janime.cn/api/v1/app/card/1997202442796032/list`
- 官方快照：456 个唯一数值 ID、456 个唯一卡号/稀有度变体。
- 应用卡库：346 个唯一卡号、456 个变体。
- 新增到应用：44 个 SP01 变体。
- 新稀有度：`12 = HRS（HR银）`、`13 = HRG（HR金）`，各 4 个变体。
- 清理母表：删除 1 条已被官方新 ID 替代的旧 BP01-105，最终母表不存在重复 ID 或重复卡号/稀有度。
- 人工修正：继续应用 `超英击战_数据修正.json`，不会被官方接口中的已知错误值反向覆盖。

## 卡图处理

官方原图存在两种主要尺寸：

- 744×1039：通常无需裁边；
- 1559×2150：常带约 30–47 像素透明外边。

旧脚本对 RGBA 整体调用 `getbbox()`，透明像素的 RGB 非零时会误判为可见内容。新流程只根据 Alpha 通道识别内容边界，使用预乘 Alpha 的 Lanczos 缩放，统一输出 746×1041，避免圆角白边。

本批 44 张新增图默认使用质量 92 的 WebP：

- 新增 WebP：44 张，约 11.98 MiB；
- 样本平均 PSNR：约 30.7 dB；
- 样本平均体积较官方 PNG 降低约 80%；
- 5 张 PB01 异常旧 PNG 已去除 35 像素外边，总体积约从 18.5 MiB 降至 5.6 MiB；
- 更新后发布卡图共 456 张，约 505.64 MiB，比更新前约 506.50 MiB 略低，没有因新增 44 张继续增长。

## 可重复命令

首次在 F 盘建立项目本地环境：

```powershell
C:\path\to\python.exe -m venv F:\Projects\Hero-Rush\app\.venv
F:\Projects\Hero-Rush\app\.venv\Scripts\python.exe -m pip install -r scripts\requirements-card-sync.txt
```

默认只读审计：

```powershell
npm run cards:sync:audit
```

确认报告后应用更新并修复异常既有图：

```powershell
npm run cards:sync:apply
npm run cards:verify
npm run storage:audit -- -Strict
```

接口分页快照、原始下载和报告只写入 F 盘项目内的 `.tmp/official-card-sync/`，该目录不进入 Git。下载原图在完成单张转换后立即删除。

## 后续存储策略

新卡继续默认 WebP，不再新增大体积 PNG。现有 412 张 PNG 的全量 WebP 迁移应作为独立批次进行视觉抽检和部署验证；它能显著降低当前工作树体积，但不与普通卡库更新混做，也不会自动改写 Git 历史。
