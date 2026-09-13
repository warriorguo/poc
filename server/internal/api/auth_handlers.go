package api

import (
	"context"
	"errors"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/warriorguo/poc/server/internal/auth"
	"github.com/warriorguo/poc/server/internal/store"
)

type contextKey struct{}

var userKey contextKey

type credentials struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type accountResponse struct {
	Email string `json:"email"`
}

func (s *Server) setSessionCookie(w http.ResponseWriter, token string, expiresAt time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     auth.SessionCookie,
		Value:    token,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: true,
		Secure:   s.secureCookies,
		SameSite: http.SameSiteLaxMode,
	})
}

func (s *Server) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     auth.SessionCookie,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   s.secureCookies,
		SameSite: http.SameSiteLaxMode,
	})
}

func (s *Server) startSession(w http.ResponseWriter, r *http.Request, userID string) error {
	token, err := auth.NewSessionToken()
	if err != nil {
		return err
	}
	expiresAt := time.Now().Add(sessionTTL)
	if err := s.store.CreateSession(r.Context(), token, userID, expiresAt); err != nil {
		return err
	}
	s.setSessionCookie(w, token, expiresAt)
	return nil
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var body credentials
	if err := decodeJSON(r, &body); err != nil {
		s.writeError(w, http.StatusBadRequest, codeValidation, "Send an email and a password.")
		return
	}

	email := trimmedLower(body.Email)
	if _, err := mail.ParseAddress(email); err != nil {
		s.writeError(w, http.StatusBadRequest, codeValidation, "Enter a valid email address.")
		return
	}
	if err := auth.ValidatePassword(body.Password); err != nil {
		s.writeError(w, http.StatusBadRequest, codeValidation, "Use a password of at least 10 characters.")
		return
	}

	hash, err := auth.HashPassword(body.Password)
	if err != nil {
		s.writeInternal(w, "hash password", err)
		return
	}
	id, err := auth.NewUUID()
	if err != nil {
		s.writeInternal(w, "generate user id", err)
		return
	}

	user, err := s.store.CreateUser(r.Context(), id, email, hash)
	if errors.Is(err, store.ErrConflict) {
		s.writeError(w, http.StatusConflict, codeConflict, "That email is already registered.")
		return
	}
	if err != nil {
		s.writeInternal(w, "create user", err)
		return
	}

	if err := s.startSession(w, r, user.ID); err != nil {
		s.writeInternal(w, "start session", err)
		return
	}
	s.writeJSON(w, http.StatusCreated, accountResponse{Email: user.Email})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body credentials
	if err := decodeJSON(r, &body); err != nil {
		s.writeError(w, http.StatusBadRequest, codeValidation, "Send an email and a password.")
		return
	}

	user, err := s.store.UserByEmail(r.Context(), body.Email)
	if errors.Is(err, store.ErrNotFound) {
		// Spend the same time as a real comparison so an unknown address is
		// not distinguishable from a wrong password by timing.
		auth.BurnPasswordTime(body.Password)
		s.writeError(w, http.StatusUnauthorized, codeUnauthenticated, "That email and password do not match.")
		return
	}
	if err != nil {
		s.writeInternal(w, "look up user", err)
		return
	}

	if !auth.CheckPassword(user.PasswordHash, body.Password) {
		s.writeError(w, http.StatusUnauthorized, codeUnauthenticated, "That email and password do not match.")
		return
	}

	if err := s.startSession(w, r, user.ID); err != nil {
		s.writeInternal(w, "start session", err)
		return
	}
	s.writeJSON(w, http.StatusOK, accountResponse{Email: user.Email})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(auth.SessionCookie); err == nil {
		if err := s.store.DeleteSession(r.Context(), cookie.Value); err != nil {
			s.logger.Error("delete session", "error", err)
		}
	}
	s.clearSessionCookie(w)
	s.writeJSON(w, http.StatusNoContent, nil)
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	user, ok := s.currentUser(r)
	if !ok {
		s.writeError(w, http.StatusUnauthorized, codeUnauthenticated, "Sign in to continue.")
		return
	}
	s.writeJSON(w, http.StatusOK, accountResponse{Email: user.Email})
}

// userFromCookie resolves a browser session only.
func (s *Server) userFromCookie(r *http.Request) (store.User, bool) {
	cookie, err := r.Cookie(auth.SessionCookie)
	if err != nil || cookie.Value == "" {
		return store.User{}, false
	}
	user, err := s.store.UserBySession(r.Context(), cookie.Value)
	if err != nil {
		return store.User{}, false
	}
	return user, true
}

// bearerToken extracts a token from the Authorization header.
func bearerToken(r *http.Request) string {
	header := r.Header.Get("Authorization")
	if len(header) < 7 || !strings.EqualFold(header[:7], "bearer ") {
		return ""
	}
	return strings.TrimSpace(header[7:])
}

// currentUser accepts either a personal API token or a browser session. The
// token is tried first so an agent's explicit credential always wins over a
// cookie that a browser may have attached incidentally.
func (s *Server) currentUser(r *http.Request) (store.User, bool) {
	if secret := bearerToken(r); secret != "" {
		user, err := s.store.UserByAPIToken(r.Context(), auth.HashAPIToken(secret))
		if err != nil {
			return store.User{}, false
		}
		return user, true
	}
	return s.userFromCookie(r)
}

// requireUser rejects anonymous callers before the handler runs, so no data
// handler can forget the check.
func (s *Server) requireUser(next func(http.ResponseWriter, *http.Request, store.User)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, ok := s.currentUser(r)
		if !ok {
			// Only clear the cookie for a cookie-based caller: an agent sending
			// a bad bearer token has no session to invalidate.
			if bearerToken(r) == "" {
				s.clearSessionCookie(w)
			}
			s.writeError(w, http.StatusUnauthorized, codeUnauthenticated, "Sign in to continue.")
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), userKey, user)), user)
	})
}
