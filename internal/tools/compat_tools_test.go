package tools

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/nextlevelbuilder/goclaw/internal/bus"
	"github.com/nextlevelbuilder/goclaw/internal/sessions"
	fileStore "github.com/nextlevelbuilder/goclaw/internal/store/file"
)

func TestSearchToolFindsMatches(t *testing.T) {
	tmp := t.TempDir()
	if err := os.WriteFile(filepath.Join(tmp, "a.txt"), []byte("hello\nworld\nhello"), 0644); err != nil {
		t.Fatal(err)
	}
	tool := NewSearchTool(tmp, true)
	res := tool.Execute(context.Background(), map[string]interface{}{
		"path":        ".",
		"pattern":     "hello",
		"max_results": float64(10),
	})
	if res.IsError {
		t.Fatalf("unexpected error: %s", res.ForLLM)
	}
	var out struct {
		Count int `json:"count"`
	}
	if err := json.Unmarshal([]byte(res.ForLLM), &out); err != nil {
		t.Fatalf("bad json: %v", err)
	}
	if out.Count != 2 {
		t.Fatalf("expected 2 matches, got %d", out.Count)
	}
}

func TestGlobToolMatchesPattern(t *testing.T) {
	tmp := t.TempDir()
	if err := os.MkdirAll(filepath.Join(tmp, "dir"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(tmp, "dir", "x.go"), []byte("package dir"), 0644); err != nil {
		t.Fatal(err)
	}
	tool := NewGlobTool(tmp, true)
	res := tool.Execute(context.Background(), map[string]interface{}{
		"path":        ".",
		"pattern":     "**/*.go",
		"max_results": float64(10),
	})
	if res.IsError {
		t.Fatalf("unexpected error: %s", res.ForLLM)
	}
	if !strings.Contains(res.ForLLM, "x.go") {
		t.Fatalf("expected glob output to contain x.go, got %s", res.ForLLM)
	}
}

func TestProcessToolList(t *testing.T) {
	tool := NewProcessTool()
	res := tool.Execute(context.Background(), map[string]interface{}{
		"action": "list",
	})
	if res.IsError {
		t.Fatalf("unexpected error: %s", res.ForLLM)
	}
	if !strings.Contains(res.ForLLM, "PID") {
		t.Fatalf("expected ps header in output, got %q", res.ForLLM)
	}
}

func TestGatewayToolStatusAndHealth(t *testing.T) {
	tool := NewGatewayTool()
	status := tool.Execute(context.Background(), map[string]interface{}{"action": "status"})
	if status.IsError || !strings.Contains(status.ForLLM, `"status":"running"`) {
		t.Fatalf("unexpected status response: %+v", status)
	}

	// Health endpoint should be deterministic in tests.
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	health := tool.Execute(ctx, map[string]interface{}{
		"action":     "health",
		"url":        "http://127.0.0.1:1",
		"timeout_ms": float64(100),
	})
	if !health.IsError {
		t.Fatalf("expected health check failure for invalid endpoint, got %s", health.ForLLM)
	}
}

func TestSessionsSpawnToolCreatesSessionAndPublishesMessage(t *testing.T) {
	tmp := t.TempDir()
	mgr := sessions.NewManager(tmp)
	sStore := fileStore.NewFileSessionStore(mgr)
	msgBus := bus.New()

	tool := NewSessionsSpawnTool()
	tool.SetSessionStore(sStore)
	tool.SetMessageBus(msgBus)

	res := tool.Execute(context.Background(), map[string]interface{}{
		"label":   "new-session",
		"message": "hello from test",
	})
	if res.IsError {
		t.Fatalf("unexpected error: %s", res.ForLLM)
	}

	cctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	msg, ok := msgBus.ConsumeInbound(cctx)
	if !ok {
		t.Fatal("expected inbound message")
	}
	if msg.Content != "hello from test" {
		t.Fatalf("unexpected message: %q", msg.Content)
	}
	if !strings.Contains(res.ForLLM, `"status":"created"`) {
		t.Fatalf("unexpected result payload: %s", res.ForLLM)
	}
}
