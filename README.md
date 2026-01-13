<p align="center">
  <img src="public/icon.svg" alt="Codex Desktop Logo" width="120" height="120">
</p>

<h1 align="center">Codex Desktop</h1>

<p align="center">
  <strong>A powerful AI-powered code assistant desktop application</strong><br>
  <strong>强大的 AI 驱动代码助手桌面应用</strong>
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT">
  </a>
  <a href="https://react.dev/">
    <img src="https://img.shields.io/badge/React-19.2-61DAFB.svg?logo=react&logoColor=white" alt="React 19.2">
  </a>
  <a href="https://www.typescriptlang.org/">
    <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6.svg?logo=typescript&logoColor=white" alt="TypeScript 5.9">
  </a>
  <a href="https://tauri.app/">
    <img src="https://img.shields.io/badge/Tauri-2.0-FFC131.svg?logo=tauri&logoColor=white" alt="Tauri 2.0">
  </a>
  <a href="https://vite.dev/">
    <img src="https://img.shields.io/badge/Vite-7.2-646CFF.svg?logo=vite&logoColor=white" alt="Vite 7.2">
  </a>
</p>

<p align="center">
  <a href="#english">English</a> | <a href="#中文">中文</a>
</p>

---

<a name="english"></a>

# English

## Overview

**Codex Desktop** is a modern, cross-platform desktop application that brings AI-powered code assistance directly to your development workflow. Built with cutting-edge technologies including React 19, TypeScript 5.9, and Tauri 2, it provides a seamless experience for interacting with AI models to enhance your coding productivity.

## Features

### Core Capabilities

- **🤖 AI-Powered Assistance** — Intelligent code suggestions, explanations, and project management powered by advanced AI models
- **💬 Multi-Session Support** — Manage multiple AI conversation threads simultaneously with automatic state persistence
- **⚡ Real-time Streaming** — Stream AI responses with efficient delta buffering for smooth, responsive interactions
- **📁 Native File Integration** — Direct file system access through Tauri for seamless code editing and project navigation

### Advanced Features

- **🔄 Undo/Redo System** — Full undo/redo support with up to 20 checkpoint rollbacks for conversation history
- **📝 Slash Commands** — Extensible command system (`/help`, `/status`, `/clear`, etc.) for quick actions
- **🔒 Security Approval** — Built-in approval system for file modifications and command executions
- **🎨 Theme Support** — Light and dark mode with customizable UI themes
- **⌨️ Keyboard Shortcuts** — Comprehensive keyboard navigation for power users
- **📊 MCP Integration** — Model Context Protocol support for extended tool capabilities

### Performance Optimizations

- **🗃️ LRU Cache** — Efficient memory management with automatic eviction (500 active threads max)
- **📜 Virtual Scrolling** — Smooth scrolling for large conversation histories using React Window
- **🔀 Code Splitting** — Automatic chunk splitting for optimal load times
- **⚙️ Optimistic Updates** — Instant UI feedback with automatic rollback on API failures

## Installation

### Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | ≥ 22.0 | LTS recommended |
| npm / pnpm | Latest | Package manager |
| Rust | Edition 2021 | For Tauri development |

### Quick Start

```bash
# Clone the repository
git clone https://github.com/Colinchen-333/codex-desktop.git
cd codex-desktop

# Install dependencies
npm install

# Start development server (web only)
npm run dev

# Or start with Tauri (full desktop app)
npm run tauri:dev
```

### Platform-Specific Setup

<details>
<summary><strong>macOS</strong></summary>

```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Restart terminal, then verify
rustc --version
```
</details>

<details>
<summary><strong>Windows</strong></summary>

1. Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
2. Install [Rust](https://www.rust-lang.org/tools/install)
3. Restart terminal and verify: `rustc --version`
</details>

<details>
<summary><strong>Linux (Ubuntu/Debian)</strong></summary>

```bash
# Install system dependencies
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```
</details>

## Development

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite development server (localhost:5173) |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint checks |
| `npm run tauri:dev` | Start Tauri development mode |
| `npm run tauri:build` | Build native desktop application |

### Testing Scripts

| Script | Description |
|--------|-------------|
| `npm run test:unit` | Run unit tests with Vitest |
| `npm run test:unit:watch` | Run unit tests in watch mode |
| `npm run test:unit:coverage` | Generate coverage report |
| `npm run test` | Run E2E tests with Playwright |
| `npm run test:ui` | Run E2E tests with UI |
| `npm run test:all` | Run all tests (unit + E2E) |

### Build Output

After running `npm run tauri:build`, find the packaged application in:

```
src-tauri/target/release/bundle/
├── macos/          # macOS .app and .dmg
├── deb/            # Linux .deb package
├── rpm/            # Linux .rpm package
└── msi/            # Windows installer
```

## Architecture

### Tech Stack

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
├─────────────────────────────────────────────────────────────┤
│  React 19.2      │  TypeScript 5.9  │  Tailwind CSS 3.4    │
│  Zustand 5.0     │  React Window    │  Lucide Icons        │
├─────────────────────────────────────────────────────────────┤
│                     Build & Tools                            │
├─────────────────────────────────────────────────────────────┤
│  Vite 7.2        │  Vitest 3.2      │  Playwright 1.57     │
│  ESLint 9        │  PostCSS         │  Autoprefixer        │
├─────────────────────────────────────────────────────────────┤
│                        Backend                               │
├─────────────────────────────────────────────────────────────┤
│  Tauri 2.0       │  Rust (2021)     │  SQLite              │
│  Tokio           │  Serde           │  Parking Lot         │
└─────────────────────────────────────────────────────────────┘
```

### Project Structure

```
codex-desktop/
├── src/                          # Frontend source code
│   ├── components/               # React components
│   │   ├── chat/                # Chat interface (20+ components)
│   │   ├── layout/              # App layout (Sidebar, MainArea)
│   │   ├── dialogs/             # Modal dialogs
│   │   ├── settings/            # Settings panels
│   │   ├── sessions/            # Session management
│   │   ├── ui/                  # Base UI components
│   │   └── onboarding/          # First-run experience
│   ├── stores/                  # Zustand state management
│   │   ├── thread/              # Thread store with LRU cache
│   │   ├── sessions.ts          # Session management
│   │   ├── projects.ts          # Project management
│   │   └── ...                  # Other stores (12 total)
│   ├── lib/                     # Utility libraries
│   │   ├── api.ts               # API client with timeout
│   │   ├── apiCache.ts          # Request caching
│   │   ├── eventBus.ts          # Cross-component events
│   │   └── types/               # TypeScript definitions
│   ├── hooks/                   # Custom React hooks (16)
│   ├── constants/               # App constants
│   └── test/                    # Test utilities
├── src-tauri/                   # Rust backend
│   ├── src/
│   │   ├── commands/            # Tauri IPC commands
│   │   ├── database/            # SQLite data layer
│   │   └── app_server/          # External server communication
│   ├── Cargo.toml               # Rust dependencies
│   └── tauri.conf.json          # Tauri configuration
├── e2e/                         # End-to-end tests
└── public/                      # Static assets
```

### State Management

The application uses **Zustand** for state management with the following stores:

| Store | Purpose |
|-------|---------|
| `thread` | Active conversation threads with LRU cache |
| `sessions` | Session list with optimistic updates |
| `projects` | Project management and selection |
| `settings` | User preferences and configuration |
| `account` | Authentication and user info |
| `models` | Available AI models |
| `undoRedo` | Undo/redo history stack |
| `commandHistory` | Shell command history |

### Key Design Patterns

- **Delta Buffering** — Efficiently batch streaming AI responses
- **Optimistic Updates** — Instant UI feedback with automatic rollback
- **LRU Cache** — Memory-bounded thread storage (max 500)
- **Event Bus** — Decoupled cross-component communication
- **Error Boundaries** — Graceful error handling at component level

## Testing

### Unit Tests (Vitest)

```bash
# Run tests
npm run test:unit

# Watch mode
npm run test:unit:watch

# Coverage report
npm run test:unit:coverage
```

**Coverage Target:** 60% (lines, functions, branches, statements)

### E2E Tests (Playwright)

```bash
# Run headless
npm run test

# Run with UI
npm run test:ui

# Run headed (visible browser)
npm run test:headed
```

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
# API Configuration
VITE_API_URL=https://api.example.com
VITE_WS_URL=wss://ws.example.com

# Feature Flags
VITE_ENABLE_DEBUG=false
```

### TypeScript

The project uses strict TypeScript configuration:

- **Target:** ES2022
- **Strict Mode:** Enabled
- **Path Aliases:** `@/*` → `src/*`

## Security

### Application Security

- ✅ **Input Validation** — All user inputs validated before processing
- ✅ **Type Safety** — Strict TypeScript prevents runtime errors
- ✅ **Command Approval** — File changes require explicit user consent
- ✅ **Error Boundaries** — Graceful handling of sync/async errors

### Tauri Security

- ✅ **Permission System** — Limited file system access
- ✅ **IPC Type Safety** — Strongly typed command interface
- ✅ **CSP Configuration** — Content Security Policy enforced
- ✅ **Plugin Isolation** — Restricted shell/dialog/fs plugins

### Data Security

- ✅ **Local Storage** — All data stored locally (SQLite)
- ✅ **No Telemetry** — No data sent without user action
- ✅ **Secure Communication** — HTTPS/WSS for all external requests

## Contributing

We welcome contributions! Please follow these steps:

1. **Fork** the repository
2. **Clone** your fork locally
3. **Create** a feature branch: `git checkout -b feature/amazing-feature`
4. **Make** your changes
5. **Test** your changes: `npm run test:all`
6. **Lint** your code: `npm run lint`
7. **Commit** with a descriptive message
8. **Push** to your fork
9. **Open** a Pull Request

### Commit Convention

```
type(scope): description

feat(chat): add message editing support
fix(sessions): resolve race condition in session switching
docs(readme): update installation instructions
```

## Troubleshooting

<details>
<summary><strong>Build fails with Node.js error</strong></summary>

Ensure you have Node.js 22 or higher:
```bash
node --version  # Should be >= 22.0.0
```
</details>

<details>
<summary><strong>Tauri build fails on Linux</strong></summary>

Install required system dependencies:
```bash
sudo apt install libwebkit2gtk-4.1-dev libssl-dev
```
</details>

<details>
<summary><strong>Tests fail intermittently</strong></summary>

Try clearing the cache and reinstalling:
```bash
rm -rf node_modules
npm install
npm run test:all
```
</details>

### Debug Mode

Enable detailed logging:

```bash
# Development
DEBUG=codex:* npm run dev

# Tauri
RUST_LOG=debug npm run tauri:dev
```

## Roadmap

- [ ] Plugin system for custom extensions
- [ ] Collaborative sessions (multi-user)
- [ ] Voice input support
- [ ] Custom AI model integration
- [ ] Mobile companion app

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

## Acknowledgments

Built with these amazing open-source projects:

- [React](https://react.dev/) — UI framework
- [Tauri](https://tauri.app/) — Desktop application framework
- [Vite](https://vite.dev/) — Build tool
- [Zustand](https://zustand.docs.pmnd.rs/) — State management
- [Tailwind CSS](https://tailwindcss.com/) — Styling
- [Playwright](https://playwright.dev/) — E2E testing
- [Vitest](https://vitest.dev/) — Unit testing

---

<a name="中文"></a>

# 中文

## 概述

**Codex Desktop** 是一款现代化的跨平台桌面应用程序，将 AI 驱动的代码辅助功能直接带入您的开发工作流程。采用 React 19、TypeScript 5.9 和 Tauri 2 等前沿技术构建，为您提供与 AI 模型交互的无缝体验，提升编码效率。

## 功能特性

### 核心功能

- **🤖 AI 智能辅助** — 由先进 AI 模型驱动的智能代码建议、解释和项目管理
- **💬 多会话支持** — 同时管理多个 AI 对话线程，自动保存状态
- **⚡ 实时流式响应** — 高效的增量缓冲处理，实现流畅的 AI 响应流式传输
- **📁 原生文件集成** — 通过 Tauri 直接访问文件系统，无缝编辑代码和导航项目

### 高级特性

- **🔄 撤销/重做系统** — 完整的撤销/重做支持，最多支持 20 个对话历史检查点回滚
- **📝 斜杠命令** — 可扩展的命令系统（`/help`、`/status`、`/clear` 等）用于快速操作
- **🔒 安全审批** — 内置的文件修改和命令执行审批系统
- **🎨 主题支持** — 亮色和暗色模式，可自定义 UI 主题
- **⌨️ 键盘快捷键** — 为高级用户提供全面的键盘导航
- **📊 MCP 集成** — Model Context Protocol 支持，扩展工具能力

### 性能优化

- **🗃️ LRU 缓存** — 高效的内存管理，自动淘汰机制（最多 500 个活动线程）
- **📜 虚拟滚动** — 使用 React Window 实现大量对话历史的流畅滚动
- **🔀 代码分割** — 自动分块分割，优化加载时间
- **⚙️ 乐观更新** — 即时 UI 反馈，API 失败时自动回滚

## 安装指南

### 环境要求

| 要求 | 版本 | 说明 |
|------|------|------|
| Node.js | ≥ 22.0 | 推荐使用 LTS 版本 |
| npm / pnpm | 最新版 | 包管理器 |
| Rust | Edition 2021 | 用于 Tauri 开发 |

### 快速开始

```bash
# 克隆仓库
git clone https://github.com/Colinchen-333/codex-desktop.git
cd codex-desktop

# 安装依赖
npm install

# 启动开发服务器（仅 Web）
npm run dev

# 或启动 Tauri 模式（完整桌面应用）
npm run tauri:dev
```

### 平台特定设置

<details>
<summary><strong>macOS</strong></summary>

```bash
# 安装 Xcode 命令行工具
xcode-select --install

# 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 重启终端后验证
rustc --version
```
</details>

<details>
<summary><strong>Windows</strong></summary>

1. 安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
2. 安装 [Rust](https://www.rust-lang.org/tools/install)
3. 重启终端并验证：`rustc --version`
</details>

<details>
<summary><strong>Linux (Ubuntu/Debian)</strong></summary>

```bash
# 安装系统依赖
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev

# 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```
</details>

## 开发指南

### 可用脚本

| 脚本 | 说明 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器 (localhost:5173) |
| `npm run build` | 构建生产版本 |
| `npm run preview` | 预览生产构建 |
| `npm run lint` | 运行 ESLint 检查 |
| `npm run tauri:dev` | 启动 Tauri 开发模式 |
| `npm run tauri:build` | 构建原生桌面应用 |

### 测试脚本

| 脚本 | 说明 |
|------|------|
| `npm run test:unit` | 使用 Vitest 运行单元测试 |
| `npm run test:unit:watch` | 监听模式运行单元测试 |
| `npm run test:unit:coverage` | 生成覆盖率报告 |
| `npm run test` | 使用 Playwright 运行 E2E 测试 |
| `npm run test:ui` | 带 UI 运行 E2E 测试 |
| `npm run test:all` | 运行所有测试（单元 + E2E） |

### 构建输出

运行 `npm run tauri:build` 后，在以下位置找到打包的应用：

```
src-tauri/target/release/bundle/
├── macos/          # macOS .app 和 .dmg
├── deb/            # Linux .deb 包
├── rpm/            # Linux .rpm 包
└── msi/            # Windows 安装程序
```

## 架构设计

### 技术栈

```
┌─────────────────────────────────────────────────────────────┐
│                         前端                                 │
├─────────────────────────────────────────────────────────────┤
│  React 19.2      │  TypeScript 5.9  │  Tailwind CSS 3.4    │
│  Zustand 5.0     │  React Window    │  Lucide Icons        │
├─────────────────────────────────────────────────────────────┤
│                      构建工具                                │
├─────────────────────────────────────────────────────────────┤
│  Vite 7.2        │  Vitest 3.2      │  Playwright 1.57     │
│  ESLint 9        │  PostCSS         │  Autoprefixer        │
├─────────────────────────────────────────────────────────────┤
│                         后端                                 │
├─────────────────────────────────────────────────────────────┤
│  Tauri 2.0       │  Rust (2021)     │  SQLite              │
│  Tokio           │  Serde           │  Parking Lot         │
└─────────────────────────────────────────────────────────────┘
```

### 项目结构

```
codex-desktop/
├── src/                          # 前端源代码
│   ├── components/               # React 组件
│   │   ├── chat/                # 聊天界面（20+ 组件）
│   │   ├── layout/              # 应用布局（Sidebar, MainArea）
│   │   ├── dialogs/             # 模态对话框
│   │   ├── settings/            # 设置面板
│   │   ├── sessions/            # 会话管理
│   │   ├── ui/                  # 基础 UI 组件
│   │   └── onboarding/          # 首次运行体验
│   ├── stores/                  # Zustand 状态管理
│   │   ├── thread/              # 带 LRU 缓存的线程存储
│   │   ├── sessions.ts          # 会话管理
│   │   ├── projects.ts          # 项目管理
│   │   └── ...                  # 其他存储（共 12 个）
│   ├── lib/                     # 工具库
│   │   ├── api.ts               # 带超时的 API 客户端
│   │   ├── apiCache.ts          # 请求缓存
│   │   ├── eventBus.ts          # 跨组件事件
│   │   └── types/               # TypeScript 类型定义
│   ├── hooks/                   # 自定义 React Hooks（16 个）
│   ├── constants/               # 应用常量
│   └── test/                    # 测试工具
├── src-tauri/                   # Rust 后端
│   ├── src/
│   │   ├── commands/            # Tauri IPC 命令
│   │   ├── database/            # SQLite 数据层
│   │   └── app_server/          # 外部服务器通信
│   ├── Cargo.toml               # Rust 依赖
│   └── tauri.conf.json          # Tauri 配置
├── e2e/                         # 端到端测试
└── public/                      # 静态资源
```

### 状态管理

应用使用 **Zustand** 进行状态管理，包含以下存储：

| 存储 | 用途 |
|------|------|
| `thread` | 带 LRU 缓存的活动对话线程 |
| `sessions` | 带乐观更新的会话列表 |
| `projects` | 项目管理和选择 |
| `settings` | 用户偏好和配置 |
| `account` | 认证和用户信息 |
| `models` | 可用的 AI 模型 |
| `undoRedo` | 撤销/重做历史栈 |
| `commandHistory` | Shell 命令历史 |

### 核心设计模式

- **增量缓冲** — 高效批处理流式 AI 响应
- **乐观更新** — 即时 UI 反馈，自动回滚
- **LRU 缓存** — 内存受限的线程存储（最大 500）
- **事件总线** — 解耦的跨组件通信
- **错误边界** — 组件级优雅错误处理

## 测试

### 单元测试 (Vitest)

```bash
# 运行测试
npm run test:unit

# 监听模式
npm run test:unit:watch

# 覆盖率报告
npm run test:unit:coverage
```

**覆盖率目标：** 60%（行、函数、分支、语句）

### E2E 测试 (Playwright)

```bash
# 无头运行
npm run test

# 带 UI 运行
npm run test:ui

# 有界面运行（可见浏览器）
npm run test:headed
```

## 配置

### 环境变量

在项目根目录创建 `.env` 文件：

```env
# API 配置
VITE_API_URL=https://api.example.com
VITE_WS_URL=wss://ws.example.com

# 功能开关
VITE_ENABLE_DEBUG=false
```

### TypeScript

项目使用严格的 TypeScript 配置：

- **目标：** ES2022
- **严格模式：** 已启用
- **路径别名：** `@/*` → `src/*`

## 安全性

### 应用安全

- ✅ **输入验证** — 所有用户输入在处理前进行验证
- ✅ **类型安全** — 严格的 TypeScript 防止运行时错误
- ✅ **命令审批** — 文件更改需要明确的用户同意
- ✅ **错误边界** — 同步/异步错误的优雅处理

### Tauri 安全

- ✅ **权限系统** — 受限的文件系统访问
- ✅ **IPC 类型安全** — 强类型命令接口
- ✅ **CSP 配置** — 内容安全策略已启用
- ✅ **插件隔离** — 受限的 shell/dialog/fs 插件

### 数据安全

- ✅ **本地存储** — 所有数据本地存储（SQLite）
- ✅ **无遥测** — 未经用户操作不发送数据
- ✅ **安全通信** — 所有外部请求使用 HTTPS/WSS

## 贡献指南

我们欢迎贡献！请按以下步骤操作：

1. **Fork** 仓库
2. **Clone** 你的 fork 到本地
3. **创建** 功能分支：`git checkout -b feature/amazing-feature`
4. **进行** 更改
5. **测试** 你的更改：`npm run test:all`
6. **检查** 代码风格：`npm run lint`
7. **提交** 带描述性消息的 commit
8. **Push** 到你的 fork
9. **创建** Pull Request

### 提交规范

```
类型(范围): 描述

feat(chat): 添加消息编辑支持
fix(sessions): 修复会话切换竞态条件
docs(readme): 更新安装说明
```

## 故障排除

<details>
<summary><strong>构建失败，Node.js 错误</strong></summary>

确保你使用 Node.js 22 或更高版本：
```bash
node --version  # 应该 >= 22.0.0
```
</details>

<details>
<summary><strong>Linux 上 Tauri 构建失败</strong></summary>

安装所需的系统依赖：
```bash
sudo apt install libwebkit2gtk-4.1-dev libssl-dev
```
</details>

<details>
<summary><strong>测试间歇性失败</strong></summary>

尝试清除缓存并重新安装：
```bash
rm -rf node_modules
npm install
npm run test:all
```
</details>

### 调试模式

启用详细日志：

```bash
# 开发
DEBUG=codex:* npm run dev

# Tauri
RUST_LOG=debug npm run tauri:dev
```

## 路线图

- [ ] 自定义扩展插件系统
- [ ] 协作会话（多用户）
- [ ] 语音输入支持
- [ ] 自定义 AI 模型集成
- [ ] 移动端伴侣应用

## 许可证

本项目采用 **MIT 许可证** — 详见 [LICENSE](LICENSE) 文件。

## 致谢

基于以下优秀开源项目构建：

- [React](https://react.dev/) — UI 框架
- [Tauri](https://tauri.app/) — 桌面应用框架
- [Vite](https://vite.dev/) — 构建工具
- [Zustand](https://zustand.docs.pmnd.rs/) — 状态管理
- [Tailwind CSS](https://tailwindcss.com/) — 样式
- [Playwright](https://playwright.dev/) — E2E 测试
- [Vitest](https://vitest.dev/) — 单元测试

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/Colinchen-333">Colin Chen</a> / Lumirain Studio<br>
  用 ❤️ 制作 by <a href="https://github.com/Colinchen-333">Colin Chen</a> / 光雨工作室
</p>

<p align="center">
  <a href="https://github.com/Colinchen-333/codex-desktop/issues">Report Bug / 报告问题</a> •
  <a href="https://github.com/Colinchen-333/codex-desktop/issues">Request Feature / 功能请求</a>
</p>
