package tools

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/nextlevelbuilder/goclaw/internal/bus"
	"github.com/nextlevelbuilder/goclaw/internal/sessions"
	"github.com/nextlevelbuilder/goclaw/internal/store"
)

// AliasTool exposes an existing tool under a compatibility name.
type AliasTool struct {
	name        string
	description string
	target      Tool
}

func NewAliasTool(name, description string, target Tool) *AliasTool {
	return &AliasTool{name: name, description: description, target: target}
}

func (t *AliasTool) Name() string        { return t.name }
func (t *AliasTool) Description() string { return t.description }
func (t *AliasTool) Parameters() map[string]interface{} {
	return t.target.Parameters()
}
func (t *AliasTool) Execute(ctx context.Context, args map[string]interface{}) *Result {
	return t.target.Execute(ctx, args)
}

type SearchTool struct {
	workspace      string
	restrict       bool
	deniedPrefixes []string
}

func NewSearchTool(workspace string, restrict bool) *SearchTool {
	return &SearchTool{workspace: workspace, restrict: restrict}
}

func (t *SearchTool) DenyPaths(prefixes ...string) {
	t.deniedPrefixes = append(t.deniedPrefixes, prefixes...)
}
func (t *SearchTool) Name() string        { return "search" }
func (t *SearchTool) Description() string { return "Search file contents by text pattern" }
func (t *SearchTool) Parameters() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"path":           map[string]interface{}{"type": "string", "description": "Root path to search (default: workspace root)"},
			"pattern":        map[string]interface{}{"type": "string", "description": "Text pattern to search for"},
			"case_sensitive": map[string]interface{}{"type": "boolean", "description": "Case-sensitive search (default false)"},
			"max_results":    map[string]interface{}{"type": "number", "description": "Maximum matches to return (default 200, max 1000)"},
		},
		"required": []string{"pattern"},
	}
}

func (t *SearchTool) Execute(ctx context.Context, args map[string]interface{}) *Result {
	pattern, _ := args["pattern"].(string)
	if strings.TrimSpace(pattern) == "" {
		return ErrorResult("pattern is required")
	}
	path, _ := args["path"].(string)
	if path == "" {
		path = "."
	}
	caseSensitive, _ := args["case_sensitive"].(bool)
	maxResults := 200
	if v, ok := args["max_results"].(float64); ok && int(v) > 0 {
		maxResults = min(int(v), 1000)
	}

	workspace := ToolWorkspaceFromCtx(ctx)
	if workspace == "" {
		workspace = t.workspace
	}
	root, err := resolvePath(path, workspace, t.restrict)
	if err != nil {
		return ErrorResult(err.Error())
	}
	if err := checkDeniedPath(root, t.workspace, t.deniedPrefixes); err != nil {
		return ErrorResult(err.Error())
	}

	type match struct {
		Path string `json:"path"`
		Line int    `json:"line"`
		Text string `json:"text"`
	}
	matches := make([]match, 0, min(maxResults, 64))
	needle := pattern
	if !caseSensitive {
		needle = strings.ToLower(pattern)
	}

	_ = filepath.WalkDir(root, func(p string, d os.DirEntry, walkErr error) error {
		if walkErr != nil || len(matches) >= maxResults {
			return walkErr
		}
		if d.IsDir() {
			if checkDeniedPath(p, t.workspace, t.deniedPrefixes) != nil {
				return filepath.SkipDir
			}
			return nil
		}
		if d.Type()&os.ModeSymlink != 0 {
			return nil
		}
		data, err := os.ReadFile(p)
		if err != nil || len(data) > 2*1024*1024 {
			return nil
		}
		lines := strings.Split(string(data), "\n")
		for i, line := range lines {
			hay := line
			if !caseSensitive {
				hay = strings.ToLower(line)
			}
			if strings.Contains(hay, needle) {
				rel, rerr := filepath.Rel(workspace, p)
				if rerr != nil {
					rel = p
				}
				matches = append(matches, match{Path: filepath.ToSlash(rel), Line: i + 1, Text: line})
				if len(matches) >= maxResults {
					break
				}
			}
		}
		return nil
	})

	out, _ := json.Marshal(map[string]interface{}{
		"pattern": pattern,
		"count":   len(matches),
		"matches": matches,
	})
	return SilentResult(string(out))
}

type GlobTool struct {
	workspace      string
	restrict       bool
	deniedPrefixes []string
}

