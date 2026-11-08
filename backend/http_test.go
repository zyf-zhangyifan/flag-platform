package main

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHTTPHandlerRouting(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<h1>Flag Studio</h1>"), 0600); err != nil {
		t.Fatal(err)
	}
	handler := (&App{}).handler(dir)
	for _, tt := range []struct {
		method, path string
		status       int
		contains     string
	}{
		{"GET", "/", 200, "Flag Studio"},
		{"GET", "/api/unknown", 404, "API"},
		{"POST", "/", 405, "error"},
		{"GET", "/missing.js", 404, "404"},
	} {
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, httptest.NewRequest(tt.method, tt.path, nil))
		if rec.Code != tt.status || !strings.Contains(rec.Body.String(), tt.contains) {
			t.Errorf("%s %s: %d %s", tt.method, tt.path, rec.Code, rec.Body.String())
		}
	}
}
