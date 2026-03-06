# GoClaw 开发与部署文档

> **版本：** dev（由 Git Tag 决定）  
> **协议版本：** WebSocket Protocol v3  
> **最后更新：** 2026-02-27

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术栈](#2-技术栈)
3. [目录结构](#3-目录结构)
4. [本地开发环境搭建](#4-本地开发环境搭建)
5. [环境变量参考](#5-环境变量参考)
6. [配置文件详解](#6-配置文件详解)
7. [CLI 命令参考](#7-cli-命令参考)
8. [运行模式](#8-运行模式)
9. [数据库与迁移](#9-数据库与迁移)
10. [前端 Web 控制台](#10-前端-web-控制台)
11. [Docker 部署](#11-docker-部署)
12. [部署方案对比](#12-部署方案对比)
13. [HTTP API 参考](#13-http-api-参考)
14. [WebSocket 协议](#14-websocket-协议)
15. [LLM 提供商配置](#15-llm-提供商配置)
16. [消息频道配置](#16-消息频道配置)
17. [安全机制](#17-安全机制)
18. [可观测性（OTel）](#18-可观测性otel)
19. [Tailscale 集成](#19-tailscale-集成)
20. [Docker 沙箱（代码执行）](#20-docker-沙箱代码执行)
21. [生产部署建议](#21-生产部署建议)
22. [故障排查](#22-故障排查)

---

## 1. 项目概述

GoClaw 是一个高性能的 AI Agent 网关，基于 Go 实现，支持：

- **WebSocket RPC 协议**（v3）：全双工双向通信，流式 token 输出
- **HTTP API**：OpenAI 兼容接口 + 管理 API
- **多 Agent 架构**：支持 Agent 编排、子 Agent 生成、Agent 团队
- **多消息频道**：Telegram、飞书/Lark、Zalo、Discord、WhatsApp
- **两种运行模式**：
  - **Standalone（单机）**：文件/SQLite 存储，零依赖，适合个人使用
  - **Managed（托管）**：PostgreSQL 多租户，适合团队/生产环境
- **工具系统**：内置文件系统、代码执行、浏览器自动化、网络搜索、记忆系统等 20+ 工具
- **MCP 支持**：Model Context Protocol 外部工具服务器
- **Web 控制台**：React SPA 管理面板，支持中英文切换

---

## 2. 技术栈

### 后端

| 组件 | 版本 / 说明 |
|------|------------|
| 语言 | Go 1.25.5 |
| CLI 框架 | Cobra v1.10 |
| WebSocket | gorilla/websocket v1.5 |
| 数据库驱动 | pgx/v5 v5.6（PostgreSQL）+ modernc.org/sqlite v1.45（SQLite） |
| 数据库迁移 | golang-migrate v4.19 |
| 浏览器自动化 | go-rod/rod v0.116（Chrome DevTools Protocol） |
| Telegram | mymmrac/telego v1.6 |
| 配置文件格式 | JSON5（titanous/json5） |
| 加密 | AES-256-GCM（标准库 crypto/aes） |
| 限流 | golang.org/x/time/rate |
| OTel | go.opentelemetry.io/otel v1.40 |
| Tailscale | tailscale.com v1.94（tsnet，构建标签开关） |
| 日志 | 标准库 `log/slog` |

### 前端

| 组件 | 版本 / 说明 |
|------|------------|
| 框架 | React 19 |
| 构建工具 | Vite 6 |
| 语言 | TypeScript |
| CSS | Tailwind CSS 4 |
| UI 组件 | Radix UI |
| 状态管理 | Zustand |
| 路由 | React Router 7 |
| 包管理 | pnpm |
| 国际化 | i18next + react-i18next（中英文） |
| 生产 Web 服务器 | Nginx 1.27 |

---

## 3. 目录结构

```
goclaw/
├── main.go                      # 程序入口
├── cmd/                         # CLI 命令（Cobra）
│   ├── root.go                  # 根命令 + 命令注册
│   ├── gateway.go               # 网关启动逻辑
│   ├── onboard.go               # 交互式配置向导
│   ├── onboard_auto.go          # 自动 onboard（环境变量检测）
│   ├── migrate.go               # 数据库迁移命令
│   ├── upgrade.go               # 托管模式升级
│   ├── agent.go                 # agent 子命令
│   ├── pairing.go               # 配对命令
│   ├── doctor.go                # 系统自检
│   └── ...                      # 其他子命令
├── internal/
│   ├── gateway/                 # WebSocket + HTTP 服务器、客户端、方法路由
│   │   └── methods/             # RPC 处理器（chat, agents, sessions, config, skills, cron, pairing）
│   ├── agent/                   # Agent 循环（think→act→observe）、路由、输入守卫
│   ├── providers/               # LLM 提供商：Anthropic（原生 HTTP+SSE）、OpenAI 兼容
│   ├── tools/                   # 工具注册表、文件系统、exec、web、记忆、子 agent、MCP 桥接
│   ├── store/                   # Store 接口 + pg/（PostgreSQL）+ file/（Standalone）实现
│   ├── bootstrap/               # 系统提示文件（SOUL.md, IDENTITY.md 等）+ 种子数据 + 用户 seed
│   ├── config/                  # 配置加载（JSON5）+ 环境变量覆盖
│   ├── channels/                # 频道管理器：Telegram, 飞书/Lark, Zalo, Discord, WhatsApp
│   ├── http/                    # HTTP API（/v1/chat/completions, /v1/agents, /v1/skills 等）
│   ├── skills/                  # SKILL.md 加载器 + BM25 搜索
│   ├── memory/                  # 记忆系统（SQLite FTS5 / pgvector）
│   ├── tracing/                 # LLM 调用追踪 + 可选 OTel 导出（构建标签控制）
│   ├── scheduler/               # 基于 lane 的并发调度（main/subagent/cron）
│   ├── cron/                    # 定时任务调度（at/every/cron expr）
│   ├── permissions/             # RBAC（admin/operator/viewer）
│   ├── pairing/                 # 浏览器配对（8 位码）
│   ├── crypto/                  # API Key AES-256-GCM 加密
│   ├── sandbox/                 # Docker 代码沙箱
│   ├── tts/                     # 文字转语音（OpenAI, ElevenLabs, Edge, MiniMax）
│   └── ...
├── pkg/
│   ├── protocol/                # 帧类型（frames, methods, errors, events）
│   └── browser/                 # 浏览器自动化（Rod + CDP）
├── migrations/                  # PostgreSQL 迁移 SQL 文件
│   ├── 000001_init_schema.up.sql
│   ├── 000002_agent_links.up.sql
│   ├── 000003_agent_teams.up.sql
│   ├── 000004_teams_v2.up.sql
│   ├── 000005_phase4.up.sql
│   └── 000006_builtin_tools.up.sql
├── ui/
│   └── web/                     # React SPA 控制台
│       ├── src/
│       │   ├── pages/           # 页面组件（按功能模块组织）
│       │   ├── components/      # 共享组件（layout, shared, chat, ui）
│       │   ├── hooks/           # 自定义 Hooks
│       │   ├── stores/          # Zustand Store
│       │   ├── i18n/            # 国际化（en.json, zh.json）
│       │   ├── api/             # 协议常量
│       │   ├── lib/             # 工具函数
│       │   └── types/           # TypeScript 类型定义
│       ├── vite.config.ts
│       ├── nginx.conf           # 生产环境 Nginx 配置
│       └── Dockerfile           # 前端镜像（Node 22 build + Nginx serve）
├── Dockerfile                   # 后端镜像（Go 1.25 build + Alpine runtime）
├── docker-entrypoint.sh         # 容器启动入口脚本
├── docker-compose.yml           # 基础服务定义
├── docker-compose.standalone.yml  # Standalone 模式覆盖
├── docker-compose.managed.yml     # Managed 模式覆盖（含 PostgreSQL）
├── docker-compose.selfservice.yml # Web 控制台覆盖
├── docker-compose.otel.yml        # OTel + Jaeger 覆盖
├── docker-compose.tailscale.yml   # Tailscale 覆盖
├── docker-compose.sandbox.yml     # Docker 沙箱覆盖
├── prepare-env.sh               # 环境变量初始化脚本
├── Makefile                     # 构建快捷命令
├── config.json                  # 运行时配置（非 secret）
├── .env.example                 # 环境变量模板
├── go.mod                       # Go 依赖
├── api-reference.md             # HTTP API 参考
└── websocket-protocol.md        # WebSocket 协议参考
```

---

## 4. 本地开发环境搭建

### 4.1 前置依赖

| 工具 | 最低版本 | 说明 |
|------|---------|------|
| Go | 1.25.5 | 后端编译运行 |
| Node.js | 22+ | 前端开发 |
| pnpm | 10+ | 前端包管理（推荐使用 corepack） |
| Git | 任意 | 版本控制 |
| PostgreSQL | 15+（含 pgvector） | 仅 Managed 模式必需 |
| Docker | 24+ | 容器化部署 |
| Chrome/Chromium | 任意 | 浏览器工具（可选，自动下载） |

> **注意（macOS Homebrew 用户）：** 若 Go 通过 Homebrew 安装，`GOROOT` 可能需要指向 `libexec` 子目录。验证方法：
> ```bash
> ls "$(go env GOROOT)/src/archive/tar" || echo "GOROOT incorrect"
> # 修复：export GOROOT=$(brew --prefix go)/libexec
> ```

### 4.2 克隆并初始化

```bash
git clone <repo-url> goclaw
cd goclaw

# 初始化环境变量（自动生成 GOCLAW_GATEWAY_TOKEN 和 GOCLAW_ENCRYPTION_KEY）
./prepare-env.sh

# 编辑 .env，填入至少一个 LLM 提供商 API Key
vim .env
```

### 4.3 启动后端（Standalone 模式）

```bash
# 方式 1：使用 Makefile（推荐）
make build && source .env && ./goclaw

# 方式 2：交互式配置向导（首次使用）
go build -o goclaw . && ./goclaw onboard
source .env.local && ./goclaw

# 方式 3：直接运行（已有 config.json + .env）
source .env && go run . 
```

启动成功后，网关监听 `0.0.0.0:18790`，日志输出类似：

```
time=... level=INFO msg="goclaw gateway starting" version=dev protocol=3 mode=standalone agents=[default]
time=... level=INFO msg="gateway starting" addr=0.0.0.0:18790
```

### 4.4 启动前端开发服务器

```bash
cd ui/web
pnpm install
pnpm dev
# 访问 http://localhost:5173
```

前端开发服务器会将以下路径代理到后端：

| 路径 | 代理目标 | 说明 |
|------|---------|------|
| `/ws` | `http://localhost:9600` | WebSocket 连接（注意：vite.config.ts 默认代理到 9600，需与后端端口一致） |
| `/v1/*` | `http://localhost:9600` | HTTP API |
| `/health` | `http://localhost:9600` | 健康检查 |

> **代理端口说明：** `vite.config.ts` 默认读取 `VITE_BACKEND_PORT`（默认 `9600`）。若后端运行在 `18790`，需设置：
> ```bash
> echo "VITE_BACKEND_PORT=18790" > ui/web/.env.local
> ```

### 4.5 登录控制台

1. 打开 `http://localhost:5173`
2. 登录方式选择 **Token**
3. 填入：
   - **User ID**：任意字符串（如 `admin`）
   - **Gateway Token**：`.env` 或 `.env.local` 中的 `GOCLAW_GATEWAY_TOKEN` 值
4. 点击连接

---

## 5. 环境变量参考

所有环境变量均可通过 `.env` 文件设置（Docker Compose），或通过 `.env.local` 设置（本地开发，需 `source` 加载）。

### 5.1 必要变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `GOCLAW_GATEWAY_TOKEN` | WebSocket 认证 Token（admin 角色），32 位十六进制 | `418a3ee4...` |
| `GOCLAW_ENCRYPTION_KEY` | API Key 加密密钥（AES-256-GCM），64 位十六进制 | `d795575b...` |

以上两个变量可通过 `./prepare-env.sh` 自动生成。

### 5.2 LLM 提供商（至少填一个）

| 变量 | 对应提供商 |
|------|-----------|
| `GOCLAW_OPENROUTER_API_KEY` | OpenRouter（推荐，可访问多种模型） |
| `GOCLAW_ANTHROPIC_API_KEY` | Anthropic Claude |
| `GOCLAW_OPENAI_API_KEY` | OpenAI GPT |
| `GOCLAW_GROQ_API_KEY` | Groq（高速推理） |
| `GOCLAW_DEEPSEEK_API_KEY` | DeepSeek |
| `GOCLAW_GEMINI_API_KEY` | Google Gemini |
| `GOCLAW_MISTRAL_API_KEY` | Mistral AI |
| `GOCLAW_XAI_API_KEY` | xAI Grok |
| `GOCLAW_MINIMAX_API_KEY` | MiniMax |
| `GOCLAW_COHERE_API_KEY` | Cohere |
| `GOCLAW_PERPLEXITY_API_KEY` | Perplexity |

### 5.3 网关配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `GOCLAW_HOST` | `0.0.0.0` | 监听地址 |
| `GOCLAW_PORT` | `18790` | 监听端口 |
| `GOCLAW_CONFIG` | `config.json` | 配置文件路径 |
| `GOCLAW_MODE` | `standalone` | 运行模式（`standalone` \| `managed`） |
| `GOCLAW_OWNER_IDS` | — | 所有者 User ID 列表（逗号分隔），具有 admin 权限 |

### 5.4 数据目录（Standalone 模式）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `GOCLAW_WORKSPACE` | `~/.goclaw/workspace` | Agent 工作目录（文件操作沙箱） |
| `GOCLAW_DATA_DIR` | `~/.goclaw/data` | 数据库文件目录 |
| `GOCLAW_SESSIONS_STORAGE` | `~/.goclaw/sessions` | 会话文件目录 |
| `GOCLAW_SKILLS_DIR` | `~/.goclaw/skills` | 技能文件目录 |
| `GOCLAW_MIGRATIONS_DIR` | `./migrations` | 数据库迁移文件目录 |

### 5.5 数据库（Managed 模式）

| 变量 | 说明 |
|------|------|
| `GOCLAW_POSTGRES_DSN` | PostgreSQL 连接字符串，如 `postgres://user:pass@host:5432/goclaw?sslmode=disable` |

### 5.6 消息频道

| 变量 | 说明 |
|------|------|
| `GOCLAW_TELEGRAM_TOKEN` | Telegram Bot Token（从 @BotFather 获取） |

### 5.7 调试与可观测性

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `GOCLAW_TRACE_VERBOSE` | `0` | 设为 `1` 开启完整 LLM 输入日志 |
| `GOCLAW_TELEMETRY_ENABLED` | `false` | 开启 OTel 追踪（需构建 tag `otel`） |
| `GOCLAW_TELEMETRY_ENDPOINT` | — | OTel Collector 地址（如 `jaeger:4317`） |
| `GOCLAW_TELEMETRY_PROTOCOL` | `grpc` | 协议（`grpc` \| `http`） |
| `GOCLAW_TELEMETRY_INSECURE` | `false` | 是否跳过 TLS（本地测试用） |
| `GOCLAW_TELEMETRY_SERVICE_NAME` | `goclaw-gateway` | OTel 服务名 |

### 5.8 Tailscale（需构建 tag `tsnet`）

| 变量 | 说明 |
|------|------|
| `GOCLAW_TSNET_AUTH_KEY` | Tailscale Auth Key |
| `GOCLAW_TSNET_HOSTNAME` | Tailscale 设备名（默认 `goclaw-gateway`） |

### 5.9 Docker 沙箱

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `GOCLAW_SANDBOX_MODE` | — | `all` 启用沙箱 |
| `GOCLAW_SANDBOX_IMAGE` | — | 沙箱镜像名（如 `openclaw-sandbox:bookworm-slim`） |
| `GOCLAW_SANDBOX_MEMORY_MB` | `512` | 容器内存限制 |
| `GOCLAW_SANDBOX_CPUS` | `1.0` | CPU 配额 |
| `GOCLAW_SANDBOX_TIMEOUT_SEC` | `300` | 执行超时（秒） |
| `GOCLAW_SANDBOX_NETWORK` | `false` | 是否允许网络访问 |

---

## 6. 配置文件详解

配置文件为 JSON5 格式（支持注释和尾部逗号），默认路径 `config.json`，**不存储任何 Secret**（Token、API Key 等均通过环境变量注入）。

### 完整配置示例

```json5
{
  "gateway": {
    "host": "0.0.0.0",
    "port": 18790,
    "rate_limit_rpm": 20,          // 每用户每分钟请求限制
    "max_message_chars": 32000,    // 消息最大字符数
    "inbound_debounce_ms": 1000    // 入站消息防抖（毫秒）
  },

  "agents": {
    "defaults": {
      "provider": "minimax",            // LLM 提供商名称
      "model": "MiniMax-M2.5",          // 模型 ID
      "context_window": 200000,         // 上下文窗口大小（tokens）
      "max_tokens": 8192,               // 最大输出 tokens
      "temperature": 0.7,               // 温度参数
      "max_tool_iterations": 20,        // 工具调用最大轮次
      "workspace": "~/.goclaw/workspace", // 工作目录（~ 自动展开）
      "restrict_to_workspace": true,     // 限制文件操作在 workspace 内
      "memory": {
        "enabled": true,
        "embedding_provider": ""        // 空表示自动检测（使用 chat provider API key）
      },
      "subagents": {
        "maxConcurrent": 20,            // 最大并发子 Agent 数
        "maxSpawnDepth": 1              // 最大嵌套深度
      }
    }
  },

  "providers": {
    // Standalone 模式下配置（Secret 不应写在此处，用环境变量）
    "openai": {
      "api_base": "https://api.openai.com/v1"  // 自定义 API Base（兼容 Ollama、vLLM 等）
    }
  },

  "tools": {
    "browser": {
      "enabled": true,
      "headless": true              // true = 无头模式（服务器部署必须）
    },
    "exec_approval": {
      "security": "full",          // 安全级别：full（内置 deny 列表）| custom | off
      "ask": "off"                 // 是否询问用户确认：off | always | risky
    },
    "web": {
      "duckduckgo": {
        "enabled": true,
        "max_results": 5           // 搜索结果数量
      }
    }
  },

  "channels": {
    "telegram": {
      "enabled": false,
      "token": "",                 // 从 GOCLAW_TELEGRAM_TOKEN 环境变量读取
      "dm_policy": "pairing"       // DM 策略：pairing | all | off
    },
    "zalo": {
      "enabled": false,
      "token": "",
      "dm_policy": "pairing"
    },
    "feishu": {
      "enabled": false,
      "app_id": "",
      "app_secret": "",
      "domain": "lark",            // lark | feishu
      "connection_mode": "websocket" // websocket | webhook
    }
  },

  "sessions": {
    "max_messages": 200,           // 会话最大消息数（超出自动截断）
    "storage_dir": ""              // 会话文件目录（空 = 使用 GOCLAW_SESSIONS_STORAGE）
  },

  "database": {
    "mode": "standalone",          // standalone | managed
    "postgres_dsn": ""             // 仅 managed 模式需要
  },

  "tts": {
    "provider": "",                // openai | elevenlabs | edge | minimax | 空表示禁用
    "auto": "off",                 // off | always | inbound | tagged
    "mode": "final",               // final（只读最后回复）| all（所有回复）
    "max_length": 500,             // 转换最大字符数
    "timeout_ms": 15000,
    "openai": { "api_key": "", "model": "gpt-4o-mini-tts", "voice": "alloy" },
    "elevenlabs": { "api_key": "", "voice_id": "", "model_id": "eleven_multilingual_v2" },
    "edge": { "voice": "en-US-MichelleNeural", "rate": "+0%" },
    "minimax": { "api_key": "", "group_id": "", "model": "speech-02-hd", "voice_id": "Wise_Woman" }
  },

  "cron": {
    "timezone": "UTC"              // 定时任务时区
  },

  "telemetry": {
    "enabled": false,
    "endpoint": "",
    "protocol": "grpc",
    "insecure": false,
    "service_name": "goclaw-gateway"
  },

  "mcp": {
    "servers": {
      // Standalone 模式下直接在此配置 MCP 服务器
      // "filesystem": {
      //   "transport": "stdio",
      //   "command": "npx",
      //   "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]
      // }
    }
  }
}
```

---

## 7. CLI 命令参考

```bash
goclaw [command] [flags]
```

### 全局 Flags

| Flag | 说明 |
|------|------|
| `--config <path>` | 配置文件路径（默认 `config.json` 或 `$GOCLAW_CONFIG`） |
| `-v, --verbose` | 开启调试日志 |

### 子命令

| 命令 | 说明 |
|------|------|
| `goclaw`（无参数） | 启动网关服务 |
| `goclaw onboard` | 交互式配置向导（首次使用或重新配置） |
| `goclaw version` | 打印版本和协议版本 |
| `goclaw doctor` | 系统自检（验证配置、连接、工具） |
| `goclaw migrate up` | 执行所有待执行的数据库迁移 |
| `goclaw migrate down` | 回滚最近一次迁移 |
| `goclaw migrate version` | 查看当前迁移版本 |
| `goclaw upgrade` | 执行托管模式数据升级（迁移 + 数据钩子） |
| `goclaw agent list` | 列出所有 Agent |
| `goclaw agent chat` | 直接通过 CLI 与 Agent 对话 |
| `goclaw pairing approve <code>` | 批准浏览器配对请求 |
| `goclaw pairing list` | 列出待审批配对 |
| `goclaw config get <key>` | 获取配置项值 |
| `goclaw config set <key> <value>` | 设置配置项值 |
| `goclaw models list` | 列出可用 AI 模型 |
| `goclaw channels list` | 列出频道状态 |
| `goclaw cron list` | 列出定时任务 |
| `goclaw skills list` | 列出已注册技能 |
| `goclaw sessions list` | 列出会话 |

---

## 8. 运行模式

### 8.1 Standalone 模式（单机文件存储）

默认模式，无需数据库，所有数据以文件形式存储在本地目录。

**特点：**
- 零依赖（无需安装 PostgreSQL）
- 单用户（共享 workspace）
- 会话以 JSON 文件存储在 `GOCLAW_SESSIONS_STORAGE`
- Agent 元数据存储在 SQLite（`GOCLAW_DATA_DIR/agents.db`）
- 记忆系统使用 SQLite FTS5（无向量搜索，仅全文检索）
- 适合个人开发者、单机部署、快速体验

**目录布局（默认）：**

```
~/.goclaw/
├── workspace/      # Agent 工作目录（代码、文件、输出）
├── data/           # SQLite 数据库
│   └── agents.db
└── sessions/       # 会话文件
    └── *.json
```

### 8.2 Managed 模式（PostgreSQL 多租户）

设置 `GOCLAW_MODE=managed` 并提供 `GOCLAW_POSTGRES_DSN` 后启用。

**特点：**
- 多用户隔离（per-user context files、per-user Agent）
- Agent 类型：`open`（用户独立上下文，7 个文件）vs `predefined`（共享上下文 + 用户 USER.md）
- 记忆系统使用 pgvector 向量搜索
- 完整追踪记录（LLM 调用历史、耗时、Token 用量）
- API Key 用 AES-256-GCM 加密存储在数据库
- 适合团队使用、生产环境、SaaS 场景

**PostgreSQL 要求：**
- PostgreSQL 15+
- pgvector 扩展（Docker 使用 `pgvector/pgvector:pg18` 镜像）

---

## 9. 数据库与迁移

### 9.1 运行迁移

```bash
# 执行所有待执行迁移
./goclaw migrate up

# 回滚最近一次迁移
./goclaw migrate down

# 查看当前版本
./goclaw migrate version
```

### 9.2 迁移历史

| 版本 | 说明 |
|------|------|
| 000001 | 初始 Schema（用户、Agent、会话、消息、Trace 等核心表） |
| 000002 | Agent 链接（子 Agent、委派关系） |
| 000003 | Agent 团队（Team 基础结构） |
| 000004 | Teams v2（重构团队模型） |
| 000005 | Phase 4（MCP、自定义工具、LLM Provider 管理） |
| 000006 | 内置工具配置表 |

### 9.3 自动迁移（Docker 部署）

在 Docker 部署的 Managed 模式下，容器启动时会自动执行 `goclaw upgrade`（包含迁移 + 数据钩子）。

---

## 10. 前端 Web 控制台

### 10.1 功能模块

| 模块 | 路由 | 说明 |
|------|------|------|
| 概览 | `/` | 系统状态、连接数、Agent 数、会话数 |
| 聊天 | `/chat` | 实时与 Agent 对话，流式输出 |
| Agent 管理 | `/agents` | 创建/配置/删除 Agent |
| 团队 | `/teams` | Agent 团队管理 |
| 会话 | `/sessions` | 查看/删除历史会话 |
| 技能 | `/skills` | 技能文件管理 |
| 定时任务 | `/cron` | 创建/启停定时任务 |
| 频道 | `/channels` | 消息频道配置（Managed 模式） |
| LLM 提供商 | `/providers` | LLM 提供商管理（Managed 模式） |
| 审批 | `/approvals` | 工具执行审批队列 |
| 节点 | `/nodes` | 浏览器配对设备管理 |
| 日志 | `/logs` | 实时日志流 |
| 追踪 | `/traces` | LLM 调用追踪记录 |
| 用量统计 | `/usage` | Token 消耗统计 |
| 委派记录 | `/delegations` | Agent 间委派历史 |
| 自定义工具 | `/custom-tools` | Shell 工具定义（Managed 模式） |
| 内置工具 | `/builtin-tools` | 内置工具启停配置 |
| MCP | `/mcp` | MCP 服务器管理 |
| TTS | `/tts` | 语音合成配置 |
| 系统配置 | `/config` | 网关配置（JSON 编辑器 + UI 表单） |

### 10.2 语言切换

控制台支持中英文切换，点击顶部栏右侧的 **Languages 图标** 即可。语言偏好保存在 `localStorage`（key: `goclaw:language`），初始语言根据浏览器语言自动检测。

### 10.3 本地开发 Proxy 配置

`vite.config.ts` 读取以下变量：

```bash
# ui/web/.env.local
VITE_BACKEND_PORT=18790   # 后端端口（默认 9600，需改为实际端口）
VITE_BACKEND_HOST=localhost
```

### 10.4 生产构建

```bash
cd ui/web
pnpm build
# 输出到 ui/web/dist/
```

---

## 11. Docker 部署

### 11.1 Compose 覆盖模式

GoClaw 使用"基础 + 覆盖"的 Docker Compose 模式，按需组合：

| 文件 | 作用 |
|------|------|
| `docker-compose.yml` | 基础服务定义（必须包含） |
| `docker-compose.standalone.yml` | Standalone 模式（文件存储） |
| `docker-compose.managed.yml` | Managed 模式（含 PostgreSQL） |
| `docker-compose.selfservice.yml` | Web 控制台（Nginx + React SPA） |
| `docker-compose.otel.yml` | OTel 追踪 + Jaeger UI |
| `docker-compose.tailscale.yml` | Tailscale 远程访问 |
| `docker-compose.sandbox.yml` | Docker 沙箱（代码执行隔离） |

### 11.2 推荐部署方案

#### 方案 A：Managed + Web 控制台（推荐生产方案）

```bash
# 1. 初始化环境变量
./prepare-env.sh
# 编辑 .env，填入 LLM API Key

# 2. 启动所有服务
docker compose \
  -f docker-compose.yml \
  -f docker-compose.managed.yml \
  -f docker-compose.selfservice.yml \
  up -d --build

# Web 控制台：http://localhost:3000
# 网关 API：http://localhost:18790
```

#### 方案 B：Standalone（快速体验）

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.standalone.yml \
  up -d --build

# 网关 API：http://localhost:18790
```

#### 方案 C：Managed + OTel 追踪

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.managed.yml \
  -f docker-compose.otel.yml \
  up -d --build

# Jaeger UI：http://localhost:16686
```

#### 方案 D：Managed + 代码沙箱

```bash
# 先构建沙箱镜像
docker build -t openclaw-sandbox:bookworm-slim -f Dockerfile.sandbox .

docker compose \
  -f docker-compose.yml \
  -f docker-compose.managed.yml \
  -f docker-compose.sandbox.yml \
  up -d --build
```

### 11.3 Docker 镜像构建参数

#### 后端 Dockerfile Build Args

| ARG | 默认值 | 说明 |
|-----|--------|------|
| `ENABLE_OTEL` | `false` | 编译 OTel 支持（构建 tag `otel`） |
| `ENABLE_TSNET` | `false` | 编译 Tailscale tsnet 支持（构建 tag `tsnet`） |
| `ENABLE_SANDBOX` | `false` | 安装 docker-cli（沙箱模式需要） |
| `VERSION` | `dev` | 版本号（注入 ldflags） |

### 11.4 端口映射

| 服务 | 默认端口 | 说明 |
|------|---------|------|
| goclaw | `18790` | 网关（WebSocket + HTTP API） |
| goclaw-ui | `3000` | Web 控制台（Nginx） |
| postgres | `5432` | PostgreSQL |
| jaeger UI | `16686` | Jaeger 追踪界面 |
| jaeger OTLP gRPC | `4317` | OTel Collector |
| jaeger OTLP HTTP | `4318` | OTel Collector |

### 11.5 卷挂载

| 卷名 | 挂载路径 | 说明 |
|------|---------|------|
| `goclaw-data` | `/app/data` | 配置、SQLite 数据库 |
| `goclaw-workspace` | `/app/workspace` | Agent 工作目录 |
| `goclaw-sessions` | `/app/sessions` | 会话文件（Standalone） |
| `goclaw-skills` | `/app/skills` | 技能文件 |
| `postgres-data` | `/var/lib/postgresql` | PostgreSQL 数据 |
| `tsnet-state` | `/app/tsnet-state` | Tailscale 状态 |

### 11.6 健康检查

后端容器内置健康检查：

```
GET http://localhost:18790/health
# 返回 200 即健康
```

检查间隔 30s，超时 5s，启动宽限期 10s，失败重试 3 次。

### 11.7 升级与迁移（Docker）

```bash
# 仅运行迁移
docker compose -f docker-compose.yml -f docker-compose.managed.yml run --rm goclaw migrate up

# 查看当前迁移版本
docker compose run --rm goclaw migrate version

# 升级覆盖（迁移 + 数据钩子）
docker compose -f docker-compose.yml -f docker-compose.managed.yml -f docker-compose.upgrade.yml run --rm goclaw upgrade
```

---

## 12. 部署方案对比

| 特性 | Standalone | Managed |
|------|-----------|---------|
| 数据库 | SQLite（文件） | PostgreSQL + pgvector |
| 多用户 | 共享单一上下文 | 完全隔离 |
| 向量记忆搜索 | ❌（仅 FTS） | ✅ pgvector |
| LLM 追踪 | ✅（本地） | ✅（完整历史） |
| API Key 管理 | 环境变量 | 数据库（加密） |
| Agent API | 有限 | 完整 CRUD |
| MCP 服务器管理 | config.json | HTTP API + 权限控制 |
| 自定义工具 | ❌ | ✅ |
| 用量统计 | ❌ | ✅ |
| 团队管理 | ❌ | ✅ |
| 依赖 | 零依赖 | PostgreSQL |
| 适用场景 | 个人、开发测试 | 团队、生产、SaaS |

---

## 13. HTTP API 参考

所有 HTTP 请求需要带 Token 认证（Header：`Authorization: Bearer <GOCLAW_GATEWAY_TOKEN>`）。

### 通用接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查（无需认证） |
| GET | `/ws` | WebSocket 升级 |
| POST | `/v1/chat/completions` | OpenAI 兼容 Chat API |
| POST | `/v1/responses` | Responses 协议 |
| POST | `/v1/tools/invoke` | 工具调用 |

### Agent 管理（Managed 模式）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/v1/agents` | 列出 Agent |
| POST | `/v1/agents` | 创建 Agent |
| GET | `/v1/agents/{id}` | 获取 Agent 详情 |
| PUT | `/v1/agents/{id}` | 更新 Agent |
| DELETE | `/v1/agents/{id}` | 删除 Agent |
| POST | `/v1/agents/{id}/resummon` | 重新召唤（Summoning 状态） |

### 技能管理（Managed 模式）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/v1/skills` | 列出技能 |
| POST | `/v1/skills` | 上传技能文件 |
| DELETE | `/v1/skills/{id}` | 删除技能 |

### 自定义工具（Managed 模式）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/v1/tools/custom` | 列出自定义工具 |
| POST | `/v1/tools/custom` | 创建自定义工具 |
| GET | `/v1/tools/custom/{id}` | 获取工具详情 |
| PUT | `/v1/tools/custom/{id}` | 更新工具 |
| DELETE | `/v1/tools/custom/{id}` | 删除工具 |

### MCP 服务器（Managed 模式）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/v1/mcp/servers` | 列出 MCP 服务器 |
| POST | `/v1/mcp/servers` | 注册 MCP 服务器 |
| GET | `/v1/mcp/servers/{id}` | 获取详情 |
| PUT | `/v1/mcp/servers/{id}` | 更新配置 |
| DELETE | `/v1/mcp/servers/{id}` | 删除 |
| POST | `/v1/mcp/servers/{id}/grants/agent` | 授权 Agent |
| DELETE | `/v1/mcp/servers/{id}/grants/agent/{agentID}` | 取消授权 |
| GET | `/v1/mcp/grants/agent/{agentID}` | 查看 Agent 授权 |

### 追踪记录（Managed 模式）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/v1/traces` | 列出追踪记录 |
| GET | `/v1/traces/{id}` | 获取追踪详情 |

---

## 14. WebSocket 协议

协议版本 v3，帧类型：`req`（客户端请求）、`res`（服务端响应）、`event`（服务端推送）。

### 认证握手

WebSocket 连接建立后，**第一个请求必须是 `connect`**：

```json
// 方式 1：Token 认证（admin 角色）
{"type": "req", "id": "1", "method": "connect", "params": {"token": "GATEWAY_TOKEN", "user_id": "alice"}}

// 方式 2：Sender ID 重连（operator 角色，已配对设备）
{"type": "req", "id": "1", "method": "connect", "params": {"sender_id": "paired-id", "user_id": "alice"}}

// 方式 3：发起配对流程（返回 8 位配对码）
{"type": "req", "id": "1", "method": "connect", "params": {"user_id": "alice"}}
```

### 发送消息

```json
{
  "type": "req",
  "id": "msg-001",
  "method": "chat.send",
  "params": {
    "message": "你好，请帮我写一个 hello world",
    "session_key": "agent:default:my-session",
    "agent_id": "default"
  }
}
```

### 流式响应事件

```json
// 流式 token
{"type": "event", "event": "chunk", "payload": {"content": "你好"}}

// 工具调用
{"type": "event", "event": "tool.call", "payload": {"name": "file_write", "id": "call-001"}}

// 工具结果
{"type": "event", "event": "tool.result", "payload": {"id": "call-001", "result": "..."}}

// Agent 完成
{"type": "event", "event": "run.completed", "payload": {"session_key": "..."}}
```

### 完整方法列表

| 方法 | 说明 |
|------|------|
| `connect` | 认证握手 |
| `health` | 健康检查 |
| `status` | 服务状态（连接数、Agent 数等） |
| `chat.send` | 发送消息 |
| `chat.history` | 获取会话历史 |
| `chat.abort` | 中断运行中的请求 |
| `agent` | 获取 Agent 信息 |
| `agents.list` | 列出所有 Agent |
| `sessions.list` | 列出会话 |
| `sessions.delete` | 删除会话 |
| `sessions.label` | 给会话命名 |
| `sessions.reset` | 重置会话（清空历史） |
| `skills.list` | 列出技能 |
| `cron.list` | 列出定时任务 |
| `cron.create` | 创建定时任务 |
| `cron.delete` | 删除定时任务 |
| `cron.toggle` | 启停定时任务 |
| `models.list` | 列出可用模型 |
| `browser.pairing.status` | 查询配对状态 |
| `device.pair.request` | 请求设备配对 |
| `device.pair.approve` | 批准配对码 |
| `device.pair.list` | 列出配对设备 |
| `device.pair.revoke` | 撤销配对 |

---

## 15. LLM 提供商配置

### 15.1 支持的提供商

| 提供商 | 类型 | 推荐模型 | 说明 |
|--------|------|---------|------|
| OpenRouter | OpenAI 兼容 | `anthropic/claude-sonnet-4-5-20250929` | 推荐，可访问多种模型 |
| Anthropic | 原生 HTTP+SSE | `claude-sonnet-4-5-20250929` | 直接调用 Claude |
| OpenAI | OpenAI 兼容 | `gpt-4o` | GPT 系列模型 |
| Groq | OpenAI 兼容 | `llama-3.3-70b-versatile` | 高速推理 |
| DeepSeek | OpenAI 兼容 | `deepseek-chat` | 中文优化 |
| Gemini | 原生 HTTP+SSE | `gemini-2.0-flash` | Google 模型 |
| Mistral | OpenAI 兼容 | `mistral-large-latest` | Mistral AI |
| xAI | OpenAI 兼容 | `grok-3-mini` | Grok 模型 |
| MiniMax | 原生 HTTP+SSE | `MiniMax-M2.5` | 国内服务 |
| Cohere | 原生 | `command-a` | Cohere Command |
| Perplexity | OpenAI 兼容 | `sonar-pro` | 带搜索的模型 |
| Custom | OpenAI 兼容 | 自定义 | Ollama、vLLM、LiteLLM 等 |

### 15.2 自定义 OpenAI 兼容端点（本地模型）

```json5
// config.json
{
  "providers": {
    "openai": {
      "api_base": "http://localhost:11434/v1"  // Ollama
    }
  },
  "agents": {
    "defaults": {
      "provider": "openai",
      "model": "llama3.2"
    }
  }
}
```

```bash
# .env
GOCLAW_OPENAI_API_KEY=ollama  # Ollama 不需要真实 key，填任意字符串
```

### 15.3 重试机制

所有提供商调用均内置 `RetryDo()` 指数退避重试，处理以下情况：
- 速率限制（429）
- 临时服务不可用（503）
- 网络超时

---

## 16. 消息频道配置

### 16.1 Telegram

```bash
# .env
GOCLAW_TELEGRAM_TOKEN=123456789:AAHxxxxx
```

```json5
// config.json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "dm_policy": "pairing"  // pairing（需配对）| all（允许所有私信）| off
    }
  }
}
```

**DM Policy 说明：**
- `pairing`：用户需先通过 `/start` 命令发起配对请求，管理员批准后才能使用
- `all`：所有私信直接接入 Agent（不推荐生产使用）
- `off`：禁用私信，仅群组可用

### 16.2 飞书/Lark

```json5
// config.json
{
  "channels": {
    "feishu": {
      "enabled": true,
      "app_id": "cli_xxx",
      "domain": "lark",            // lark（国际版）| feishu（国内版）
      "connection_mode": "websocket" // websocket（推荐）| webhook
    }
  }
}
```

```bash
# .env（敏感信息）
GOCLAW_FEISHU_APP_SECRET=xxx
```

### 16.3 Zalo

```json5
// config.json
{
  "channels": {
    "zalo": {
      "enabled": true,
      "dm_policy": "pairing"
    }
  }
}
```

---

## 17. 安全机制

### 17.1 认证与授权

- **RBAC 角色**：`admin`（完全控制）、`operator`（操作权限）、`viewer`（只读）
- **Token 认证**：WebSocket 首帧携带 `GOCLAW_GATEWAY_TOKEN`，赋予 admin 角色
- **配对认证**：浏览器/移动端通过 8 位配对码获得 operator 角色

### 17.2 输入安全

- **输入守卫（Input Guard）**：检测 Prompt Injection 等注入攻击（仅检测，不阻断）
- **消息大小限制**：单条消息最大 `max_message_chars`（默认 32000 字符）
- **速率限制**：每用户 `rate_limit_rpm` RPM（默认 20）

### 17.3 工具执行安全

- **Shell Deny 模式**：内置高危命令黑名单（`curl | sh`、反弹 Shell、`rm -rf /` 等）
- **Exec Approval**：
  - `security: full`：使用内置 deny 规则集
  - `ask: always`：每次执行前等待用户确认（Web 控制台审批队列）
  - `ask: off`：静默执行（仅在 deny 规则未触发时）
- **工作目录限制**：`restrict_to_workspace: true` 限制文件操作在 workspace 目录内
- **路径遍历防护**：自动阻断 `../` 路径穿越攻击
- **SSRF 防护**：阻断对内网地址的 HTTP 请求

### 17.4 加密

- **API Key 加密**：Managed 模式下所有 API Key 以 AES-256-GCM 加密存储在数据库
- **加密密钥**：`GOCLAW_ENCRYPTION_KEY`（64 位十六进制，不可丢失）

### 17.5 其他

- **CORS**：配置允许的域名
- **非 Root 运行**：Docker 容器以 uid 1000 用户运行
- **只读文件系统**：Docker Compose 配置 `read_only: true`
- **能力限制**：容器 `cap_drop: ALL`，无额外 Linux Capabilities
- **PID 限制**：Docker Compose `pids: 200`

### 17.6 安全日志

所有安全相关事件以 `slog.Warn("security.*")` 记录，可通过 `GOCLAW_TRACE_VERBOSE=1` 获得更详细的输出。

---

## 18. 可观测性（OTel）

### 18.1 启用

OTel 支持通过 Go 构建 tag 开关，默认禁用（减小二进制体积）：

```bash
# 本地构建（开启 OTel）
CGO_ENABLED=0 go build -tags otel -o goclaw .

# Docker 构建（通过 build arg）
docker build --build-arg ENABLE_OTEL=true -t goclaw .
```

### 18.2 配置

```bash
# 环境变量
GOCLAW_TELEMETRY_ENABLED=true
GOCLAW_TELEMETRY_ENDPOINT=localhost:4317   # OTel Collector 或 Jaeger
GOCLAW_TELEMETRY_PROTOCOL=grpc             # grpc | http
GOCLAW_TELEMETRY_INSECURE=true             # 本地测试跳过 TLS
GOCLAW_TELEMETRY_SERVICE_NAME=goclaw-gateway
```

### 18.3 使用 Jaeger（Docker）

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.managed.yml \
  -f docker-compose.otel.yml \
  up -d --build

# 访问 Jaeger UI：http://localhost:16686
```

### 18.4 追踪内容

每次 LLM 调用生成一个 Span，记录：
- 请求耗时
- 输入/输出 Token 数
- 缓存命中 Token 数（Anthropic prompt cache）
- 工具调用序列
- 错误信息

---

## 19. Tailscale 集成

使用 Tailscale tsnet 将网关暴露到 Tailscale 网络，无需公网 IP 或端口转发：

```bash
# 构建（开启 tsnet）
CGO_ENABLED=0 go build -tags tsnet -o goclaw .

# 或 Docker
docker compose \
  -f docker-compose.yml \
  -f docker-compose.managed.yml \
  -f docker-compose.tailscale.yml \
  up -d --build
```

```bash
# 环境变量
GOCLAW_TSNET_AUTH_KEY=tskey-auth-xxxxx   # 从 Tailscale Admin 获取
GOCLAW_TSNET_HOSTNAME=goclaw-gateway     # 设备在 Tailscale 网络中的名称
```

---

## 20. Docker 沙箱（代码执行）

沙箱模式将 Agent 执行的 Shell 命令运行在独立 Docker 容器中，提供隔离保护：

### 20.1 前置步骤

```bash
# 1. 构建沙箱镜像
docker build -t openclaw-sandbox:bookworm-slim -f Dockerfile.sandbox .

# 2. 部署（挂载 Docker Socket）
docker compose \
  -f docker-compose.yml \
  -f docker-compose.managed.yml \
  -f docker-compose.sandbox.yml \
  up -d --build
```

### 20.2 沙箱配置

```bash
GOCLAW_SANDBOX_MODE=all                          # 启用沙箱
GOCLAW_SANDBOX_IMAGE=openclaw-sandbox:bookworm-slim
GOCLAW_SANDBOX_WORKSPACE_ACCESS=rw               # rw | ro | none
GOCLAW_SANDBOX_SCOPE=session                     # 每会话一个容器
GOCLAW_SANDBOX_MEMORY_MB=512                     # 内存限制
GOCLAW_SANDBOX_CPUS=1.0                          # CPU 配额
GOCLAW_SANDBOX_TIMEOUT_SEC=300                   # 执行超时
GOCLAW_SANDBOX_NETWORK=false                     # 禁用网络（安全隔离）
```

> ⚠️ **安全警告：** 挂载 Docker Socket（`/var/run/docker.sock`）会赋予容器内的进程控制宿主机 Docker 的权限。仅在可信环境中使用。

---

## 21. 生产部署建议

### 21.1 必须完成的配置

1. **设置强 Token**：`GOCLAW_GATEWAY_TOKEN` 必须是随机生成的强密钥（`./prepare-env.sh` 自动处理）
2. **保存加密密钥**：`GOCLAW_ENCRYPTION_KEY` 一旦丢失，数据库中所有 API Key 将无法解密，**务必备份**
3. **配置 HTTPS/WSS**：在 Nginx/Traefik 等反向代理前置 TLS 终止
4. **定期备份数据库**：Managed 模式下备份 PostgreSQL，Standalone 模式备份 `~/.goclaw/data/`

### 21.2 反向代理配置（Nginx 示例）

```nginx
server {
    listen 443 ssl;
    server_name goclaw.example.com;

    ssl_certificate /etc/ssl/certs/goclaw.crt;
    ssl_certificate_key /etc/ssl/private/goclaw.key;

    # WebSocket
    location /ws {
        proxy_pass http://localhost:18790;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400s;
    }

    # API
    location / {
        proxy_pass http://localhost:18790;
    }
}
```

### 21.3 资源规划

| 组件 | 最低配置 | 推荐配置 |
|------|---------|---------|
| 网关（Docker） | 512MB RAM, 1 CPU | 1GB RAM, 2 CPU |
| PostgreSQL | 512MB RAM, 1 CPU | 2GB RAM, 2 CPU |
| 沙箱容器（可选） | 512MB RAM/容器 | 1GB RAM/容器 |

---

## 22. 故障排查

### 22.1 常见问题

**后端无法启动：`package X is not in std`**

```bash
# 问题：GOROOT 指向错误（Homebrew 安装场景）
# 修复：
export GOROOT="$(brew --prefix go)/libexec"
go build -o goclaw .
```

**前端无法连接到后端（WebSocket 400/404）**

```bash
# 检查 vite.config.ts 代理端口是否与后端一致
echo "VITE_BACKEND_PORT=18790" > ui/web/.env.local
pnpm dev
```

**登录报 "Connection failed"**

1. 确认后端已启动：`curl http://localhost:18790/health`
2. 确认 Token 正确：查看 `.env.local` 或 `.env` 中的 `GOCLAW_GATEWAY_TOKEN`
3. 检查浏览器控制台 WebSocket 错误

**Managed 模式数据库连接失败**

```bash
# 验证 DSN
psql "postgres://user:pass@host:5432/goclaw?sslmode=disable" -c "SELECT 1"

# 确认 pgvector 扩展存在
psql ... -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
```

**迁移失败**

```bash
# 查看当前版本
./goclaw migrate version

# 强制设置版本（危险操作，仅在版本记录损坏时使用）
./goclaw migrate force <version>
```

### 22.2 日志分析

```bash
# 查看所有 WARN 级别日志（包含安全事件）
./goclaw 2>&1 | grep 'level=WARN'

# 开启详细日志
GOCLAW_TRACE_VERBOSE=1 ./goclaw

# Docker 日志
docker compose logs -f goclaw
docker compose logs -f goclaw --since 1h
```

### 22.3 系统自检

```bash
./goclaw doctor
# 输出各组件状态：配置、数据库连接、LLM 提供商、工具、频道
```

### 22.4 内存泄漏排查

```bash
# 监控进程资源使用
watch -n 5 'ps aux | grep goclaw'

# Go pprof（需在代码中启用）
go tool pprof http://localhost:6060/debug/pprof/heap
```