func NewGlobTool(workspace string, restrict bool) *GlobTool {
	return &GlobTool{workspace: workspace, restrict: restrict}
}

func (t *GlobTool) DenyPaths(prefixes ...string) {
	t.deniedPrefixes = append(t.deniedPrefixes, prefixes...)
}
func (t *GlobTool) Name() string        { return "glob" }
func (t *GlobTool) Description() string { return "Find files by glob pattern" }
func (t *GlobTool) Parameters() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"path":        map[string]interface{}{"type": "string", "description": "Root path to search (default: workspace root)"},
			"pattern":     map[string]interface{}{"type": "string", "description": "Glob pattern, supports **, *, ?"},
			"max_results": map[string]interface{}{"type": "number", "description": "Maximum files to return (default 200, max 1000)"},
		},
		"required": []string{"pattern"},
	}
}

func (t *GlobTool) Execute(ctx context.Context, args map[string]interface{}) *Result {
	pattern, _ := args["pattern"].(string)
	if strings.TrimSpace(pattern) == "" {
		return ErrorResult("pattern is required")
	}
	path, _ := args["path"].(string)
	if path == "" {
		path = "."
	}
	maxResults := 200
	if v, ok := args["max_results"].(float64); ok && int(v) > 0 {
		maxResults = min(int(v), 1000)
	}
	matcher, err := compileGlob(pattern)
	if err != nil {
		return ErrorResult(fmt.Sprintf("invalid glob pattern: %v", err))
	}

	workspace := ToolWorkspaceFromCtx(ctx)
	if workspace == "" {
		workspace = t.workspace
	}
	root, err := resolvePath(path, workspace, t.restrict)
	if err != nil {
		return ErrorResult(err.Error())
	}
	if err := checkDeniedPath(root, t.workspace, t.deniedPrefixes); err != nil {
		return ErrorResult(err.Error())
	}

	files := make([]string, 0, min(maxResults, 64))
	_ = filepath.WalkDir(root, func(p string, d os.DirEntry, walkErr error) error {
		if walkErr != nil || len(files) >= maxResults {
			return walkErr
		}
		if d.IsDir() {
			if checkDeniedPath(p, t.workspace, t.deniedPrefixes) != nil {
				return filepath.SkipDir
			}
			return nil
		}
		rel, rerr := filepath.Rel(root, p)
		if rerr != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		if matcher.MatchString(rel) {
			files = append(files, rel)
		}
		return nil
	})

	out, _ := json.Marshal(map[string]interface{}{
		"pattern": pattern,
		"count":   len(files),
		"files":   files,
	})
	return SilentResult(string(out))
}

type ProcessTool struct{}

func NewProcessTool() *ProcessTool         { return &ProcessTool{} }
func (t *ProcessTool) Name() string        { return "process" }
func (t *ProcessTool) Description() string { return "List, inspect, and signal running processes" }
func (t *ProcessTool) Parameters() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"action": map[string]interface{}{"type": "string", "enum": []string{"list", "inspect", "kill"}, "description": "Default: list"},
			"pid":    map[string]interface{}{"type": "number", "description": "Target process ID for inspect/kill"},
			"signal": map[string]interface{}{"type": "string", "description": "Signal for kill (TERM, KILL, INT). Default TERM"},
		},
	}
}
func (t *ProcessTool) Execute(ctx context.Context, args map[string]interface{}) *Result {
	action, _ := args["action"].(string)
	if action == "" {
		action = "list"
	}
	switch action {
	case "inspect":
		pid, err := parsePID(args["pid"])
		if err != nil {
			return ErrorResult(err.Error())
		}
		return runPs(ctx, "-p", strconv.Itoa(pid), "-o", "pid=,ppid=,stat=,etime=,command=")
	case "kill":
		pid, err := parsePID(args["pid"])
		if err != nil {
			return ErrorResult(err.Error())
		}
		sigName, _ := args["signal"].(string)
		sig := toSignal(sigName)
		proc, err := os.FindProcess(pid)
		if err != nil {
			return ErrorResult(fmt.Sprintf("find process failed: %v", err))
		}
		if err := proc.Signal(sig); err != nil {
			return ErrorResult(fmt.Sprintf("signal failed: %v", err))
		}
		return SilentResult(fmt.Sprintf(`{"status":"signaled","pid":%d,"signal":"%s"}`, pid, signalName(sig)))
	default:
		return runPs(ctx, "-eo", "pid,ppid,stat,etime,command", "-ax")
	}
}

type GatewayTool struct {
	startedAt time.Time
}

