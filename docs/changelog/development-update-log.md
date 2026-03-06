# Development Update Log

## 2026-02-28

### 目标
- 对照 `README.md` 功能声明做实现核对、缺口补齐、运行验证与缺陷修复。

### 本次新增与改动
- 新增工具实现：`search`、`glob`、`process`、`gateway`、`canvas`、`sessions_spawn`。
- 新增兼容别名：`edit_file` -> `edit`，`subagents` -> `subagent`，`image` -> `create_image`。
- 修复工具策略与分组不一致问题，确保策略过滤与真实工具注册一致。
- 修复 `tools/invoke` 在 managed 模式下的上下文注入（agent/workspace）问题。
- 修复路径解析在新建多级目录场景下的误拒绝问题。
- 修复 `sessions_spawn` 未注入 session store 导致不可用问题。
- 修复 `process` 在容器内 `ps` 参数兼容问题（增加回退逻辑）。
- 增加兼容工具测试文件，覆盖新增工具核心行为。

### 关键改动文件
- `internal/tools/compat_tools.go`
- `internal/tools/compat_tools_test.go`
- `cmd/gateway.go`
- `cmd/gateway_builtin_tools.go`
- `internal/tools/policy.go`
- `internal/http/tools_invoke.go`
- `internal/tools/filesystem.go`
- `ui/web/eslint.config.mjs`
- `ui/web/package.json`
- `ui/web/pnpm-lock.yaml`

### 已完成验证
- Go 容器内全量测试：`go test ./...` 通过。
- 修改相关包测试：`go test ./internal/tools ./internal/http ./cmd` 通过。
- 后端容器构建与启动：`docker compose ... up -d --build goclaw` 通过。
- 前端构建：`pnpm build` 通过。
- 前端 lint：`pnpm lint` 可执行（当前为 warnings，无 errors）。
- 运行态 API 烟测：`/v1/providers`、`/v1/tools/builtin`、`/v1/tools/custom`、`/v1/channels/instances`、`/v1/delegations`、`/v1/traces`、`/v1/mcp/servers`、`/v1/agents`（带 `X-GoClaw-User-Id`）通过。
- 新增工具实调（`POST /v1/tools/invoke`）通过：`search`、`glob`、`process`、`gateway`、`canvas`、`sessions_spawn`。
- 内置工具清单核验通过：`search/glob/process/gateway/canvas/sessions_spawn/edit_file/subagents/image` 均已出现在 `/v1/tools/builtin`。

### 本次发现并修复的问题
- README 工具声明与实现/命名不一致导致的可用性缺口。
- `sessions_spawn` 运行时报错 `session store not available`。
- `canvas` 写入新路径时报错 `access denied: cannot resolve path`。
- `process` 在容器环境中的 `ps` 调用失败。
- `tools/invoke` 在 managed 模式下缺少 agent workspace 上下文，导致部分工具无法正确解析路径。

### 备注
- 仓库中存在用户先前未完成变更（与本次无关的文件修改），本日志仅记录本次自主开发与验证内容。
