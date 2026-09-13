// Package api exposes the tracker and auth endpoints over HTTP.
package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/warriorguo/poc/server/internal/store"
)

const sessionTTL = 30 * 24 * time.Hour

type Server struct {
	store  *store.Store
	logger *slog.Logger
	// secureCookies is off for plain-HTTP local development; the deployed
	// service runs behind TLS and sets it.
	secureCookies bool
}

func New(st *store.Store, logger *slog.Logger, secureCookies bool) *Server {
	return &Server{store: st, logger: logger, secureCookies: secureCookies}
}

// errorCode mirrors TrackerApiError's codes in src/api/tracker-api.ts so the
// frontend keeps its existing error handling.
type errorCode string

const (
	codeValidation      errorCode = "VALIDATION"
	codeNotFound        errorCode = "NOT_FOUND"
	codeUnauthenticated errorCode = "UNAUTHENTICATED"
	codeConflict        errorCode = "CONFLICT"
	codeUnknown         errorCode = "UNKNOWN"
)

type errorBody struct {
	Code    errorCode `json:"code"`
	Message string    `json:"message"`
}

func (s *Server) writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if payload == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		s.logger.Error("write response", "error", err)
	}
}

func (s *Server) writeError(w http.ResponseWriter, status int, code errorCode, message string) {
	s.writeJSON(w, status, map[string]errorBody{"error": {Code: code, Message: message}})
}

// writeInternal logs the cause and returns a message that leaks nothing.
func (s *Server) writeInternal(w http.ResponseWriter, context string, err error) {
	s.logger.Error(context, "error", err)
	s.writeError(w, http.StatusInternalServerError, codeUnknown, "Something went wrong. Please try again.")
}

func decodeJSON(r *http.Request, target any) error {
	decoder := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 64*1024))
	decoder.DisallowUnknownFields()
	return decoder.Decode(target)
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("POST /api/auth/register", s.handleRegister)
	mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	mux.HandleFunc("POST /api/auth/logout", s.handleLogout)
	mux.HandleFunc("GET /api/auth/me", s.handleMe)

	mux.Handle("GET /api/projects", s.requireUser(s.handleListProjects))
	mux.Handle("GET /api/months/{month}", s.requireUser(s.handleMonthOverview))
	mux.Handle("POST /api/activities", s.requireUser(s.handleCreateActivity))
	mux.Handle("POST /api/plans", s.requireUser(s.handleCreatePlan))

	mux.HandleFunc("GET /api/healthz", s.handleHealth)

	return s.withRecovery(s.withNoStore(mux))
}

// withNoStore keeps authenticated responses out of shared caches.
func (s *Server) withNoStore(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

func (s *Server) withRecovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				s.logger.Error("panic serving request", "path", r.URL.Path, "panic", recovered)
				s.writeError(w, http.StatusInternalServerError, codeUnknown, "Something went wrong. Please try again.")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if err := s.store.Ping(r.Context()); err != nil {
		s.writeError(w, http.StatusServiceUnavailable, codeUnknown, "database unavailable")
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func trimmedLower(value string) string { return strings.ToLower(strings.TrimSpace(value)) }