func NewGatewayTool() *GatewayTool { return &GatewayTool{startedAt: time.Now()} }
func (t *GatewayTool) Name() string {
	return "gateway"
}
func (t *GatewayTool) Description() string {
	return "Gateway administration helpers: status and HTTP health checks"
}
func (t *GatewayTool) Parameters() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"action":     map[string]interface{}{"type": "string", "enum": []string{"status", "health"}, "description": "Default: status"},
			"url":        map[string]interface{}{"type": "string", "description": "Health URL for action=health (default http://127.0.0.1:18790/v1/providers)"},
			"timeout_ms": map[string]interface{}{"type": "number", "description": "HTTP timeout for action=health (default 5000)"},
		},
	}
}
func (t *GatewayTool) Execute(ctx context.Context, args map[string]interface{}) *Result {
	action, _ := args["action"].(string)
	if action == "" {
		action = "status"
	}
	if action != "health" {
		uptime := time.Since(t.startedAt).Round(time.Second)
		return SilentResult(fmt.Sprintf(`{"status":"running","uptime":"%s","now":"%s"}`, uptime, time.Now().Format(time.RFC3339)))
	}
	url, _ := args["url"].(string)
	if url == "" {
		url = "http://127.0.0.1:18790/v1/providers"
	}
	timeout := 5000
	if v, ok := args["timeout_ms"].(float64); ok && int(v) > 0 {
		timeout = int(v)
	}
	client := &http.Client{Timeout: time.Duration(timeout) * time.Millisecond}
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	resp, err := client.Do(req)
	if err != nil {
		return ErrorResult(fmt.Sprintf("health check failed: %v", err))
	}
	defer resp.Body.Close()
	return SilentResult(fmt.Sprintf(`{"url":"%s","status_code":%d}`, url, resp.StatusCode))
}

type CanvasTool struct {
	workspace string
	restrict  bool
}

func NewCanvasTool(workspace string, restrict bool) *CanvasTool {
	return &CanvasTool{workspace: workspace, restrict: restrict}
}

func (t *CanvasTool) Name() string        { return "canvas" }
func (t *CanvasTool) Description() string { return "Create a Mermaid diagram canvas markdown file" }
func (t *CanvasTool) Parameters() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"title":   map[string]interface{}{"type": "string", "description": "Diagram title"},
			"diagram": map[string]interface{}{"type": "string", "description": "Mermaid body, e.g. graph TD; A-->B"},
			"path":    map[string]interface{}{"type": "string", "description": "Output markdown path (default: canvas/<timestamp>.md)"},
		},
	}
}

func (t *CanvasTool) Execute(ctx context.Context, args map[string]interface{}) *Result {
	title, _ := args["title"].(string)
	diagram, _ := args["diagram"].(string)
	if strings.TrimSpace(diagram) == "" {
		diagram = "graph TD\n  A[Start] --> B[Describe your flow]"
	}
	path, _ := args["path"].(string)
	if path == "" {
		path = filepath.ToSlash(filepath.Join("canvas", fmt.Sprintf("diagram-%d.md", time.Now().Unix())))
	}
	workspace := ToolWorkspaceFromCtx(ctx)
	if workspace == "" {
		workspace = t.workspace
	}
	resolved, err := resolvePath(path, workspace, t.restrict)
	if err != nil {
		return ErrorResult(err.Error())
	}
	if err := os.MkdirAll(filepath.Dir(resolved), 0755); err != nil {
		return ErrorResult(fmt.Sprintf("failed to create directory: %v", err))
	}
	if title == "" {
		title = "Canvas Diagram"
	}
	content := fmt.Sprintf("# %s\n\n```mermaid\n%s\n```\n", title, diagram)
	if err := os.WriteFile(resolved, []byte(content), 0644); err != nil {
		return ErrorResult(fmt.Sprintf("failed to write canvas: %v", err))
	}
	return SilentResult(fmt.Sprintf(`{"status":"created","path":"%s"}`, path))
}

type SessionsSpawnTool struct {
	sessions store.SessionStore
	msgBus   *bus.MessageBus
}

