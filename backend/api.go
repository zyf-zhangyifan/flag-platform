package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type App struct{ DB *pgxpool.Pool }
type apiError struct {
	Status  int
	Message string
}

func (e apiError) Error() string { return e.Message }
func invalid(s string) error     { return apiError{400, s} }
func send(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, err error) {
	status, message := 500, "服务暂时不可用，请稍后重试"
	var appErr apiError
	var pgErr *pgconn.PgError
	switch {
	case errors.As(err, &appErr):
		status, message = appErr.Status, appErr.Message
	case errors.Is(err, pgx.ErrNoRows):
		status, message = 404, "资源不存在"
	case errors.As(err, &pgErr):
		if pgErr.Code == "23505" {
			status = 409
			message = "同一环境下 Key 已存在，或该 Flag 的规则优先级重复"
		}
		if pgErr.Code == "23514" || pgErr.Code == "22021" || pgErr.Code == "22P05" {
			status, message = 400, "输入不符合数据库约束"
		}
	}
	if status == 500 {
		log.Printf("request error: %v", err)
	}
	send(w, status, map[string]any{"error": message})
}
func decode(w http.ResponseWriter, r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 65536)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	dec.UseNumber()
	if err := dec.Decode(v); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			return apiError{413, "请求体不能超过 64 KiB"}
		}
		return invalid("JSON 格式或字段类型错误：" + err.Error())
	}
	var extra any
	if err := dec.Decode(&extra); err != io.EOF {
		return invalid("请求体只能包含一个 JSON 对象")
	}
	return nil
}
func pathID(r *http.Request, key string) (int64, error) {
	id, err := strconv.ParseInt(r.PathValue(key), 10, 64)
	if err != nil || id < 1 {
		return 0, invalid("ID 必须为正整数")
	}
	return id, nil
}
func (a *App) routes() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := a.DB.Ping(ctx); err != nil {
			send(w, 503, map[string]string{"error": "数据库不可用"})
			return
		}
		send(w, 200, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /api/flags", a.list)
	mux.HandleFunc("POST /api/flags", a.create)
	mux.HandleFunc("GET /api/flags/{id}", a.detail)
	mux.HandleFunc("PUT /api/flags/{id}", a.update)
	mux.HandleFunc("PATCH /api/flags/{id}/enabled", a.toggle)
	mux.HandleFunc("POST /api/flags/{id}/rules", a.saveRule)
	mux.HandleFunc("PUT /api/flags/{id}/rules/{ruleID}", a.saveRule)
	mux.HandleFunc("DELETE /api/flags/{id}/rules/{ruleID}", a.deleteRule)
	mux.HandleFunc("POST /api/evaluate", a.eval)
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		send(w, 404, map[string]string{"error": "API 不存在"})
	})
	return mux
}
func (a *App) list(w http.ResponseWriter, r *http.Request) {
	env := r.URL.Query().Get("environment")
	enabled := r.URL.Query().Get("enabled")
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if env != "" && !validEnvironment(env) {
		fail(w, invalid("环境无效"))
		return
	}
	if enabled != "" && enabled != "true" && enabled != "false" {
		fail(w, invalid("enabled 只能为 true 或 false"))
		return
	}
	rows, err := a.DB.Query(r.Context(), "SELECT "+flagCols+" FROM flags WHERE ($1='' OR environment=$1) AND ($2='' OR enabled::text=$2) AND ($3='' OR strpos(lower(name),lower($3))>0 OR strpos(lower(key),lower($3))>0) ORDER BY updated_at DESC,id DESC", env, enabled, q)
	if err != nil {
		fail(w, err)
		return
	}
	defer rows.Close()
	flags := []Flag{}
	for rows.Next() {
		f, err := scanFlag(rows)
		if err != nil {
			fail(w, err)
			return
		}
		flags = append(flags, f)
	}
	if err = rows.Err(); err != nil {
		fail(w, err)
		return
	}
	send(w, 200, flags)
}
func (a *App) create(w http.ResponseWriter, r *http.Request) {
	var in FlagInput
	if err := decode(w, r, &in); err != nil {
		fail(w, err)
		return
	}
	if err := in.validate(); err != nil {
		fail(w, invalid(err.Error()))
		return
	}
	ctx := r.Context()
	tx, err := a.DB.Begin(ctx)
	if err != nil {
		fail(w, err)
		return
	}
	defer tx.Rollback(ctx)
	f, err := scanFlag(tx.QueryRow(ctx, "INSERT INTO flags(name,key,environment,description,enabled,default_value) VALUES($1,$2,$3,$4,$5,$6) RETURNING "+flagCols, in.Name, in.Key, in.Environment, in.Description, *in.Enabled, *in.DefaultValue))
	if err == nil {
		err = audit(ctx, tx, f.ID, "flag.created", "创建 Flag："+f.Name, nil, f)
	}
	if err == nil {
		err = tx.Commit(ctx)
	}
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 201, f)
}
func (a *App) detail(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, err)
		return
	}
	ctx := r.Context()
	tx, err := a.DB.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		fail(w, err)
		return
	}
	defer tx.Rollback(ctx)
	f, err := scanFlag(tx.QueryRow(ctx, "SELECT "+flagCols+" FROM flags WHERE id=$1", id))
	if err != nil {
		fail(w, err)
		return
	}
	rules, err := readRules(ctx, tx, id)
	if err != nil {
		fail(w, err)
		return
	}
	rows, err := tx.Query(ctx, "SELECT id,action,actor,summary,changes,created_at FROM history WHERE flag_id=$1 ORDER BY created_at DESC,id DESC", id)
	if err != nil {
		fail(w, err)
		return
	}
	history := []History{}
	for rows.Next() {
		var h History
		err = rows.Scan(&h.ID, &h.Action, &h.Actor, &h.Summary, &h.Changes, &h.CreatedAt)
		if err != nil {
			rows.Close()
			fail(w, err)
			return
		}
		history = append(history, h)
	}
	err = rows.Err()
	rows.Close()
	if err == nil {
		err = tx.Commit(ctx)
	}
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, Detail{f, rules, history})
}
func (a *App) update(w http.ResponseWriter, r *http.Request) {
	var in FlagInput
	if err := decode(w, r, &in); err != nil {
		fail(w, err)
		return
	}
	if err := in.validate(); err != nil {
		fail(w, invalid(err.Error()))
		return
	}
	a.mutate(w, r, func(ctx context.Context, tx pgx.Tx, before Flag) (any, error) {
		if before.Name == in.Name && before.Key == in.Key && before.Environment == in.Environment && before.Description == in.Description && before.Enabled == *in.Enabled && before.DefaultValue == *in.DefaultValue {
			return before, nil
		}
		after, err := scanFlag(tx.QueryRow(ctx, "UPDATE flags SET name=$2,key=$3,environment=$4,description=$5,enabled=$6,default_value=$7,updated_at=clock_timestamp() WHERE id=$1 RETURNING "+flagCols, before.ID, in.Name, in.Key, in.Environment, in.Description, *in.Enabled, *in.DefaultValue))
		if err != nil {
			return nil, err
		}
		if before.Name != after.Name || before.Key != after.Key || before.Environment != after.Environment || before.Description != after.Description || before.DefaultValue != after.DefaultValue {
			if err = audit(ctx, tx, before.ID, "flag.updated", "修改 Flag 基本信息", before, after); err != nil {
				return nil, err
			}
		}
		if before.Enabled != after.Enabled {
			err = auditEnabled(ctx, tx, before, after)
		}
		return after, err
	})
}
func auditEnabled(ctx context.Context, tx pgx.Tx, before, after Flag) error {
	action, summary := "flag.disabled", "停用 Flag"
	if after.Enabled {
		action, summary = "flag.enabled", "启用 Flag"
	}
	return audit(ctx, tx, before.ID, action, summary, before, after)
}
func (a *App) toggle(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Enabled *bool `json:"enabled"`
	}
	if err := decode(w, r, &in); err != nil {
		fail(w, err)
		return
	}
	if in.Enabled == nil {
		fail(w, invalid("enabled 必须为布尔值"))
		return
	}
	a.mutate(w, r, func(ctx context.Context, tx pgx.Tx, before Flag) (any, error) {
		if before.Enabled == *in.Enabled {
			return before, nil
		}
		after, err := scanFlag(tx.QueryRow(ctx, "UPDATE flags SET enabled=$2,updated_at=clock_timestamp() WHERE id=$1 RETURNING "+flagCols, before.ID, *in.Enabled))
		if err == nil {
			err = auditEnabled(ctx, tx, before, after)
		}
		return after, err
	})
}
func (a *App) mutate(w http.ResponseWriter, r *http.Request, fn func(context.Context, pgx.Tx, Flag) (any, error)) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, err)
		return
	}
	ctx := r.Context()
	tx, err := a.DB.Begin(ctx)
	if err != nil {
		fail(w, err)
		return
	}
	defer tx.Rollback(ctx)
	before, err := scanFlag(tx.QueryRow(ctx, "SELECT "+flagCols+" FROM flags WHERE id=$1 FOR UPDATE", id))
	if err != nil {
		fail(w, err)
		return
	}
	result, err := fn(ctx, tx, before)
	if err == nil {
		err = tx.Commit(ctx)
	}
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, result)
}
func (a *App) saveRule(w http.ResponseWriter, r *http.Request) {
	var in RuleInput
	if err := decode(w, r, &in); err != nil {
		fail(w, err)
		return
	}
	if err := in.validate(); err != nil {
		fail(w, invalid(err.Error()))
		return
	}
	var rid int64
	var err error
	if r.Method == "PUT" {
		rid, err = pathID(r, "ruleID")
		if err != nil {
			fail(w, err)
			return
		}
	}
	a.mutate(w, r, func(ctx context.Context, tx pgx.Tx, f Flag) (any, error) {
		var before any
		var after Rule
		action := "rule.created"
		summary := "添加规则"
		if rid != 0 {
			old, err := scanRule(tx.QueryRow(ctx, "SELECT "+ruleCols+" FROM rules WHERE id=$1 AND flag_id=$2", rid, f.ID))
			if err != nil {
				return nil, err
			}
			before = old
			after, err = scanRule(tx.QueryRow(ctx, "UPDATE rules SET attribute=$3,operator=$4,expected=$5,result=$6,priority=$7 WHERE id=$1 AND flag_id=$2 RETURNING "+ruleCols, rid, f.ID, in.Attribute, in.Operator, in.Expected, *in.Result, *in.Priority))
			action = "rule.updated"
			summary = "修改规则"
		} else {
			after, err = scanRule(tx.QueryRow(ctx, "INSERT INTO rules(flag_id,attribute,operator,expected,result,priority) VALUES($1,$2,$3,$4,$5,$6) RETURNING "+ruleCols, f.ID, in.Attribute, in.Operator, in.Expected, *in.Result, *in.Priority))
		}
		if err != nil {
			return nil, err
		}
		if _, err = tx.Exec(ctx, "UPDATE flags SET updated_at=clock_timestamp() WHERE id=$1", f.ID); err != nil {
			return nil, err
		}
		err = audit(ctx, tx, f.ID, action, fmt.Sprintf("%s #%d：%s %s %s → %t（优先级 %d）", summary, after.ID, after.Attribute, after.Operator, string(after.Expected), after.Result, after.Priority), before, after)
		return after, err
	})
}
func (a *App) deleteRule(w http.ResponseWriter, r *http.Request) {
	rid, err := pathID(r, "ruleID")
	if err != nil {
		fail(w, err)
		return
	}
	a.mutate(w, r, func(ctx context.Context, tx pgx.Tx, f Flag) (any, error) {
		before, err := scanRule(tx.QueryRow(ctx, "DELETE FROM rules WHERE id=$1 AND flag_id=$2 RETURNING "+ruleCols, rid, f.ID))
		if err != nil {
			return nil, err
		}
		if _, err = tx.Exec(ctx, "UPDATE flags SET updated_at=clock_timestamp() WHERE id=$1", f.ID); err != nil {
			return nil, err
		}
		err = audit(ctx, tx, f.ID, "rule.deleted", fmt.Sprintf("删除规则 #%d（优先级 %d）", rid, before.Priority), before, nil)
		return map[string]bool{"deleted": true}, err
	})
}
func (a *App) eval(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Key         string         `json:"key"`
		Environment string         `json:"environment"`
		Attributes  map[string]any `json:"attributes"`
	}
	if err := decode(w, r, &in); err != nil {
		fail(w, err)
		return
	}
	if !keyPattern.MatchString(in.Key) || !validEnvironment(in.Environment) || in.Attributes == nil {
		fail(w, invalid("请输入有效 Key、环境和 JSON 对象类型的用户属性（不能是 null 或数组）"))
		return
	}
	ctx := r.Context()
	tx, err := a.DB.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		fail(w, err)
		return
	}
	defer tx.Rollback(ctx)
	f, err := scanFlag(tx.QueryRow(ctx, "SELECT "+flagCols+" FROM flags WHERE key=$1 AND environment=$2", in.Key, in.Environment))
	if err != nil {
		fail(w, err)
		return
	}
	rules, err := readRules(ctx, tx, f.ID)
	if err == nil {
		err = tx.Commit(ctx)
	}
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, evaluate(f, rules, in.Attributes))
}
