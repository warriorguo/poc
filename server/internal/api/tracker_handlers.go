package api

import (
	"errors"
	"net/http"
	"regexp"
	"time"

	"github.com/warriorguo/poc/server/internal/auth"
	"github.com/warriorguo/poc/server/internal/store"
)

const maxEntryMinutes = 1440

var (
	monthPattern = regexp.MustCompile(`^\d{4}-\d{2}$`)
	datePattern  = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
)

// validDate rejects well-shaped dates that do not exist, such as 2026-02-30,
// matching isValidISODate in the frontend.
func validDate(value string) bool {
	if !datePattern.MatchString(value) {
		return false
	}
	parsed, err := time.Parse("2006-01-02", value)
	return err == nil && parsed.Format("2006-01-02") == value
}

func validMinutes(minutes int) bool {
	return minutes >= 1 && minutes <= maxEntryMinutes
}

func (s *Server) handleListProjects(w http.ResponseWriter, r *http.Request, user store.User) {
	projects, err := s.store.ListProjects(r.Context(), user.ID)
	if err != nil {
		s.writeInternal(w, "list projects", err)
		return
	}
	s.writeJSON(w, http.StatusOK, projects)
}

func (s *Server) handleMonthOverview(w http.ResponseWriter, r *http.Request, user store.User) {
	month := r.PathValue("month")
	if !monthPattern.MatchString(month) {
		s.writeError(w, http.StatusBadRequest, codeValidation, "Month must look like 2026-09.")
		return
	}

	overview, err := s.store.MonthOverview(r.Context(), user.ID, month)
	if err != nil {
		s.writeInternal(w, "month overview", err)
		return
	}
	s.writeJSON(w, http.StatusOK, overview)
}

func (s *Server) handleCreateActivity(w http.ResponseWriter, r *http.Request, user store.User) {
	var body store.CreateActivityInput
	if err := decodeJSON(r, &body); err != nil {
		s.writeError(w, http.StatusBadRequest, codeValidation, "Send a projectId, date and durationMinutes.")
		return
	}
	if !validMinutes(body.DurationMinutes) {
		s.writeError(w, http.StatusBadRequest, codeValidation, "Duration must be a whole number from 1 to 1440 minutes.")
		return
	}
	if !validDate(body.Date) {
		s.writeError(w, http.StatusBadRequest, codeValidation, "Date must be a valid ISO local date.")
		return
	}

	id, err := auth.NewUUID()
	if err != nil {
		s.writeInternal(w, "generate activity id", err)
		return
	}

	activity, err := s.store.CreateActivity(r.Context(), id, user.ID, body)
	if errors.Is(err, store.ErrNotFound) {
		s.writeError(w, http.StatusNotFound, codeNotFound, "Project does not exist or is archived.")
		return
	}
	if err != nil {
		s.writeInternal(w, "create activity", err)
		return
	}
	s.writeJSON(w, http.StatusCreated, activity)
}

func (s *Server) handleCreatePlan(w http.ResponseWriter, r *http.Request, user store.User) {
	var body store.CreatePlanInput
	if err := decodeJSON(r, &body); err != nil {
		s.writeError(w, http.StatusBadRequest, codeValidation, "Send a projectId, date and plannedMinutes.")
		return
	}
	if !validMinutes(body.PlannedMinutes) {
		s.writeError(w, http.StatusBadRequest, codeValidation, "Duration must be a whole number from 1 to 1440 minutes.")
		return
	}
	if !validDate(body.Date) {
		s.writeError(w, http.StatusBadRequest, codeValidation, "Date must be a valid ISO local date.")
		return
	}

	id, err := auth.NewUUID()
	if err != nil {
		s.writeInternal(w, "generate plan id", err)
		return
	}

	plan, err := s.store.CreatePlan(r.Context(), id, user.ID, body)
	if errors.Is(err, store.ErrNotFound) {
		s.writeError(w, http.StatusNotFound, codeNotFound, "Project does not exist or is archived.")
		return
	}
	if err != nil {
		s.writeInternal(w, "create plan", err)
		return
	}
	s.writeJSON(w, http.StatusCreated, plan)
}
