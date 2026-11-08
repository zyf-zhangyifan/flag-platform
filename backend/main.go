package main

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5/pgxpool"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func env(key, fallback string) string {
	if s := os.Getenv(key); s != "" {
		return s
	}
	return fallback
}
func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	db, err := pgxpool.New(ctx, env("DATABASE_URL", "postgres://flagstudio:flagstudio@localhost:5432/flagstudio?sslmode=disable"))
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	setup, cancel := context.WithTimeout(ctx, 30*time.Second)
	err = migrate(setup, db, env("SEED_DEMO", "false") == "true")
	cancel()
	if err != nil {
		log.Fatalf("database setup: %v", err)
	}
	app := &App{DB: db}
	staticDir := env("STATIC_DIR", "../web/dist")
	mux := app.handler(staticDir)
	server := &http.Server{Addr: env("HTTP_ADDR", "127.0.0.1:8080"), Handler: mux, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 20 * time.Second, IdleTimeout: 60 * time.Second}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		server.Shutdown(shutdown)
	}()
	log.Printf("Flag Studio listening on %s", server.Addr)
	if err = server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func (a *App) handler(staticDir string) http.Handler {
	mux := a.routes()
	files := http.FileServer(http.Dir(staticDir))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			send(w, http.StatusMethodNotAllowed, map[string]string{"error": "不支持的请求方法"})
			return
		}
		files.ServeHTTP(w, r)
	})
	return mux
}
