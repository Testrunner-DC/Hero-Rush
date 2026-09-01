# 正式服一键发布

正式服使用 GitHub Actions 工作流 `一键发布正式服 V2`。日常发布不需要服务器 root 密码，也不需要在本地运行部署命令。

## 日常发布

1. 把准备发布的代码合并到 `main`。
2. 打开仓库的 **Actions** 页面。
3. 选择 **一键发布正式服 V2**，点击 **Run workflow**。
4. `revision` 保持 `main`，再次点击 **Run workflow**。
5. 等待“测试与构建”和“原子发布”两个任务变绿。
6. 打开 <https://hero-v2.grand-umi.com/battle> 验收。

工作流会自动执行完整测试、TypeScript 检查、V2 发布门禁、前后端构建、服务器隔离启动预检、HTTPS 检查和双客户端 WSS 握手检查。

同一时间只允许一个正式服发布任务运行。新版本在独立 release 目录构建，全部构建完成后才切换线上链接；切换后的健康检查失败会自动恢复上一个版本。服务器保留最近三个 release。

## 发布指定版本或回滚

在 `revision` 中填写以前成功版本的完整提交 SHA，再运行同一个工作流。服务器会把该提交作为一个新 release 构建并发布。

GitHub Actions 的 **production** 环境会保存每次部署记录，发布摘要中也会记录实际部署的提交 SHA。

## 一次性管理员配置

仓库需要以下 Actions Secrets：

| Secret | 内容 |
|---|---|
| `PROD_HOST` | 正式服务器地址 |
| `PROD_USER` | 专用部署账号，当前约定为 `hero-deploy` |
| `PROD_SSH_KEY` | 专用部署账号的 SSH 私钥 |
| `PROD_SSH_KNOWN_HOSTS` | 正式服务器经过确认的 SSH 主机指纹记录 |

服务器需要由管理员执行一次 `server/setup-deploy-workflow.sh`。初始化后：

- `hero-deploy` 负责拉取、构建和切换 release；
- `hero-rush` 是不可登录的应用运行账号；
- `/usr/local/sbin/hero-rush-v2-deploy` 由 root 所有，发布账号不可修改；
- `hero-deploy` 的 sudo 权限仅允许重启 `hero-rush-v2-relay.service`；
- 发布器只接受 40 位 Git 提交 SHA，并使用文件锁禁止并发发布。

仓库代码和 npm 构建脚本不会以 root 身份执行。Nginx 与 systemd 的固定配置只在一次性初始化时由管理员写入。

需要让其他开发者点击发布时，把他的 GitHub 账号加入仓库并授予 **Write** 权限即可。不要把服务器私钥发给开发者，也不要把私钥提交进仓库。

## 故障排查

- “测试与构建”失败：修复代码或测试后重新运行，不会连接正式服务器。
- “缺少部署配置”：检查上述四个 Secrets。
- “已有正式服发布正在执行”：等待前一个工作流完成后重试。
- “发布失败，失败版本保留”：线上已自动回滚；使用服务器日志与失败 release 中的 `server-smoke.log` 排查。
- 页面正常但登录不可用：检查服务器共享 `.env` 中的 Supabase 正式配置。
