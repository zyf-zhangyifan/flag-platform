package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

// Every run gets an isolated schema; no production tables are truncated.
func testDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to run real PostgreSQL integration tests")
	}
	ctx := context.Background()
	admin, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	schema := fmt.Sprintf("test_%d", time.Now().UnixNano())
	if _, err = admin.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		admin.Close()
		t.Fatal(err)
	}
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	db, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		db.Close()
		_, err := admin.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE")
		if err != nil {
			t.Error(err)
		}
		admin.Close()
	})
	if err = migrate(ctx, db, false); err != nil {
		t.Fatal(err)
	}
	return db
}

type testClient struct {
	t   *testing.T
	url string
}

func (c testClient) call(method, path string, body any, want int) []byte {
	c.t.Helper()
	var raw []byte
	var err error
	if s, ok := body.(string); ok {
		raw = []byte(s)
	} else if body != nil {
		raw, err = json.Marshal(body)
		if err != nil {
			c.t.Fatal(err)
		}
	}
	req, err := http.NewRequest(method, c.url+path, bytes.NewReader(raw))
	if err != nil {
		c.t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(res.Body)
	if res.StatusCode != want {
		c.t.Fatalf("%s %s: want %d, got %d: %s", method, path, want, res.StatusCode, data)
	}
	return data
}
func flagBody(key, env string) map[string]any {
	return map[string]any{"name": "测试 Flag", "key": key, "environment": env, "enabled": true, "default_value": false}
}
func ruleBody(priority int) map[string]any {
	return map[string]any{"attribute": "country", "operator": "equals", "expected": "CN", "result": true, "priority": priority}
}
func TestIntegrationLifecycle(t *testing.T) {
	db := testDB(t)
	server := httptest.NewServer((&App{DB: db}).routes())
	defer server.Close()
	c := testClient{t, server.URL}
	c.call("GET", "/api/health", nil, 200)
	create := flagBody("checkout_v2", "production")
	create["description"] = "结算流程说明"
	var f Flag
	json.Unmarshal(c.call("POST", "/api/flags", create, 201), &f)
	if f.Description != "结算流程说明" {
		t.Fatalf("description was not persisted: %+v", f)
	}
	base := fmt.Sprintf("/api/flags/%d", f.ID)
	c.call("POST", "/api/flags", flagBody("checkout_v2", "production"), 409)
	c.call("POST", "/api/flags", flagBody("checkout_v2", "staging"), 201)
	var rule Rule
	json.Unmarshal(c.call("POST", base+"/rules", ruleBody(10), 200), &rule)
	c.call("POST", base+"/rules", ruleBody(10), 409)
	var d Detail
	json.Unmarshal(c.call("GET", base, nil, 200), &d)
	if len(d.History) != 2 || len(d.Rules) != 1 {
		t.Fatalf("failed requests left changes: %+v", d)
	}
	c.call("PUT", base, create, 200)
	c.call("PATCH", base+"/enabled", map[string]bool{"enabled": true}, 200)
	var unchanged Detail
	json.Unmarshal(c.call("GET", base, nil, 200), &unchanged)
	if len(unchanged.History) != len(d.History) || !unchanged.Flag.UpdatedAt.Equal(d.Flag.UpdatedAt) {
		t.Fatal("no-op requests must not update timestamps or generate fake history")
	}
	eval := map[string]any{"key": "checkout_v2", "environment": "production", "attributes": map[string]any{"country": "CN"}}
	var e Evaluation
	json.Unmarshal(c.call("POST", "/api/evaluate", eval, 200), &e)
	if !e.Value || !e.Matched || e.MatchedRule.ID != rule.ID {
		t.Fatal(e)
	}
	c.call("PATCH", base+"/enabled", map[string]bool{"enabled": false}, 200)
	json.Unmarshal(c.call("POST", "/api/evaluate", eval, 200), &e)
	if e.Value || e.Reason != "disabled" || len(e.Steps) != 0 {
		t.Fatal(e)
	}
	c.call("PATCH", base+"/enabled", map[string]bool{"enabled": true}, 200)
	changed := flagBody("checkout_v2", "production")
	changed["name"] = "修改后的名称"
	changed["default_value"] = true
	changed["description"] = "已修改的描述"
	c.call("PUT", base, changed, 200)
	var updated Detail
	json.Unmarshal(c.call("GET", base, nil, 200), &updated)
	if updated.Flag.Description != "已修改的描述" {
		t.Fatalf("description update did not persist: %+v", updated.Flag)
	}
	updatedRule := ruleBody(20)
	updatedRule["result"] = false
	c.call("PUT", fmt.Sprintf("%s/rules/%d", base, rule.ID), updatedRule, 200)
	json.Unmarshal(c.call("POST", "/api/evaluate", eval, 200), &e)
	if e.Value || !e.Matched {
		t.Fatal("false rule result was ignored", e)
	}
	c.call("DELETE", fmt.Sprintf("%s/rules/%d", base, rule.ID), nil, 200)
	json.Unmarshal(c.call("POST", "/api/evaluate", eval, 200), &e)
	if !e.Value || e.Reason != "default" {
		t.Fatal(e)
	}
	json.Unmarshal(c.call("GET", base, nil, 200), &d)
	if len(d.History) != 7 || len(d.Rules) != 0 {
		t.Fatalf("history incomplete: %+v", d)
	}
	wanted := map[string]bool{"flag.created": false, "flag.updated": false, "flag.enabled": false, "flag.disabled": false, "rule.created": false, "rule.updated": false, "rule.deleted": false}
	for _, h := range d.History {
		wanted[h.Action] = true
		if h.Actor != "demo-admin" {
			t.Fatal(h)
		}
	}
	for action, found := range wanted {
		if !found {
			t.Error("missing action", action)
		}
	}
	var filtered []Flag
	json.Unmarshal(c.call("GET", "/api/flags?q=checkout&environment=production&enabled=true", nil, 200), &filtered)
	if len(filtered) != 1 {
		t.Fatal(filtered)
	}
}
func TestIntegrationValidationAndOwnership(t *testing.T) {
	db := testDB(t)
	server := httptest.NewServer((&App{DB: db}).routes())
	defer server.Close()
	c := testClient{t, server.URL}
	c.call("POST", "/api/flags", `{"name":`, 400)
	c.call("POST", "/api/flags", `null`, 400)
	c.call("POST", "/api/flags", strings.Repeat(" ", 66000)+"{}", 413)
	c.call("POST", "/api/flags", `{} {}`, 400)
	bad := flagBody("BAD KEY", "production")
	c.call("POST", "/api/flags", bad, 400)
	bad = flagBody("good", "production")
	bad["role"] = "admin"
	c.call("POST", "/api/flags", bad, 400)
	c.call("GET", "/api/flags/abc", nil, 400)
	c.call("GET", "/api/flags/99999", nil, 404)
	c.call("GET", "/api/flags?environment=invalid", nil, 400)
	c.call("GET", "/api/flags?enabled=1", nil, 400)
	c.call("POST", "/api/evaluate", `{"key":"missing","environment":"production","attributes":{}}`, 404)
	c.call("POST", "/api/evaluate", `{"key":"missing","environment":"production","attributes":[]}`, 400)
	c.call("POST", "/api/evaluate", `{"key":"missing","environment":"production","attributes":null}`, 400)
	var f1, f2 Flag
	json.Unmarshal(c.call("POST", "/api/flags", flagBody("first", "production"), 201), &f1)
	json.Unmarshal(c.call("POST", "/api/flags", flagBody("second", "production"), 201), &f2)
	base1 := fmt.Sprintf("/api/flags/%d", f1.ID)
	base2 := fmt.Sprintf("/api/flags/%d", f2.ID)
	var r1 Rule
	json.Unmarshal(c.call("POST", base1+"/rules", ruleBody(10), 200), &r1)
	c.call("PUT", fmt.Sprintf("%s/rules/%d", base2, r1.ID), ruleBody(20), 404)
	c.call("DELETE", fmt.Sprintf("%s/rules/%d", base2, r1.ID), nil, 404)
	badRule := ruleBody(20)
	badRule["expected"] = nil
	c.call("POST", base1+"/rules", badRule, 400)
	badRule = ruleBody(20)
	badRule["operator"] = "in"
	badRule["expected"] = []string{}
	c.call("POST", base1+"/rules", badRule, 400)
	c.call("PUT", base2, flagBody("first", "production"), 409)
	c.call("PATCH", base1+"/enabled", `{}`, 400)
}
func TestIntegrationHistoryFailureRollsBack(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	server := httptest.NewServer((&App{DB: db}).routes())
	defer server.Close()
	c := testClient{t, server.URL}
	var f Flag
	json.Unmarshal(c.call("POST", "/api/flags", flagBody("rollback", "production"), 201), &f)
	base := fmt.Sprintf("/api/flags/%d", f.ID)
	_, err := db.Exec(ctx, `CREATE FUNCTION reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test: audit write failure'; END $$; CREATE TRIGGER audit_failure BEFORE INSERT ON history FOR EACH ROW EXECUTE FUNCTION reject_audit()`)
	if err != nil {
		t.Fatal(err)
	}
	c.call("PATCH", base+"/enabled", map[string]bool{"enabled": false}, 500)
	c.call("POST", base+"/rules", ruleBody(10), 500)
	c.call("POST", "/api/flags", flagBody("rolled_back_create", "production"), 500)
	body := flagBody("rollback", "production")
	body["name"] = "must not persist"
	c.call("PUT", base, body, 500)
	var d Detail
	json.Unmarshal(c.call("GET", base, nil, 200), &d)
	if !d.Flag.Enabled || d.Flag.Name != f.Name || len(d.Rules) != 0 || len(d.History) != 1 {
		t.Fatalf("non-atomic mutation: %+v", d)
	}
	var count int
	if err = db.QueryRow(ctx, "SELECT count(*) FROM flags").Scan(&count); err != nil || count != 1 {
		t.Fatal("create not rolled back", count, err)
	}
}
func TestIntegrationConcurrentUniqueness(t *testing.T) {
	db := testDB(t)
	server := httptest.NewServer((&App{DB: db}).routes())
	defer server.Close()
	race := func(path string, body any) {
		t.Helper()
		payload, _ := json.Marshal(body)
		var wg sync.WaitGroup
		start := make(chan struct{})
		codes := make(chan int, 8)
		for i := 0; i < 8; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				<-start
				res, err := http.Post(server.URL+path, "application/json", bytes.NewReader(payload))
				if err != nil {
					codes <- 0
					return
				}
				io.Copy(io.Discard, res.Body)
				res.Body.Close()
				codes <- res.StatusCode
			}()
		}
		close(start)
		wg.Wait()
		close(codes)
		success, conflict := 0, 0
		for code := range codes {
			if code == 200 || code == 201 {
				success++
			} else if code == 409 {
				conflict++
			} else {
				t.Errorf("unexpected status %d", code)
			}
		}
		if success != 1 || conflict != 7 {
			t.Fatalf("success=%d conflict=%d", success, conflict)
		}
	}
	race("/api/flags", flagBody("concurrent", "production"))
	var id int64
	if err := db.QueryRow(context.Background(), "SELECT id FROM flags WHERE key='concurrent'").Scan(&id); err != nil {
		t.Fatal(err)
	}
	race(fmt.Sprintf("/api/flags/%d/rules", id), ruleBody(10))
	var histories int
	db.QueryRow(context.Background(), "SELECT count(*) FROM history WHERE flag_id=$1", id).Scan(&histories)
	if histories != 2 {
		t.Fatal("conflicts wrote history", histories)
	}
}
func TestIntegrationSeedIdempotent(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	if err := migrate(ctx, db, true); err != nil {
		t.Fatal(err)
	}
	if err := migrate(ctx, db, true); err != nil {
		t.Fatal(err)
	}
	for table, want := range map[string]int{"flags": 3, "rules": 2, "history": 5} {
		var count int
		if err := db.QueryRow(ctx, "SELECT count(*) FROM "+table).Scan(&count); err != nil || count != want {
			t.Fatalf("%s: %d want %d (%v)", table, count, want, err)
		}
	}
}
