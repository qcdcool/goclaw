package gateway

import (
	"context"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/nextlevelbuilder/goclaw/pkg/protocol"
)

const (
	ringBufferSize = 100
	redactedValue  = "***"
)

// sensitiveKeys are attribute keys whose values are redacted before forwarding.
var sensitiveKeys = []string{
	"key", "token", "secret", "password", "dsn",
	"credential", "authorization", "cookie",
}

// logTeeState is shared by a LogTee and any handlers created via WithAttrs/WithGroup
// so that clients and ring buffer are protected by a single set of mutexes.
type logTeeState struct {
	mu      sync.RWMutex
	clients map[string]*logSubscriber

	ringMu  sync.RWMutex
	ring    []map[string]interface{}
	ringPos int
	ringFul bool
}

// LogTee is a slog.Handler that forwards log records to subscribed WS clients
// while delegating to an underlying handler for normal output.
type LogTee struct {
	inner slog.Handler
	state *logTeeState
}

// logSubscriber tracks a client and its requested minimum log level.
type logSubscriber struct {
	client *Client
	level  slog.Level
}

// NewLogTee wraps an existing slog.Handler so log records are also forwarded
// to any WebSocket clients that have started log tailing.
func NewLogTee(inner slog.Handler) *LogTee {
	return &LogTee{
		inner: inner,
		state: &logTeeState{
			clients: make(map[string]*logSubscriber),
			ring:    make([]map[string]interface{}, ringBufferSize),
		},
	}
}

func (t *LogTee) Enabled(ctx context.Context, level slog.Level) bool {
	// Always accept if inner handler wants it.
	if t.inner.Enabled(ctx, level) {
		return true
	}
	// Also accept if any subscriber wants this level (e.g. debug).
	t.state.mu.RLock()
	defer t.state.mu.RUnlock()
	for _, sub := range t.state.clients {
		if level >= sub.level {
			return true
		}
	}
	return false
}

func (t *LogTee) Handle(ctx context.Context, r slog.Record) error {
	s := t.state
	// Build entry for WS clients.
	s.mu.RLock()
	n := len(s.clients)
	s.mu.RUnlock()

	needEntry := n > 0 // need to broadcast
	// Always build entry for ring buffer regardless of subscribers.
	entry := t.buildEntry(r)

	// Store in ring buffer.
	s.ringMu.Lock()
	s.ring[s.ringPos] = entry
	s.ringPos = (s.ringPos + 1) % ringBufferSize
	if s.ringPos == 0 {
		s.ringFul = true
	}
	s.ringMu.Unlock()

	// Forward to subscribers.
	if needEntry {
		evt := protocol.NewEvent("log", entry)
		level := r.Level

		s.mu.RLock()
		for _, sub := range s.clients {
			if level >= sub.level {
				sub.client.SendEvent(*evt)
			}
		}
		s.mu.RUnlock()
	}

	// Forward to inner handler only if it accepts this level.
	if t.inner.Enabled(ctx, r.Level) {
		return t.inner.Handle(ctx, r)
	}
	return nil
}

// buildEntry creates the WS payload from a log record, redacting sensitive attrs.
func (t *LogTee) buildEntry(r slog.Record) map[string]interface{} {
	entry := map[string]interface{}{
		"timestamp": r.Time.UnixMilli(),
		"level":     levelName(r.Level),
		"message":   r.Message,
	}

	attrs := map[string]interface{}{}
	r.Attrs(func(a slog.Attr) bool {
		key := a.Key
		val := a.Value.String()

		// Extract source hint.
		if key == "component" || key == "source" || key == "module" {
			entry["source"] = val
			return true
		}

		// Redact sensitive values.
		if isSensitiveKey(key) {
			attrs[key] = redactedValue
		} else {
			attrs[key] = val
		}
		return true
	})

	if len(attrs) > 0 {
		entry["attrs"] = attrs
	}

	return entry
}

func (t *LogTee) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &LogTee{
		inner: t.inner.WithAttrs(attrs),
		state: t.state,
	}
}

func (t *LogTee) WithGroup(name string) slog.Handler {
	return &LogTee{
		inner: t.inner.WithGroup(name),
		state: t.state,
	}
}

// Subscribe adds a client to the log tailing set at the given level.
// Pass slog.LevelInfo for default, slog.LevelDebug for verbose.
func (t *LogTee) Subscribe(client *Client, level slog.Level) {
	s := t.state
	s.mu.Lock()
	s.clients[client.ID()] = &logSubscriber{client: client, level: level}
	s.mu.Unlock()

	// Replay ring buffer entries at the requested level.
	s.ringMu.RLock()
	var entries []map[string]interface{}
	if s.ringFul {
		// Buffer is full — read from ringPos (oldest) to ringPos-1 (newest).
		for i := 0; i < ringBufferSize; i++ {
			idx := (s.ringPos + i) % ringBufferSize
			e := s.ring[idx]
			if e != nil && logLevelValue(e["level"]) >= level {
				entries = append(entries, e)
			}
		}
	} else {
		// Buffer not full — read from 0 to ringPos-1.
		for i := 0; i < s.ringPos; i++ {
			e := s.ring[i]
			if e != nil && logLevelValue(e["level"]) >= level {
				entries = append(entries, e)
			}
		}
	}
	s.ringMu.RUnlock()

	for _, e := range entries {
		client.SendEvent(*protocol.NewEvent("log", e))
	}

	// Send sentinel so the client knows tailing started.
	client.SendEvent(*protocol.NewEvent("log", map[string]interface{}{
		"timestamp": time.Now().UnixMilli(),
		"level":     "info",
		"message":   "Log tailing started",
		"source":    "gateway",
	}))
}

// Unsubscribe removes a client from the log tailing set.
func (t *LogTee) Unsubscribe(clientID string) {
	t.state.mu.Lock()
	delete(t.state.clients, clientID)
	t.state.mu.Unlock()
}

func levelName(l slog.Level) string {
	switch {
	case l >= slog.LevelError:
		return "error"
	case l >= slog.LevelWarn:
		return "warn"
	case l >= slog.LevelInfo:
		return "info"
	default:
		return "debug"
	}
}

// logLevelValue converts a level name string back to slog.Level for filtering.
func logLevelValue(v interface{}) slog.Level {
	s, _ := v.(string)
	switch s {
	case "error":
		return slog.LevelError
	case "warn":
		return slog.LevelWarn
	case "info":
		return slog.LevelInfo
	case "debug":
		return slog.LevelDebug
	default:
		return slog.LevelInfo
	}
}

func isSensitiveKey(key string) bool {
	lower := strings.ToLower(key)
	for _, s := range sensitiveKeys {
		if strings.Contains(lower, s) {
			return true
		}
	}
	return false
}
