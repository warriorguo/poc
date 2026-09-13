package api

import (
	"errors"
	"net/http"
	"time"

	"github.com/warriorguo/poc/server/internal/auth"
	"github.com/warriorguo/poc/server/internal/store"
)

type startTimerRequest struct {
	ProjectID string  `json:"projectId"`
	Date      string  `json:"date,omitempty"`
	Note      *string `json:"note,omitempty"`
}

type stopTimerRequest struct {
	Note *string `json:"note,omitempty"`
}

func (s *Server) handleGetTimer(w http.ResponseWriter, r *http.Request, user store.User) {
	timer, err := s.store.RunningTimer(r.Context(), user.ID)
	if errors.Is(err, store.ErrNotFound) {
		// Null rather than 404: "nothing running" is a normal state, not an error.
		s.writeJSON(w, http.StatusOK, nil)
		return
	}
	if err != nil {
		s.writeInternal(w, "read running timer", err)
		return
	}
	s.writeJSON(w, http.StatusOK, timer)
}

func (s *Server) handleStartTimer(w http.ResponseWriter, r *http.Request, user store.User) {
	var body startTimerRequest
	if err := decodeJSON(r, &body); err != nil {
		s.writeError(w, http.StatusBadRequest, codeValidation, "Send the projectId to start timing.")
		return
	}

	// The client sends its local date; the server's own date could be a day off.
	date := body.Date
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}
	if !validDate(date) {
		s.writeError(w, http.StatusBadRequest, codeValidation, "Date must be a valid ISO local date.")
		return
	}

	timer, err := s.store.StartTimer(r.Context(), user.ID, body.ProjectID, date, body.Note)
	if errors.Is(err, store.ErrTimerRunning) {
		s.writeError(w, http.StatusConflict, codeConflict,
			"A timer is already running. Stop it before starting another.")
		return
	}
	if errors.Is(err, store.ErrNotFound) {
		s.writeError(w, http.StatusNotFound, codeNotFound, "Project does not exist or is archived.")
		return
	}
	if err != nil {
		s.writeInternal(w, "start timer", err)
		return
	}
	s.writeJSON(w, http.StatusCreated, timer)
}

func (s *Server) handleStopTimer(w http.ResponseWriter, r *http.Request, user store.User) {
	var body stopTimerRequest
	if r.ContentLength > 0 {
		if err := decodeJSON(r, &body); err != nil {
			s.writeError(w, http.StatusBadRequest, codeValidation, "Send an optional note, or an empty body.")
			return
		}
	}

	id, err := auth.NewUUID()
	if err != nil {
		s.writeInternal(w, "generate activity id", err)
		return
	}

	stopped, err := s.store.StopTimer(r.Context(), id, user.ID, body.Note, time.Now())
	if errors.Is(err, store.ErrNotFound) {
		s.writeError(w, http.StatusNotFound, codeNotFound, "No timer is running.")
		return
	}
	if err != nil {
		s.writeInternal(w, "stop timer", err)
		return
	}
	s.writeJSON(w, http.StatusCreated, stopped)
}

func (s *Server) handleDiscardTimer(w http.ResponseWriter, r *http.Request, user store.User) {
	err := s.store.DiscardTimer(r.Context(), user.ID)
	if errors.Is(err, store.ErrNotFound) {
		s.writeError(w, http.StatusNotFound, codeNotFound, "No timer is running.")
		return
	}
	if err != nil {
		s.writeInternal(w, "discard timer", err)
		return
	}
	s.writeJSON(w, http.StatusNoContent, nil)
}
