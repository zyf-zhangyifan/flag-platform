package main

import (
	"context"
	"embed"
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql seeds/*.sql
var sqlFiles embed.FS

func migrate(ctx context.Context, db *pgxpool.Pool, seed bool) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(73682109)"); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"); err != nil {
		return err
	}
	var done bool
	if err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version='001')").Scan(&done); err != nil {
		return err
	}
	if !done {
		data, _ := sqlFiles.ReadFile("migrations/001_schema.sql")
		if _, err = tx.Exec(ctx, string(data)); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, "INSERT INTO schema_migrations(version) VALUES ('001')"); err != nil {
			return err
		}
	}
	if seed {
		data, _ := sqlFiles.ReadFile("seeds/demo.sql")
		if _, err = tx.Exec(ctx, string(data)); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

const flagCols = "id,name,key,environment,enabled,default_value,created_at,updated_at"
const ruleCols = "id,flag_id,attribute,operator,expected,result,priority"

type scanner interface{ Scan(...any) error }

func scanFlag(row scanner) (f Flag, err error) {
	err = row.Scan(&f.ID, &f.Name, &f.Key, &f.Environment, &f.Enabled, &f.DefaultValue, &f.CreatedAt, &f.UpdatedAt)
	return
}
func scanRule(row scanner) (r Rule, err error) {
	err = row.Scan(&r.ID, &r.FlagID, &r.Attribute, &r.Operator, &r.Expected, &r.Result, &r.Priority)
	return
}

type queryer interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

func readRules(ctx context.Context, q queryer, id int64) ([]Rule, error) {
	rows, err := q.Query(ctx, "SELECT "+ruleCols+" FROM rules WHERE flag_id=$1 ORDER BY priority", id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	rules := []Rule{}
	for rows.Next() {
		r, err := scanRule(rows)
		if err != nil {
			return nil, err
		}
		rules = append(rules, r)
	}
	return rules, rows.Err()
}
func audit(ctx context.Context, tx pgx.Tx, flagID int64, action, summary string, before, after any) error {
	raw, err := json.Marshal(map[string]any{"before": before, "after": after})
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, "INSERT INTO history(flag_id,action,summary,changes) VALUES($1,$2,$3,$4)", flagID, action, summary, raw)
	return err
}
