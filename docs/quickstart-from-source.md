# GoClaw 源码安装、启动与配置引导

> 适用版本：dev（源码最新分支）  
> 本文档面向从源码构建和运行 GoClaw 的开发者与高级用户。

---

## 目录

1. [环境依赖](#1-环境依赖)
2. [获取源码](#2-获取源码)
3. [初始化环境变量](#3-初始化环境变量)
4. [编译后端](#4-编译后端)
5. [配置引导：onboard 向导](#5-配置引导onboard-向导)
6. [启动网关](#6-启动网关)
7. [启动前端控制台](#7-启动前端控制台)
8. [Managed 模式（PostgreSQL）完整流程](#8-managed-模式postgresql完整流程)
9. [配置文件详解](#9-配置文件详解)
10. [多 LLM 提供商配置](#10-多-llm-提供商配置)
11. [消息频道配置](#11-消息频道配置)
12. [工作区与 Bootstrap 文件](#12-工作区与-bootstrap-文件)
13. [MCP 工具服务器配置](#13-mcp-工具服务器配置)
14. [系统自检（doctor）](#14-系统自检doctor)
15. [常见问题排查](#15-常见问题排查)

---

## 1. 环境依赖

在开始之前，请确保本机已安装以下工具：

### 必须

| 工具 | 最低版本 | 安装方式 |
|------|---------|---------|
| **Go** | 1.25.5 | https://go.dev/dl/ 或 `brew install go` |
| **Git** | 任意 | 系统自带或 `brew install git` |

### 前端控制台（可选，但推荐）

| 工具 | 最低版本 | 安装方式 |
|------|---------|---------|
| **Node.js** | 22+ | https://nodejs.org 或 `brew install node` |
| **pnpm** | 10+ | `corepack enable && corepack prepare pnpm@latest --activate` |

### Managed 模式（多租户/生产）

| 工具 | 最低版本 | 安装方式 |
|------|---------|---------|
| **PostgreSQL** | 15+ 含 pgvector | `docker run pgvector/pgvector:pg18` 或本地安装 |

### 验证安装

```bash
go version      # 应输出 go1.25.x 及以上
node --version  # 应输出 v22.x（可选）
pnpm --version  # 应输出 10.x（可选）
```

> **macOS Homebrew 注意：** 若通过 Homebrew 安装 Go，标准库路径可能指向错误位置，需要手动修正 GOROOT：
>
> ```bash
> # 检测是否有问题
> ls "$(go env GOROOT)/src/archive/tar" 2>/dev/null || echo "GOROOT incorrect"
>
> # 如有问题，永久修复（加入 ~/.zshrc 或 ~/.bashrc）
> export GOROOT="$(brew --prefix go)/libexec"
> ```

---

## 2. 获取源码

```bash
git clone <repo-url> goclaw
cd goclaw
```

项目根目录结构：

```
goclaw/
├── main.go              # 程序入口
├── cmd/                 # CLI 命令
├── internal/            # 核心业务逻辑
├── pkg/                 # 公共包（协议、浏览器）
├── migrations/          # PostgreSQL 迁移 SQL
├── ui/web/              # React 前端控制台
├── Makefile             # 构建快捷命令
├── .env.example         # 环境变量模板
└── config.json          # 运行时配置（自动生成，无 Secret）
```

---

## 3. 初始化环境变量

GoClaw 将所有 Secret（Token、API Key）存储在环境变量中，永远不写入 `config.json`。

### 步骤一：运行初始化脚本

```bash
./prepare-env.sh
```

该脚本会：
- 从 `.env.example` 创建 `.env` 文件（若不存在）
- 自动生成 `GOCLAW_GATEWAY_TOKEN`（32 位十六进制随机数）
- 自动生成 `GOCLAW_ENCRYPTION_KEY`（64 位十六进制，用于 AES-256-GCM 加密 API Key）
- 检测已有的 LLM Provider API Key

### 步骤二：填入 LLM 提供商 API Key

打开 `.env`，填入至少一个 LLM 提供商的 API Key（选一个即可）：

```bash
# .env — 至少填写其中一个

# 推荐：OpenRouter（可访问 Claude、GPT、Gemini 等所有主流模型）
GOCLAW_OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxx

# 或 Anthropic（直连 Claude）
GOCLAW_ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx

# 或 OpenAI
GOCLAW_OPENAI_API_KEY=sk-xxxxxxxxxxxx

# 或 Groq（超高速推理）
GOCLAW_GROQ_API_KEY=gsk_xxxxxxxxxxxx

# 或 DeepSeek（中文优化）
GOCLAW_DEEPSEEK_API_KEY=sk-xxxxxxxxxxxx

# 或 Gemini
GOCLAW_GEMINI_API_KEY=AIzaSyxxxxxxxxxxxx

# 或 MiniMax（国内可用）
GOCLAW_MINIMAX_API_KEY=xxxxxxxxxxxx  # 注意：不需要加 sk-api- 前缀

# 或本地模型（Ollama）—— 见第10节
```

### 步骤三：了解完整环境变量说明

| 变量 | 是否必须 | 说明 |
|------|---------|------|
| `GOCLAW_GATEWAY_TOKEN` | ✅ | WebSocket 认证 Token，登录控制台时使用 |
| `GOCLAW_ENCRYPTION_KEY` | ✅ (Managed) | API Key 数据库加密密钥，**丢失后无法恢复** |
| `GOCLAW_MINIMAX_API_KEY` 等 | ✅ (至少一个) | LLM 提供商 API Key |
| `GOCLAW_CONFIG` | 否 | 配置文件路径，默认 `./config.json` |
| `GOCLAW_HOST` | 否 | 监听地址，默认 `0.0.0.0` |
| `GOCLAW_PORT` | 否 | 监听端口，默认 `18790` |
| `GOCLAW_MODE` | 否 | 运行模式：`standalone`（默认）或 `managed` |
| `GOCLAW_POSTGRES_DSN` | Managed 模式 | PostgreSQL 连接字符串 |
| `GOCLAW_WORKSPACE` | 否 | Agent 工作目录，默认 `~/.goclaw/workspace` |
| `GOCLAW_DATA_DIR` | 否 | 数据目录，默认 `~/.goclaw/data` |
| `GOCLAW_SESSIONS_STORAGE` | 否 | 会话目录，默认 `~/.goclaw/sessions` |
| `GOCLAW_SKILLS_DIR` | 否 | 技能目录，默认 `~/.goclaw/skills` |
| `GOCLAW_OWNER_IDS` | 否 | 管理员 User ID（逗号分隔），具有最高权限 |
| `GOCLAW_TRACE_VERBOSE` | 否 | 设为 `1` 开启 LLM 完整输入日志 |
| `GOCLAW_TELEGRAM_TOKEN` | 否 | Telegram Bot Token |

---

## 4. 编译后端

### 标准编译（推荐，CGO 禁用，静态二进制）

```bash
# 使用 Makefile（推荐）
make build

# 或手动
CGO_ENABLED=0 go build -o goclaw .
```

### 附加功能编译（按需选择）

```bash
# 启用 OpenTelemetry 分布式追踪
CGO_ENABLED=0 go build -tags otel -o goclaw .

# 启用 Tailscale tsnet（安全远程访问）
CGO_ENABLED=0 go build -tags tsnet -o goclaw .

# 同时启用 OTel + Tailscale
CGO_ENABLED=0 go build -tags "otel,tsnet" -o goclaw .
```

### 带版本号编译

```bash
VERSION=$(git describe --tags --always --dirty 2>/dev/null || echo dev)
CGO_ENABLED=0 go build \
  -ldflags="-s -w -X github.com/nextlevelbuilder/goclaw/cmd.Version=${VERSION}" \
  -o goclaw .
```

### 验证编译结果

```bash
./goclaw version
# 输出: goclaw dev (protocol 3)
```

---

## 5. 配置引导：onboard 向导

`onboard` 是首次使用的交互式配置向导，会引导你完成提供商、频道、功能的配置，并生成 `config.json` 和 `.env.local`。

### 5.1 自动 onboard（推荐，无需交互）

若 `.env` 中已设置 LLM API Key，直接启动即会触发自动 onboard：

```bash
source .env && ./goclaw
# 或
source .env && go run .
```

自动 onboard 完成后输出类似：

```
Auto-onboard: environment variables detected, running non-interactive setup...
  Provider: openrouter (model: anthropic/claude-sonnet-4-5-20250929)
  Memory:   enabled (embedding: openrouter)
  Config saved to config.json
Auto-onboard complete.
time=... level=INFO msg="goclaw gateway starting" version=dev protocol=3 mode=standalone
time=... level=INFO msg="gateway starting" addr=0.0.0.0:18790
```

### 5.2 交互式 onboard（详细配置）

若需要完整配置频道、TTS、Managed 模式等，使用交互向导：

```bash
./goclaw onboard
```

向导流程分为三步：

---

**Step 1 · 选择 AI 提供商**

```
Step 1 · AI Provider — Choose your LLM provider
> OpenRouter  (recommended — access to many models)
  Anthropic   (Claude models directly)
  OpenAI      (GPT models)
  Groq        (fast inference)
  DeepSeek    (DeepSeek models)
  Gemini      (Google Gemini)
  Mistral     (Mistral AI models)
  xAI         (Grok models)
  MiniMax     (MiniMax models)
  Cohere      (Command models)
  Perplexity  (Sonar search models)
  Custom      (any OpenAI-compatible endpoint)
```

选择后输入对应的 API Key 和模型 ID（OpenRouter 会自动拉取可用模型列表）。

---

**Step 2 · 选择消息频道**

```
Step 2 · Channels (select at least 1)
[ ] Telegram
[ ] Zalo OA
[ ] Feishu / Lark
```

选择频道后，向导会提示输入对应的 Token / App ID / App Secret。

---

**Step 3 · 选择数据库模式**

```
Step 3 · Database Mode
> Standalone  (file-based, no database required)
  Managed     (Postgres — multi-user, tracing, agent API)
```

Managed 模式需要提供 PostgreSQL DSN，向导会自动测试连接并执行迁移。

---

**向导完成后生成两个文件：**

- `config.json`：不含 Secret 的运行时配置
- `.env.local`：包含所有 Token 和 API Key 的 Secret 文件

**启动命令：**

```bash
source .env.local && ./goclaw
```

### 5.3 重新配置

```bash
./goclaw onboard
# 向导会询问是否使用现有配置作为基础（默认 Yes）
```

---

## 6. 启动网关

### 标准启动流程

```bash
# 首次使用（已有 .env）
source .env && ./goclaw

# 使用向导后的启动方式
source .env.local && ./goclaw
```

### 启动参数

```bash
./goclaw [flags]

Flags:
  --config <path>   配置文件路径（默认 config.json 或 $GOCLAW_CONFIG）
  -v, --verbose     开启 Debug 日志
```

### 健康验证

```bash
# 确认服务正常监听
curl http://localhost:18790/health
# 返回: {"status":"ok","protocol":3}
```

### 正常启动日志示例

```
time=... level=INFO msg="registered provider" name=openrouter
time=... level=INFO msg="memory store opened" path=~/.goclaw/workspace/memory.db
time=... level=INFO msg="memory embeddings disabled (no API key), FTS-only mode"
time=... level=INFO msg="browser tool enabled" headless=true
time=... level=INFO msg="web_search tool enabled"
time=... level=INFO msg="web_fetch tool enabled"
time=... level=INFO msg="subagent system enabled" tools="[spawn subagent]"
time=... level=INFO msg="exec approval enabled" security=full ask=off
time=... level=INFO msg="bootstrap loaded from filesystem" count=7
time=... level=INFO msg="skill_search tool registered" skills=0
time=... level=INFO msg="cron tool registered"
time=... level=INFO msg="standalone mode: agent store + interceptors wired" agents=1
time=... level=INFO msg="created agent" agent=default model=... provider=...
time=... level=INFO msg="goclaw gateway starting" version=dev protocol=3 mode=standalone agents=[default] tools=21 channels=[]
time=... level=INFO msg="gateway starting" addr=0.0.0.0:18790
```

### 优雅停止

```bash
# 发送 SIGINT（Ctrl+C）或 SIGTERM
kill -SIGTERM <pid>

# 停止前会广播 shutdown 事件并等待 channels/cron/sandbox 清理完成
```

---

## 7. 启动前端控制台

前端控制台是独立的 React SPA，开发模式下使用 Vite 代理将 `/ws`、`/v1` 转发到后端。

### 7.1 安装依赖

```bash
cd ui/web
pnpm install
```

### 7.2 配置代理端口（重要）

Vite 默认将请求代理到 `localhost:9600`，但 GoClaw 默认监听 `18790`，需要修正：

```bash
# 创建本地环境覆盖文件
echo "VITE_BACKEND_PORT=18790" > ui/web/.env.local
echo "VITE_BACKEND_HOST=localhost" >> ui/web/.env.local
```

### 7.3 启动开发服务器

```bash
cd ui/web
pnpm dev
# 访问 http://localhost:5173
```

### 7.4 登录

1. 打开 `http://localhost:5173`
2. 选择 **Token** 登录方式
3. 填入：
   - **User ID**：任意字符串（如 `admin`）
   - **Gateway Token**：`.env` 或 `.env.local` 中的 `GOCLAW_GATEWAY_TOKEN` 值
4. 点击 **Connect**

### 7.5 语言切换

点击顶部栏右侧的 **Languages（地球仪）图标** 可在中文和英文之间切换，偏好自动保存到浏览器 localStorage。

### 7.6 生产构建

```bash
cd ui/web
pnpm build
# 产物输出到 ui/web/dist/
# 使用 Nginx 等静态服务器托管 dist/ 目录
```

---

## 8. Managed 模式（PostgreSQL）完整流程

Managed 模式适合团队使用、多用户隔离、生产环境部署，提供完整的 PostgreSQL 持久化。

### 8.1 前置：启动 PostgreSQL（含 pgvector）

```bash
# 使用 Docker（最简单）
docker run -d \
  --name goclaw-postgres \
  -e POSTGRES_USER=goclaw \
  -e POSTGRES_PASSWORD=goclaw \
  -e POSTGRES_DB=goclaw \
  -p 5432:5432 \
  pgvector/pgvector:pg18

# 等待启动完成
docker exec goclaw-postgres pg_isready -U goclaw
```

### 8.2 配置环境变量

```bash
# 在 .env 中补充以下变量
GOCLAW_MODE=managed
GOCLAW_POSTGRES_DSN=postgres://goclaw:goclaw@localhost:5432/goclaw?sslmode=disable

# 这两个由 prepare-env.sh 自动生成，确保非空
GOCLAW_GATEWAY_TOKEN=<32位十六进制>
GOCLAW_ENCRYPTION_KEY=<64位十六进制>
```

> ⚠️ **`GOCLAW_ENCRYPTION_KEY` 极为重要**：所有 LLM API Key 都用此密钥加密存储在数据库，密钥丢失则数据不可恢复，务必妥善备份。

### 8.3 执行数据库迁移

```bash
source .env
./goclaw migrate up
# 输出: Applied 6 migrations (version: 6)
```

迁移历史（全部幂等）：

| 版本 | 内容 |
|------|------|
| 000001 | 初始 Schema（用户、Agent、会话、消息、Trace、Provider 等核心表） |
| 000002 | Agent 链接（子 Agent 委派关系） |
| 000003 | Agent 团队（Team 基础结构） |
| 000004 | Teams v2（重构团队模型） |
| 000005 | Phase 4（MCP 服务器、自定义工具、LLM Provider 管理表） |
| 000006 | 内置工具配置表 |

### 8.4 启动网关（Managed 模式）

```bash
source .env && ./goclaw
```

自动流程：
1. 检测到 `GOCLAW_POSTGRES_DSN` → 自动切为 managed 模式
2. 连接 PostgreSQL（最多重试 5 次，每次间隔 2 秒）
3. 执行迁移（幂等）
4. Seed 默认 Agent 和 Provider（跳过已存在的记录）
5. 从数据库加载 Provider（覆盖 config.json 中的配置）
6. 启动网关

### 8.5 Managed 模式特有功能

- **Provider 热更新**：通过 Web 控制台 `/providers` 页面增删改 LLM 提供商，无需重启
- **Agent CRUD**：完整的 Agent 创建/配置/删除 API
- **自定义工具**：通过 `/custom-tools` 定义 Shell 工具，Agent 运行时调用
- **MCP 服务器**：通过 `/mcp` 管理外部 MCP 工具服务器及授权
- **LLM 追踪**：所有 LLM 调用自动记录，在 `/traces` 查看
- **Token 用量统计**：在 `/usage` 查看各 Agent 的 Token 消耗
- **频道管理**：通过 `/channels` 动态管理消息频道，无需重启

### 8.6 迁移其他命令

```bash
# 查看当前版本
./goclaw migrate version

# 回滚最近一次
./goclaw migrate down

# 强制设置版本（仅在版本记录损坏时使用，危险）
./goclaw migrate force <version>

# 升级（迁移 + 数据钩子，适用于大版本升级）
./goclaw upgrade
```

---

## 9. 配置文件详解

`config.json` 使用 JSON5 格式（支持注释），**不存储任何 Secret**。所有 Token 和 API Key 通过环境变量注入。

### 完整配置示例

```json5
{
  // ─── 网关 ───────────────────────────────────────────────────
  "gateway": {
    "host": "0.0.0.0",          // 监听地址（0.0.0.0 = 所有接口）
    "port": 18790,               // 监听端口
    "rate_limit_rpm": 20,        // 每用户每分钟请求限制
    "max_message_chars": 32000,  // 单条消息最大字符数
    "inbound_debounce_ms": 1000  // 入站消息防抖（毫秒），减少频繁消息触发
  },

  // ─── Agent 默认配置 ─────────────────────────────────────────
  "agents": {
    "defaults": {
      "provider": "openrouter",         // LLM 提供商（也可通过 GOCLAW_PROVIDER 设置）
      "model": "anthropic/claude-sonnet-4-5-20250929",  // 模型 ID
      "context_window": 200000,         // 上下文窗口大小（tokens）
      "max_tokens": 8192,               // 最大输出 tokens
      "temperature": 0.7,               // 温度（0-1，越高越随机）
      "max_tool_iterations": 20,        // 工具调用最大轮次（超出后强制结束）
      "workspace": "~/.goclaw/workspace", // Agent 工作目录（~ 会自动展开）
      "restrict_to_workspace": true,     // 限制文件操作在 workspace 内（安全）
      "memory": {
        "enabled": true,
        "embedding_provider": ""         // 空 = 自动检测；可选 openai/openrouter/gemini
      },
      "subagents": {
        "maxConcurrent": 20,             // 最大并发子 Agent 数
        "maxSpawnDepth": 1               // 子 Agent 最大嵌套深度
      }
    }
  },

  // ─── 工具配置 ────────────────────────────────────────────────
  "tools": {
    "browser": {
      "enabled": true,
      "headless": true              // 服务器部署必须为 true；开发调试可设 false
    },
    "execApproval": {
      "security": "full",          // full（内置 deny 列表）| custom | off
      "ask": "off"                 // off（静默）| always（每次询问）| risky（仅危险命令）
    },
    "web": {
      "duckduckgo": {
        "enabled": true,
        "max_results": 5           // 搜索返回结果数
      }
    }
  },

  // ─── Standalone 模式频道配置 ─────────────────────────────────
  // Managed 模式下，频道通过 Web 控制台 /channels 管理，此处不需要配置
  "channels": {
    "telegram": {
      "enabled": false,
      "dm_policy": "pairing"       // pairing | all | off
    }
  },

  // ─── 数据库模式 ──────────────────────────────────────────────
  "database": {
    "mode": "standalone"           // standalone | managed（也可通过 GOCLAW_MODE 设置）
  },

  // ─── 会话配置 ────────────────────────────────────────────────
  "sessions": {
    "max_messages": 200            // 超出此数自动截断旧消息
  },

  // ─── 语音合成（TTS） ─────────────────────────────────────────
  "tts": {
    "provider": "",                // 空表示禁用；可选 openai/elevenlabs/edge/minimax
    "auto": "off"                  // off | always | inbound | tagged
  },

  // ─── 定时任务 ────────────────────────────────────────────────
  "cron": {
    "timezone": "Asia/Shanghai"    // 时区（标准 IANA 格式）
  },

  // ─── MCP 服务器（Standalone 模式） ───────────────────────────
  "mcp": {
    "servers": {}                  // 见第13节
  },

  // ─── OTel 追踪（需构建 tag otel） ────────────────────────────
  "telemetry": {
    "enabled": false,
    "endpoint": "localhost:4317",
    "protocol": "grpc",
    "insecure": true,
    "service_name": "goclaw-gateway"
  }
}
```

---

## 10. 多 LLM 提供商配置

### 10.1 提供商优先级检测顺序

自动 onboard 时按以下顺序检测可用 API Key，第一个匹配的为默认提供商：

```
openrouter → anthropic → openai → groq → deepseek
→ gemini → mistral → xai → minimax → cohere → perplexity
```

### 10.2 显式指定提供商

```bash
# .env 中设置
GOCLAW_PROVIDER=anthropic
GOCLAW_MODEL=claude-opus-4-5-20250929
GOCLAW_ANTHROPIC_API_KEY=sk-ant-xxxx
```

### 10.3 各提供商推荐模型

| 提供商 | 环境变量 | 推荐模型 | 说明 |
|--------|---------|---------|------|
| openrouter | `GOCLAW_OPENROUTER_API_KEY` | `anthropic/claude-sonnet-4-5-20250929` | 推荐首选，访问所有主流模型 |
| anthropic | `GOCLAW_ANTHROPIC_API_KEY` | `claude-sonnet-4-5-20250929` | 直连，原生 SSE 流式 |
| openai | `GOCLAW_OPENAI_API_KEY` | `gpt-4o` | OpenAI 官方 |
| groq | `GOCLAW_GROQ_API_KEY` | `llama-3.3-70b-versatile` | 超高速推理 |
| deepseek | `GOCLAW_DEEPSEEK_API_KEY` | `deepseek-chat` | 中文优化，高性价比 |
| gemini | `GOCLAW_GEMINI_API_KEY` | `gemini-2.0-flash` | Google，支持长上下文 |
| mistral | `GOCLAW_MISTRAL_API_KEY` | `mistral-large-latest` | 欧洲合规 |
| xai | `GOCLAW_XAI_API_KEY` | `grok-3-mini` | Grok 模型 |
| minimax | `GOCLAW_MINIMAX_API_KEY` | `MiniMax-M2.5` | 国内服务，注意 Key 格式 |
| cohere | `GOCLAW_COHERE_API_KEY` | `command-a` | Cohere Command |
| perplexity | `GOCLAW_PERPLEXITY_API_KEY` | `sonar-pro` | 内置网络搜索 |

### 10.4 自定义 OpenAI 兼容端点（本地模型）

支持 Ollama、vLLM、LiteLLM、LocalAI 等任何 OpenAI 兼容接口：

```bash
# .env
GOCLAW_OPENAI_API_KEY=ollama    # 不需要真实 key，填任意非空字符串
```

```json5
// config.json
{
  "agents": {
    "defaults": {
      "provider": "openai",
      "model": "llama3.2"         // Ollama 中已拉取的模型名
    }
  },
  "providers": {
    "openai": {
      "api_base": "http://localhost:11434/v1"  // Ollama 默认地址
    }
  }
}
```

启动 Ollama 示例：
```bash
ollama run llama3.2
# 或
ollama serve  # 后台运行
```

### 10.5 向量记忆嵌入（Embedding）

记忆系统可选择向量搜索（需要支持 embedding 的提供商），自动检测优先级：

```
主提供商（若支持）→ openai → openrouter → gemini
```

仅以下三个提供商支持 embedding：`openai`、`openrouter`、`gemini`。

其他提供商（如 MiniMax、Groq 等）会降级为纯 FTS 全文检索模式，功能正常但不支持语义搜索。

---

## 11. 消息频道配置

### 11.1 Standalone 模式（config.json 配置）

#### Telegram

```bash
# 1. 从 Telegram @BotFather 创建 Bot 并获取 Token
# 2. 设置环境变量
GOCLAW_TELEGRAM_TOKEN=123456789:AAHxxxxxxxxxxxxx
```

```json5
// config.json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "dm_policy": "pairing",      // pairing（需配对）| all（所有用户）| off
      "stream_mode": "none",       // none | typing | token（流式打字效果）
      "reaction_level": "full",    // full（表情反应）| minimal | none
      "history_limit": 50          // 每次传递给 LLM 的历史消息数
    }
  }
}
```

**DM Policy 说明：**
- `pairing`：用户发送 `/start` 后产生 8 位配对码，管理员执行 `./goclaw pairing approve <code>` 批准
- `all`：允许所有私信（不推荐生产使用）
- `off`：禁用私信，仅群组有效

#### 飞书/Lark

```json5
// config.json
{
  "channels": {
    "feishu": {
      "enabled": true,
      "app_id": "cli_xxxxxxxx",
      "domain": "lark",               // lark（国际版）| feishu（国内版）
      "connection_mode": "websocket"   // websocket（推荐）| webhook
    }
  }
}
```

```bash
# .env — App Secret 通过环境变量注入
GOCLAW_FEISHU_APP_SECRET=xxxxxxxxxx
```

#### Zalo

```bash
GOCLAW_ZALO_TOKEN=xxxxxxxxxx
```

```json5
{
  "channels": {
    "zalo": {
      "enabled": true,
      "dm_policy": "pairing"
    }
  }
}
```

### 11.2 Managed 模式（Web 控制台配置）

Managed 模式下，频道配置存储在 PostgreSQL 的 `channel_instances` 表，通过 Web 控制台管理，无需编辑 `config.json`：

1. 打开 `http://localhost:5173/channels`（或 3000）
2. 点击 **Add Channel**
3. 选择频道类型（Telegram / Feishu / Discord / Zalo / WhatsApp）
4. 填入配置（Token、AppID 等）和关联的 Agent
5. 启用后立即生效，无需重启网关

### 11.3 配对（Pairing）流程

用户首次通过 Telegram/Zalo 发送 `/start` 时触发：

```
用户: /start
Bot: 您的配对码是: AB12CD34
     请将此码发送给管理员以获取访问权限。

# 管理员执行：
./goclaw pairing approve AB12CD34

Bot: ✅ access approved. Send a message to start chatting.
```

---

## 12. 工作区与 Bootstrap 文件

### 12.1 工作区目录

默认工作区位于 `~/.goclaw/workspace/`，是 Agent 的"家"，包含：

```
~/.goclaw/workspace/
├── SOUL.md          # Agent 性格与行为准则（Who you are）
├── IDENTITY.md      # Agent 身份（What your name is）
├── AGENTS.md        # 工作区使用指南（How to use this workspace）
├── TOOLS.md         # 工具使用说明
├── USER.md          # 用户信息（Agent 了解你的文件）
├── HEARTBEAT.md     # 心跳任务定义
├── BOOTSTRAP.md     # 初始化脚本（首次运行后清空）
├── memory/          # 每日记忆文件（YYYY-MM-DD.md）
├── MEMORY.md        # 长期记忆（仅主会话加载，私密）
└── memory.db        # SQLite FTS 记忆索引
```

这些文件在第一次启动时由内置模板自动创建（`bootstrap.EnsureWorkspaceFiles`）。

### 12.2 自定义 Bootstrap 文件

所有 `.md` 文件都可以直接编辑，Agent 每次启动会重新读取。

**USER.md** 是最重要的自定义文件，告诉 Agent 关于你的信息：

```markdown
# USER.md — About You

## Who You Are
Name: 张三
Role: 后端工程师
Location: 上海
Language: 中文

## Preferences
- 喜欢简洁的回答，不要废话
- 代码示例优先于文字说明
- 遇到不确定的事情直接说不知道

## Current Projects
- GoClaw 项目开发
- ...
```

### 12.3 技能文件（Skills）

技能是 Markdown 格式的"工具说明书"，Agent 通过 `skill_search` 工具检索后按照说明执行任务。

```
~/.goclaw/skills/
└── my-tool/
    └── SKILL.md    # 技能说明文件
```

**SKILL.md 格式示例：**

```markdown
# 部署到生产环境

## 触发词
deploy, 部署, production, 生产环境

## 步骤
1. 运行 `make test` 确认测试通过
2. 运行 `git tag v$(date +%Y%m%d)` 创建版本 Tag
3. 运行 `make deploy` 执行部署
4. 检查 `https://your-app.com/health` 确认部署成功

## 注意事项
- 只在工作时间部署（9:00-18:00）
- 部署前确认 staging 环境正常
```

技能目录也可通过 Web 控制台 `/skills` 页面上传和管理。

---

## 13. MCP 工具服务器配置

Model Context Protocol（MCP）允许连接外部工具服务器，扩展 Agent 能力。

### 13.1 Standalone 模式（config.json）

```json5
{
  "mcp": {
    "servers": {
      // stdio 传输（本地子进程）
      "filesystem": {
        "transport": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
        "env": {}
      },

      // SSE 传输（远程 HTTP）
      "remote-tools": {
        "transport": "sse",
        "url": "https://mcp.example.com/sse"
      },

      // Streamable HTTP（新标准）
      "search-tools": {
        "transport": "streamable-http",
        "url": "https://mcp.example.com/tools"
      }
    }
  }
}
```

### 13.2 Managed 模式（Web 控制台）

1. 打开 `http://localhost:5173/mcp`
2. 点击 **Add Server**，填入传输方式和地址
3. 可设置 **Tool Prefix**（避免工具名冲突，如 `fs__read_file`）
4. 通过 **Manage Grants** 控制哪些 Agent 可访问此 MCP 服务器

### 13.3 常用 MCP 服务器

```bash
# 安装官方 MCP 服务器
npm install -g @modelcontextprotocol/server-filesystem
npm install -g @modelcontextprotocol/server-github
npm install -g @modelcontextprotocol/server-postgres
npm install -g @modelcontextprotocol/server-brave-search
```

---

## 14. 系统自检（doctor）

`doctor` 命令检查配置、连接、工具等各项状态，排查问题时首先运行：

```bash
source .env && ./goclaw doctor
```

输出示例：

```
goclaw doctor
  Version:  dev (protocol 3)
  OS:       darwin/amd64
  Go:       go1.26.0

  Config:   config.json (OK)

  Gateway:
    Host         0.0.0.0:18790
    Token        *** (set)
    RateLimitRPM 20

  Providers (from config):
    openrouter    API key: *** (set)    model: anthropic/claude-sonnet-4-5-...

  Workspace:
    Path       /Users/xxx/.goclaw/workspace  (OK)
    SOUL.md    OK
    IDENTITY.md OK
    USER.md     OK

  Memory:
    Mode       fts-only (no embedding provider)
    DB         /Users/xxx/.goclaw/workspace/memory.db (OK)

  Browser:    enabled (headless)
  Web search: DuckDuckGo enabled

  Channels:
    telegram   disabled
    discord    disabled

  Overall:   OK
```

---

## 15. 常见问题排查

### Q1: `package X is not in std` 编译失败

**原因：** macOS Homebrew 安装的 Go，GOROOT 指向了缺少标准库源码的路径。

```bash
# 检测
ls "$(go env GOROOT)/src/archive/tar" 2>/dev/null || echo "GOROOT incorrect"

# 修复（加入 ~/.zshrc 永久生效）
export GOROOT="$(brew --prefix go)/libexec"
source ~/.zshrc

# 重新编译
make build
```

### Q2: 启动提示 "No AI provider API key found"

```bash
# 确认已 source 了包含 API Key 的文件
echo $GOCLAW_OPENROUTER_API_KEY   # 应该有值

# 重新 source
source .env && ./goclaw
# 或
source .env.local && ./goclaw
```

### Q3: 前端无法连接后端（WebSocket 连接失败）

```bash
# 1. 确认后端在运行
curl http://localhost:18790/health   # 应返回 {"status":"ok"}

# 2. 确认 Vite 代理端口正确
cat ui/web/.env.local   # 确认 VITE_BACKEND_PORT=18790

# 3. 如果没有 .env.local，创建它
echo "VITE_BACKEND_PORT=18790" > ui/web/.env.local
pnpm dev  # 重启前端
```

### Q4: MiniMax 401 invalid api key

**常见原因：**
1. API Key 带有错误前缀（如 `sk-api-` 前缀）
2. API Key 已过期或被撤销

```bash
# 检查 .env 中的 key 格式（MiniMax 不需要任何前缀）
# 正确: GOCLAW_MINIMAX_API_KEY=Yw8FgFk2ABxY...
# 错误: GOCLAW_MINIMAX_API_KEY=sk-api-Yw8FgFk2ABxY...

# 通过 API 更新已在数据库中的 Key（Managed 模式）
curl -X PUT http://localhost:18790/v1/providers/<provider-id> \
  -H "Authorization: Bearer $GOCLAW_GATEWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"api_key":"<正确的Key>"}'
```

### Q5: PostgreSQL 连接失败

```bash
# 验证 DSN 可用性
psql "postgres://goclaw:goclaw@localhost:5432/goclaw?sslmode=disable" -c "SELECT 1"

# 确认 pgvector 扩展已安装
psql ... -c "SELECT * FROM pg_extension WHERE extname = 'vector';"

# 使用 pgvector 镜像（自动包含扩展）
docker run -d pgvector/pgvector:pg18 ...
```

### Q6: 迁移失败 / 版本记录损坏

```bash
# 查看当前状态
./goclaw migrate version

# 如果提示 "dirty"，需要 force 修复
./goclaw migrate force 6   # 强制设为最新版本（危险，仅数据库与代码确实对齐时使用）

# 然后重新运行
./goclaw migrate up
```

### Q7: Agent 没有响应（浏览器工具问题）

浏览器工具需要 Chrome/Chromium，若系统未安装会自动下载。首次使用会慢，可禁用：

```json5
// config.json
{
  "tools": {
    "browser": {
      "enabled": false
    }
  }
}
```

### Q8: 日志分析

```bash
# 查看 WARN 级别（包含安全事件）
./goclaw 2>&1 | grep 'level=WARN'

# 开启 Debug 日志
GOCLAW_TRACE_VERBOSE=1 ./goclaw -v 2>&1 | less

# 过滤特定组件
./goclaw 2>&1 | grep 'msg="memory\|browser\|provider'
```

---

## 快速参考卡

```bash
# ── 编译 ──────────────────────────────────────────────────────
make build                           # 标准编译
CGO_ENABLED=0 go build -tags otel . # 含 OTel
./goclaw version                     # 验证

# ── 初始化 ────────────────────────────────────────────────────
./prepare-env.sh                     # 生成 .env 并自动填入 Token
vim .env                             # 填入 LLM API Key

# ── 启动（Standalone） ─────────────────────────────────────────
source .env && ./goclaw              # 自动 onboard + 启动
./goclaw onboard                     # 交互式配置向导
source .env.local && ./goclaw        # 向导后的启动方式

# ── 启动（Managed） ───────────────────────────────────────────
source .env && ./goclaw migrate up   # 执行迁移
source .env && ./goclaw              # 启动

# ── 健康检查 ──────────────────────────────────────────────────
curl http://localhost:18790/health   # {"status":"ok","protocol":3}
./goclaw doctor                      # 完整系统自检

# ── 前端 ──────────────────────────────────────────────────────
echo "VITE_BACKEND_PORT=18790" > ui/web/.env.local
cd ui/web && pnpm install && pnpm dev  # http://localhost:5173

# ── 常用命令 ──────────────────────────────────────────────────
./goclaw migrate version             # 数据库迁移版本
./goclaw pairing list                # 待审批配对
./goclaw pairing approve <code>      # 批准配对码
./goclaw agent list                  # 列出 Agent
./goclaw skills list                 # 列出技能
./goclaw sessions list               # 列出会话
```
