# Hero-Rush 项目协作约定

## 正式部署命令

- 项目经理在本项目明确下达“部署”“发布正式服”或含义等同的命令时，即授权完成整条正式发布流程：运行发布门禁、提交当前已完成的项目改动、推送 `main`、触发 GitHub Actions 的“一键发布正式服 V2”，并检查正式站 HTTPS、健康接口和双客户端 WSS。
- 正式目标固定为 `https://hero-v2.grand-umi.com/battle`，以 `.github/workflows/deploy-production.yml` 和 `docs/ONE_CLICK_DEPLOYMENT.md` 为准。
- 不使用旧 `hero.grand-umi.com` 的 root 直连脚本作为默认或降级部署方式。
- 门禁、提交、推送、服务器初始化、GitHub Secrets 或线上冒烟任一步失败时，停止继续切换，保留可回滚状态，并向项目经理报告准确阻塞点。
- 仅有“同步”而未明确说部署时，只提交并推送，不触发正式服发布。
