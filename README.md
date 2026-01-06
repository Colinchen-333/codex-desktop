# Codex Desktop

> 把 Codex CLI 变成一个漂亮、可控、安全、项目态的桌面工作台

## 项目结构

```
codex-desktop/
├── codex/           # Codex CLI 原版引擎（子模块）
├── codex-desktop/   # Tauri + React 桌面应用（子模块）
├── PRD.md           # 产品需求文档
├── AGENTS.md        # Agent 使用指南
├── GEMINI.md        # 项目上下文
└── README.md        # 本文件
```

## 快速开始

### 1. 克隆仓库

```bash
git clone --recurse-submodules https://github.com/Colinchen-333/codex-desktop.git
cd codex-desktop
```

如果已克隆但子模块未初始化：

```bash
git submodule update --init --recursive
```

### 2. 运行 Desktop 应用

```bash
cd codex-desktop
npm install
npm run tauri:dev
```

### 3. 安装 Codex CLI（如未安装）

```bash
npm install -g @anthropic-ai/claude-code
# 或使用 Cargo 安装
cargo install codex-cli
```

## 功能特性

| 功能 | 状态 | 说明 |
|------|------|------|
| 实时消息流 | ✅ | 20 FPS 流式输出，首字符立即显示 |
| 状态栏 | ✅ | 引擎状态、令牌速率、上下文窗口进度 |
| 命令安全控制 | ✅ | 4 层批准机制 |
| 变更控制 | ✅ | Diff 预览 + 快照回滚 |
| 心跳检测 | ✅ | 15s 间隔，自动重连 |
| 诊断中心 | ✅ | 网络/代理/速率限制监控 |
| 危险命令检测 | ✅ | 二次确认高危操作 |

## 开发

详细开发指南请参阅：
- [PRD.md](./PRD.md) - 产品需求文档
- [codex-desktop/](./codex-desktop/) - 主应用代码

## 许可证

MIT
