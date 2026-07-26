# motrix-tauri

最小化的 aria2 下载管理器：Tauri 2.11.5 壳 + aria2c sidecar + React/shadcn UI。

## 架构

- **Rust 侧（最小壳）**：只负责 aria2c 进程生命周期
  - 启动时随机挑选空闲 RPC 端口 + 生成随机 `rpc-secret`（每次启动都不同，仅监听 127.0.0.1）
  - 通过 `tauri-plugin-shell` sidecar 拉起 `aria2c`，退出时先走 RPC `aria2.shutdown` 优雅关闭（保存会话），再兜底 kill
  - 4 个 command：`get_engine_info`（端口/密钥/下载目录）、`read_file_base64`（读种子）、`reveal_in_folder`、`trash_task_files`（只删任务登记的文件并移入回收站，绝不按目录名整删——避免 Motrix 的「同名目录误删」问题）
- **前端**：React 19 + Vite 7 + Tailwind v4 + shadcn（radix-nova）+ Zustand
  - 所有任务操作直接走 WebSocket JSON-RPC 连 aria2（`src/lib/aria2.ts`），不经过 Rust
  - 1s 轮询 + aria2 推送通知触发刷新
- **数据目录**：`~/Library/Application Support/com.dogeow.motrix/engine/`（会话文件、DHT 路由表）

## 开发

```bash
npm install
npm run tauri dev
```

## 构建

```bash
npm run tauri build
```

## sidecar 二进制

`src-tauri/binaries/` 下按 target triple 命名（aria2 1.36+，取自 Motrix 仓库）：

- `aria2c-aarch64-apple-darwin` / `aria2c-x86_64-apple-darwin`
- `aria2c-x86_64-unknown-linux-gnu` / `aria2c-aarch64-unknown-linux-gnu`
- `aria2c-x86_64-pc-windows-msvc.exe`

静态 aria2 配置在 `src-tauri/resources/aria2.conf`，动态项（端口、密钥、目录、会话）由 Rust 以命令行参数传入并覆盖同名配置。

## 功能

- 任务列表：全部 / 下载中 / 等待中 / 已停止，搜索、排序、多选批量操作
- 添加任务：链接、种子文件、拖放 .torrent、`magnet:` 深链、剪贴板监听
- 任务详情：多文件种子的分文件选择、Peers 列表、活动连接
- 偏好设置：下载目录、并发数、连接数、分片、全局限速、做种比例、
  BT 端口、UPnP、主题、开机启动、完成通知
- 系统托盘（macOS 菜单栏显示速度）、Dock 进度条、窗口状态记忆
- Tracker 列表自动从 ngosang/trackerslist 更新
- aria2 崩溃后自动重启（指数退避），RPC 端口与密钥在整个运行期固定

## 国际化

界面支持简体中文和英文，默认跟随系统语言，可在「偏好设置 → 应用 → 语言」切换。
文案集中在 `src/lib/i18n/`：`zh-CN.ts` 是 key 的唯一来源，`en.ts` 用
`Record<TranslationKey, string>` 约束，漏翻会直接编译报错。

## 发布与自动更新

更新包用 minisign 签名，公钥已写进 `tauri.conf.json`，私钥在
`~/.tauri/motrix-tauri.key`（**不在仓库里，务必备份——丢了就无法给已安装的版本推更新**）。

首次发布前，在 GitHub 仓库的 Settings → Secrets → Actions 添加：

- `TAURI_SIGNING_PRIVATE_KEY`：`~/.tauri/motrix-tauri.key` 的**文件内容**
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：留空（生成时未设密码）

之后打 tag 即可触发 `.github/workflows/release.yml` 构建四个平台并生成
`latest.json`：

```bash
npm version patch && git push --follow-tags
```

工作流产出的是**草稿** release，确认无误后手动发布。更新端点为
`https://github.com/dogeow/motrix-tauri/releases/latest/download/latest.json`
——注意仓库目前是 private，**私有仓库的 release 资源需要鉴权，更新会 404**，
发布前需要把仓库改成 public，或把端点换成自己的托管地址。

## 尚未实现

- 批量重命名、下载完成后自动执行脚本
