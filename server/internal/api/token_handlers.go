package api

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/warriorguo/poc/server/internal/auth"
	"github.com/warriorguo/poc/server/internal/store"
)

const maxTokenNameLength = 80

type createTokenRequest struct {
	Name string `json:"name"`
	// ExpiresInDays 0 means the token does not expire.
	ExpiresInDays int `json:"expiresInDays,omitempty"`
}

type createTokenResponse struct {
	store.APIToken
	// Token is returned exactly once, at creation, and never stored in plaintext.
	Token string `json:"token"`
}

// requireSession is stricter than requireUser: token management is reachable
// only with a session cookie, so a leaked API token cannot mint further tokens
// or revoke the ones that would reveal it.
func (s *Server) requireSession(next func(http.ResponseWriter, *http.Request, store.User)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, ok := s.userFromCookie(r)
		if !ok {
			s.writeError(w, http.StatusUnauthorized, codeUnauthenticated,
				"Sign in with your password to manage API tokens.")
			return
		}
		next(w, r, user)
	})
}

func (s *Server) handleCreateToken(w http.ResponseWriter, r *http.Request, user store.User) {
	var body createTokenRequest
	if err := decodeJSON(r, &body); err != nil {
		s.writeError(w, http.StatusBadRequest, codeValidation, "Send a name for the token.")
		return
	}

	name := strings.TrimSpace(body.Name)
	if name == "" || len(name) > maxTokenNameLength {
		s.writeError(w, http.StatusBadRequest, codeValidation,
			"Give the token a name of 1 to 80 characters, so you can tell them apart later.")
		return
	}
	if body.ExpiresInDays < 0 {
		s.writeError(w, http.StatusBadRequest, codeValidation, "expiresInDays cannot be negative.")
		return
	}

	var expiresAt *time.Time
	if body.ExpiresInDays > 0 {
		moment := time.Now().AddDate(0, 0, body.ExpiresInDays)
		expiresAt = &moment
	}

	secret, hash, prefix, err := auth.NewAPIToken()
	if err != nil {
		s.writeInternal(w, "generate api token", err)
		return
	}
	id, err := auth.NewUUID()
	if err != nil {
		s.writeInternal(w, "generate token id", err)
		return
	}

	token, err := s.store.CreateAPIToken(r.Context(), id, user.ID, name, hash, prefix, expiresAt)
	if err != nil {
		s.writeInternal(w, "create api token", err)
		return
	}

	s.writeJSON(w, http.StatusCreated, createTokenResponse{APIToken: token, Token: secret})
}

func (s *Server) handleListTokens(w http.ResponseWriter, r *http.Request, user store.User) {
	tokens, err := s.store.ListAPITokens(r.Context(), user.ID)
	if err != nil {
		s.writeInternal(w, "list api tokens", err)
		return
	}
	s.writeJSON(w, http.StatusOK, tokens)
}

func (s *Server) handleDeleteToken(w http.ResponseWriter, r *http.Request, user store.User) {
	err := s.store.DeleteAPIToken(r.Context(), user.ID, r.PathValue("id"))
	if errors.Is(err, store.ErrNotFound) {
		s.writeError(w, http.StatusNotFound, codeNotFound, "That token does not exist.")
		return
	}
	if err != nil {
		s.writeInternal(w, "delete api token", err)
		return
	}
	s.writeJSON(w, http.StatusNoContent, nil)
}