func NewSessionsSpawnTool() *SessionsSpawnTool                    { return &SessionsSpawnTool{} }
func (t *SessionsSpawnTool) SetSessionStore(s store.SessionStore) { t.sessions = s }
func (t *SessionsSpawnTool) SetMessageBus(b *bus.MessageBus)      { t.msgBus = b }
func (t *SessionsSpawnTool) Name() string                         { return "sessions_spawn" }
func (t *SessionsSpawnTool) Description() string {
	return "Spawn a new session and optionally send an initial message"
}
func (t *SessionsSpawnTool) Parameters() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"session_key": map[string]interface{}{"type": "string", "description": "Custom session key (optional)"},
			"label":       map[string]interface{}{"type": "string", "description": "Session label"},
			"channel":     map[string]interface{}{"type": "string", "description": "Channel for generated key (default system)"},
			"chat_id":     map[string]interface{}{"type": "string", "description": "Chat ID for generated key (default random)"},
			"peer_kind":   map[string]interface{}{"type": "string", "enum": []string{"direct", "group"}, "description": "Peer kind for generated key (default direct)"},
			"message":     map[string]interface{}{"type": "string", "description": "Optional initial message to send"},
		},
	}
}
func (t *SessionsSpawnTool) Execute(ctx context.Context, args map[string]interface{}) *Result {
	if t.sessions == nil {
		return ErrorResult("session store not available")
	}
	sessionKey, _ := args["session_key"].(string)
	channel, _ := args["channel"].(string)
	if channel == "" {
		channel = "system"
	}
	chatID, _ := args["chat_id"].(string)
	if chatID == "" {
		chatID = uuid.NewString()[:8]
	}
	peerKind, _ := args["peer_kind"].(string)
	if peerKind == "" {
		peerKind = string(sessions.PeerDirect)
	}
	agentID := resolveAgentIDString(ctx)
	if agentID == "" {
		agentID = "default"
	}
	if sessionKey == "" {
		sessionKey = sessions.BuildSessionKey(agentID, channel, sessions.PeerKind(peerKind), chatID)
	}

	_ = t.sessions.GetOrCreate(sessionKey)
	if label, _ := args["label"].(string); label != "" {
		t.sessions.SetLabel(sessionKey, label)
	}
	_ = t.sessions.Save(sessionKey)

	message, _ := args["message"].(string)
	if strings.TrimSpace(message) != "" && t.msgBus != nil {
		t.msgBus.PublishInbound(bus.InboundMessage{
			Channel:  "system",
			SenderID: "sessions_spawn_tool",
			ChatID:   sessionKey,
			Content:  message,
			PeerKind: "direct",
		})
	}

	return SilentResult(fmt.Sprintf(`{"status":"created","session_key":"%s"}`, sessionKey))
}
func runPs(ctx context.Context, args ...string) *Result {
	cmd := exec.CommandContext(ctx, "ps", args...)
	out, err := cmd.CombinedOutput()
	if err == nil {
		return SilentResult(string(out))
	}
	// BusyBox ps in minimal containers doesn't support BSD/GNU flags.
	fallback := exec.CommandContext(ctx, "ps")
	out2, err2 := fallback.CombinedOutput()
	if err2 != nil {
		return ErrorResult(fmt.Sprintf("process command failed: %v", err))
	}
	return SilentResult(string(out2))
}

func parsePID(raw interface{}) (int, error) {
	v, ok := raw.(float64)
	if !ok || int(v) <= 0 {
		return 0, errors.New("pid is required and must be > 0")
	}
	return int(v), nil
}

func toSignal(sig string) syscall.Signal {
	switch strings.ToUpper(strings.TrimSpace(sig)) {
	case "KILL", "SIGKILL":
		return syscall.SIGKILL
	case "INT", "SIGINT":
		return syscall.SIGINT
	default:
		return syscall.SIGTERM
	}
}

func signalName(sig syscall.Signal) string {
	switch sig {
	case syscall.SIGKILL:
		return "SIGKILL"
	case syscall.SIGINT:
		return "SIGINT"
	default:
		return "SIGTERM"
	}
}

func compileGlob(pattern string) (*regexp.Regexp, error) {
	var b strings.Builder
	b.WriteString("^")
	for i := 0; i < len(pattern); i++ {
		ch := pattern[i]
		if ch == '*' {
			if i+1 < len(pattern) && pattern[i+1] == '*' {
				b.WriteString(".*")
				i++
				continue
			}
			b.WriteString("[^/]*")
			continue
		}
		if ch == '?' {
			b.WriteString("[^/]")
			continue
		}
		if strings.ContainsRune(`.+()|[]{}^$\\`, rune(ch)) {
			b.WriteByte('\\')
		}
		b.WriteByte(ch)
	}
	b.WriteString("$")
	return regexp.Compile(b.String())
}
