import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const files = Object.fromEntries(await Promise.all([
  ["attributes", ".gitattributes"],
  ["workflow", ".github/workflows/deploy-production.yml"],
  ["setup", "server/setup-deploy-workflow.sh"],
  ["serverSetup", "server/deploy-server.sh"],
  ["sshEntry", "server/hero-rush-v2-ssh-entry.sh"],
  ["deploy", "server/deploy-release.sh"],
  ["smoke", "scripts/smoke-production-v2.mjs"],
  ["runbook", "docs/ONE_CLICK_DEPLOYMENT.md"],
].map(async ([key, path]) => [key, await readFile(resolve(root, path), "utf8")])));

const checks = [
  ["工作流只允许手动触发", files.workflow.includes("workflow_dispatch:") && !files.workflow.includes("push:\n")],
  ["工作流禁止并发发布", files.workflow.includes("hero-rush-v2-production") && files.workflow.includes("cancel-in-progress: false")],
  ["工作流使用 production 环境", files.workflow.includes("name: production")],
  ["工作流要求四个部署 Secret", ["PROD_HOST", "PROD_USER", "PROD_SSH_KEY", "PROD_SSH_KNOWN_HOSTS"].every((name) => files.workflow.includes(`secrets.${name}`))],
  ["工作流运行完整卡池门禁", files.workflow.includes("check_v2_release_gate.ps1 -RequireCardPool")],
  ["第三方 Actions 固定到提交 SHA", !/uses:\s+actions\/(?:checkout|setup-node)@v\d/.test(files.workflow)],
  ["CI 使用部分克隆限制 Git 历史体积", files.workflow.includes("filter: blob:none")],
  ["初始化脚本建立双账号隔离", files.setup.includes('deploy_user="hero-deploy"') && files.setup.includes('app_user="hero-rush"')],
  ["部署 SSH 密钥只能执行发布器", files.setup.includes('restrict,command=\\"${ssh_entry_command}\\"') && files.sshEntry.includes("SSH_ORIGINAL_COMMAND")],
  ["服务不以 root 运行", files.serverSetup.includes("User=${SERVICE_USER}") && files.serverSetup.includes("NoNewPrivileges=true")],
  ["服务端密钥位于发布树之外", files.setup.includes('config_root="/etc/hero-rush-v2"') && files.setup.includes('server_env="${config_root}/server.env"') && files.serverSetup.includes("EnvironmentFile=${ENV_FILE}")],
  ["sudoers 只放行服务重启", files.setup.includes('restart ${service_name}.service') && !files.setup.includes("NOPASSWD: ALL")],
  ["发布器只接受完整 SHA", files.deploy.includes("^[0-9a-f]{40}$")],
  ["发布器验证 main 祖先关系", files.deploy.includes('merge-base --is-ancestor "$sha" origin/main')],
  ["发布器带文件锁与原子切换", files.deploy.includes("flock -n 9") && files.deploy.includes('mv -Tf "$next_link" "$current_link"')],
  ["发布器具备失败回滚", files.deploy.includes("rollback()") && files.deploy.includes("已自动恢复上一个 release")],
  ["发布器限制 release 数量", files.deploy.includes("tail -n +4") && files.runbook.includes("最近三个 release")],
  ["卡图使用外置共享链接", files.deploy.includes("/opt/hero-rush-static/card-assets/current")],
  ["发布源码归档排除旧卡图", files.attributes.includes("public/cards/** export-ignore")],
  ["正式域名统一", [files.workflow, files.setup, files.deploy, files.smoke, files.runbook].every((text) => text.includes("hero-v2.grand-umi.com"))],
  ["冒烟覆盖 HTTPS 与双 WSS 客户端", files.smoke.includes("assertHttp()") && files.smoke.includes('pingClient("客户端 A")') && files.smoke.includes('pingClient("客户端 B")')],
];

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
if (failed.length > 0) {
  console.error(`Deployment contract failed: ${failed.join("；")}`);
  process.exitCode = 2;
} else {
  console.log(`Deployment contract passed: ${checks.length}/${checks.length}`);
}
