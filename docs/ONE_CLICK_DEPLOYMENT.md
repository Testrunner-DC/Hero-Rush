# 正式服一键发布

正式服使用 GitHub Actions 工作流 **一键发布正式服 V2**。项目经理在本项目下达“部署”或“发布正式服”命令时，即执行门禁、提交、推送、触发工作流和线上验收的完整链路。

正式验收地址：<https://hero-v2.grand-umi.com/battle>

## 日常发布

1. 确认待发布代码已经合并并推送到 `main`。
2. 打开 GitHub 仓库的 **Actions** 页面。
3. 选择 **一键发布正式服 V2**，点击 **Run workflow**。
4. `revision` 保持 `main`，再次点击 **Run workflow**。
5. 等待“测试与构建”和“原子发布”两个任务变绿。
6. 打开正式验收地址进行人工验收。

工作流会执行完整 V2 生产门禁、前后端测试与构建、服务器隔离启动、原子 release 切换、本机健康检查、HTTPS 检查和双客户端 WSS 协议检查。

同一时间只允许一个正式服发布任务运行。新版本在独立 release 目录中完成构建和启动预检后才会切换 `current`；切换后的检查失败会自动恢复上一个版本。服务器默认保留最近三个 release。

## 发布指定版本或回滚

在 `revision` 中填写以前成功发布版本的完整 40 位提交 SHA，再运行同一个工作流。

发布器只接受 `origin/main` 历史中的提交。回滚仍按新 release 构建和验收，不会执行 `git reset`，也不会修改已有 V2 对局数据。

GitHub Actions 的 `production` 环境保存部署记录，工作流摘要记录实际发布的提交 SHA。

## 一次性管理员配置

### 前置条件

- `hero-v2.grand-umi.com` 已解析到正式服务器。
- 服务器已有 Git、Node.js 22+、npm、Nginx、Certbot、curl、flock、sudo、ss 和 systemd。
- 现有正式服位于 `/opt/hero-rush-v2`，且包含可用 `.env`。
- 卡图发布管线当前版本位于 `/opt/hero-rush-static/card-assets/current`。
- 管理员已生成仅供 GitHub Actions 使用的 SSH 密钥；私钥只进入 GitHub Secret，公钥交给初始化脚本。

### 初始化服务器

把部署公钥放到服务器后，在当前仓库版本中以 root 身份执行一次：

```bash
sudo bash server/setup-deploy-workflow.sh /root/hero-deploy.pub
```

初始化脚本会：

- 建立专用发布账号 `hero-deploy`；
- 建立不可登录的应用账号 `hero-rush`；
- 使用 `/opt/hero-rush-v2-deploy` 保存持久发布仓库、release 和 `current` 链接；
- 安装 root 所有、发布账号不可修改的 `/usr/local/sbin/hero-rush-v2-deploy`；
- 只允许 `hero-deploy` 无密码重启 `hero-rush-v2-relay.service`；
- 把服务端密钥迁移到 `/etc/hero-rush-v2/server.env`；
- 配置 `hero-v2.grand-umi.com` 的 Nginx、TLS、SPA、`/api/` 和 `/ws/`。

### 配置边界

- `/opt/hero-rush-v2-deploy/shared/frontend.env`：只放 `VITE_` 前端公共构建变量；首次初始化会从现有 `.env` 提取。
- `/etc/hero-rush-v2/server.env`：服务端 Supabase 与管理员配置，权限固定为 root 与 `hero-rush` 可读。
- `/etc/hero-rush-v2/server.ready`：初始化脚本在迁移现有配置后创建的非敏感就绪标记。

`hero-deploy` 的专用 SSH 公钥使用 forced-command，只能提交一个 40 位 SHA 给发布器，不能获得 shell、SFTP 或端口转发能力。

### 配置 GitHub

仓库需要以下 Actions Secrets：

| Secret | 内容 |
|---|---|
| `PROD_HOST` | 正式服务器地址 |
| `PROD_USER` | 固定为 `hero-deploy` |
| `PROD_SSH_KEY` | 专用部署账号的 SSH 私钥 |
| `PROD_SSH_KNOWN_HOSTS` | 人工核对指纹后的正式服务器 SSH 主机记录 |

不要只根据一次未经核对的 `ssh-keyscan` 输出建立信任；应通过服务器控制台或供应商面板核对主机指纹。

## 安全与存储边界

- GitHub Actions 只向服务器发送一个已经通过门禁的 40 位提交 SHA。
- 发布器拒绝不属于 `origin/main` 历史的提交。
- 仓库代码和 npm 构建不以 root 身份运行。
- Nginx、systemd、sudoers、SSH forced-command 和发布器本体只由一次性 root 初始化更新。
- 每个 release 使用 `npm ci` 和锁文件构建，构建后移除开发依赖。
- 生产构建与 `git archive` 均排除 `public/cards`，卡图使用独立内容寻址资产库，不在 release 中重复保存 500+ MiB 卡图。
- release 数量固定为最近三个，不会随每次发布无限增长。

## 故障排查

- **测试与构建失败**：修复代码或测试后重新运行；不会连接正式服务器。
- **缺少部署配置**：检查四个 GitHub Secrets、前后端两份 env 文件及 `server.ready`。
- **已有正式服发布正在执行**：等待前一个工作流完成后重试。
- **提交不在 origin/main 历史中**：先把提交合并并推送到 `main`，或选择以前成功发布的 SHA。
- **失败版本保留**：线上已自动回滚；检查失败 release 中的 `STATUS` 和 `server-smoke.log`。
- **页面正常但登录不可用**：检查 `frontend.env` 与 `/etc/hero-rush-v2/server.env`。
- **页面正常但 V2 无法连接**：检查 `/api/health`、`hero-rush-v2-relay.service` 和 Nginx 的 `/ws/` 代理。

旧 `deploy-hero.ps1` 属于 `hero.grand-umi.com` 直连 root 流程，默认停用，不作为 V2 的降级部署方式。
