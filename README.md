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

## 尚未实现

- **自动更新**：需要先用 `npm run tauri signer generate` 生成 minisign 密钥对，
  并准备好托管 `latest.json` 的地址，之后才能接 `tauri-plugin-updater`
- **国际化**：界面目前是硬编码中文，没有引入 i18n 框架
- 批量重命名、下载完成后自动执行脚本
